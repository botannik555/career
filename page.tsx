import { pool } from '@/lib/db';
import { BUDGET_BY_PLAN } from '@/lib/ai/cost';

export const dynamic = 'force-dynamic';

/** Цены тарифов, USD/мес. Держим рядом с BUDGET_BY_PLAN из cost.ts. */
const PRICE: Record<string, number> = { free: 0, pro: 19.99, premium: 39.99, hunter: 89 };

const usd = (n: number) => `$${n.toFixed(2)}`;

async function load() {
  const [plans, byAction, top, jobs, agents, infra] = await Promise.all([
    pool.query(`SELECT plan, count(*)::int AS n FROM users GROUP BY plan`),
    pool.query(
      `SELECT action, model, count(*)::int AS calls, sum(cost_usd)::float AS usd
         FROM ai_usage WHERE created_at >= date_trunc('month', now())
        GROUP BY 1,2 ORDER BY usd DESC`),
    pool.query(
      `SELECT u.email, u.plan, COALESCE(s.spent_usd,0)::float AS spent
         FROM users u LEFT JOIN ai_usage_current_month s ON s.user_id = u.id
        ORDER BY spent DESC LIMIT 10`),
    pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE first_seen_at > now() - interval '24 hours')::int AS fresh,
              count(*) FILTER (WHERE canonical_id IS NOT NULL)::int AS dupes,
              count(*) FILTER (WHERE embedding IS NULL AND is_active)::int AS unindexed
         FROM jobs`),
    pool.query(
      `SELECT count(*) FILTER (WHERE active)::int AS active,
              max(last_run_at) AS last_run FROM search_agents`),
    pool.query(`SELECT count(*)::int AS matches FROM matches
                 WHERE created_at >= date_trunc('month', now())`),
  ]);

  const revenue = plans.rows.reduce((s, r) => s + (PRICE[r.plan] ?? 0) * r.n, 0);
  const aiCost = byAction.rows.reduce((s, r) => s + r.usd, 0);
  const users = plans.rows.reduce((s, r) => s + r.n, 0);
  const paying = plans.rows.filter((r) => r.plan !== 'free').reduce((s, r) => s + r.n, 0);

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projected = aiCost / dayOfMonth * daysInMonth;

  return {
    revenue, aiCost, projected, users, paying,
    byAction: byAction.rows, top: top.rows,
    jobs: jobs.rows[0], agents: agents.rows[0], matches: infra.rows[0].matches,
  };
}

export default async function Admin() {
  const d = await load();

  // Шкала линии сгорания: выручка или прогноз — что больше, иначе полоса упрётся.
  const scale = Math.max(d.revenue, d.projected, 1);
  const pct = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;

  return (
    <div className="wrap">
      <div className="topbar">
        <h1>Панель управления</h1>
        <span className="period">
          {new Date().toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}
        </span>
      </div>

      <p className="eyebrow">Выручка и себестоимость за месяц</p>
      <div className="burn">
        <div className="burn-head">
          <span className="burn-revenue">{usd(d.revenue)}</span>
          <span className="burn-label">
            выручка · потрачено на AI {usd(d.aiCost)}
            {d.revenue > 0 && ` · маржа ${(((d.revenue - d.aiCost) / d.revenue) * 100).toFixed(1)}%`}
          </span>
        </div>

        <div className="bar">
          <span className="seg-ai" style={{ width: pct(d.aiCost) }} />
          <span
            className="projection"
            style={{ left: pct(d.projected) }}
            data-label={`прогноз ${usd(d.projected)}`}
          />
        </div>

        <div className="legend">
          <span><i className="dot" style={{ background: 'var(--ink)' }} />AI <b>{usd(d.aiCost)}</b></span>
          <span>прогноз к концу месяца <b>{usd(d.projected)}</b></span>
          <span>на платящего <b>{d.paying ? usd(d.aiCost / d.paying) : '—'}</b></span>
        </div>
      </div>

      <p className="eyebrow">Состояние системы</p>
      <div className="grid">
        <div className="stat">
          <div className="k">Пользователи</div>
          <div className="v">{d.users}</div>
          <div className="sub">{d.paying} платящих</div>
        </div>
        <div className="stat">
          <div className="k">Вакансии в базе</div>
          <div className="v">{d.jobs.total}</div>
          <div className="sub">+{d.jobs.fresh} за сутки · {d.jobs.dupes} дублей склеено</div>
        </div>
        <div className="stat">
          <div className="k">Не проиндексировано</div>
          <div className="v" style={{ color: d.jobs.unindexed > 200 ? 'var(--warn)' : undefined }}>
            {d.jobs.unindexed}
          </div>
          <div className="sub">{d.jobs.unindexed > 200 ? 'воркер не успевает' : 'очередь в норме'}</div>
        </div>
        <div className="stat">
          <div className="k">Последний обход</div>
          <div className="v" style={{ fontSize: 16 }}>
            {d.agents.last_run
              ? new Date(d.agents.last_run).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
              : '—'}
          </div>
          <div className="sub">{d.agents.active} активных агентов</div>
        </div>
      </div>

      <p className="eyebrow">Куда уходят деньги</p>
      {d.byAction.length === 0 ? (
        <table><tbody><tr><td className="empty">
          Пока ни одного вызова. Строки появятся после первого разбора резюме.
        </td></tr></tbody></table>
      ) : (
        <table>
          <thead>
            <tr><th>Действие</th><th>Модель</th><th style={{ textAlign: 'right' }}>Вызовов</th>
                <th style={{ textAlign: 'right' }}>Стоимость</th>
                <th style={{ textAlign: 'right' }}>За вызов</th></tr>
          </thead>
          <tbody>
            {d.byAction.map((r: any) => (
              <tr key={r.action + r.model}>
                <td>{r.action}</td>
                <td style={{ color: 'var(--ink-2)' }}>{r.model}</td>
                <td className="num">{r.calls}</td>
                <td className="num">{usd(r.usd)}</td>
                <td className="num" style={{ color: 'var(--ink-2)' }}>{usd(r.usd / r.calls)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="eyebrow">Пользователи у лимита</p>
      {d.top.length === 0 ? (
        <table><tbody><tr><td className="empty">Пользователей пока нет.</td></tr></tbody></table>
      ) : (
        <table>
          <thead>
            <tr><th>Почта</th><th>Тариф</th><th style={{ textAlign: 'right' }}>Потрачено</th>
                <th style={{ textAlign: 'right' }}>Лимит</th><th>Статус</th></tr>
          </thead>
          <tbody>
            {d.top.map((u: any) => {
              const limit = BUDGET_BY_PLAN[u.plan] ?? 0;
              const share = limit ? u.spent / limit : 0;
              const cls = share >= 1 ? 'state-alert' : share >= 0.7 ? 'state-warn' : 'state-ok';
              const label = share >= 1 ? 'лимит исчерпан' : share >= 0.7 ? 'близко к лимиту' : 'в норме';
              return (
                <tr key={u.email}>
                  <td>{u.email}</td>
                  <td style={{ color: 'var(--ink-2)' }}>{u.plan}</td>
                  <td className="num">{usd(u.spent)}</td>
                  <td className="num" style={{ color: 'var(--ink-3)' }}>{usd(limit)}</td>
                  <td className={`state ${cls}`}>{label}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
