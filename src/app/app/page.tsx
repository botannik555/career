import { redirect } from 'next/navigation';
import { pool } from '@/lib/db';
import { currentUser } from '@/lib/user';
import { BUDGET_BY_PLAN } from '@/lib/ai/cost';
import AgentForm from './AgentForm';
import ResetAgent from './ResetAgent';
import '../app.css';

export const dynamic = 'force-dynamic';

const money = (n: number | null, cur: string | null) =>
  n ? `${n.toLocaleString('ru-RU')} ${cur === 'RUR' ? '₽' : cur ?? ''}` : null;

export default async function Cabinet() {
  const user = await currentUser();
  if (!user) redirect('/login');

  const [profile, agents, matches, usage] = await Promise.all([
    pool.query(
      `SELECT id, data FROM profiles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [user.id]),
    pool.query(
      `SELECT id, name, query, last_run_at FROM search_agents
        WHERE user_id = $1 AND active ORDER BY id`, [user.id]),
    pool.query(
      `SELECT m.score, m.explanation, m.missing, j.title, j.company, j.url,
              j.salary_from, j.salary_to, j.currency, j.area, j.schedule
         FROM matches m JOIN jobs j ON j.id = m.job_id
         JOIN profiles p ON p.id = m.profile_id
        WHERE p.user_id = $1
        ORDER BY m.score DESC LIMIT 30`, [user.id]),
    pool.query(
      `SELECT COALESCE(sum(cost_usd),0)::float AS spent FROM ai_usage
        WHERE user_id = $1 AND created_at >= date_trunc('month', now())`, [user.id]),
  ]);

  const p = profile.rows[0]?.data;
  const limit = BUDGET_BY_PLAN[user.plan] ?? 0;
  const spent = usage.rows[0].spent as number;

  return (
    <div className="ap">
      <div className="ap-wrap">
        <nav className="ap-nav">
          <span className="logo">career</span>
          <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>{user.email}</span>
        </nav>

        {!p ? (
          <>
            <h1>Начнём с резюме</h1>
            <p className="lead">
              Пока не загружено резюме, искать не с чем: вакансии оцениваются относительно
              вашего опыта, а не по ключевым словам.
            </p>
            <a className="btn" href="/career/upload">Загрузить резюме</a>
          </>
        ) : (
          <>
            <h1>{p.target_titles?.[0] ?? 'Ваш профиль'}</h1>
            <p className="lead">
              {p.seniority} · опыт {Math.round((p.total_experience_months ?? 0) / 12)} лет
              {p.location?.city ? ` · ${p.location.city}` : ''}
              {' · '}
              <a href={`/career/profile/${profile.rows[0].id}`} style={{ color: 'var(--ink-2)' }}>
                смотреть профиль
              </a>
            </p>

            <div className="pf-block">
              <h2>мой поиск</h2>
              {agents.rows.length === 0 ? (
                <AgentForm />
              ) : (
                agents.rows.map((a: any) => (
                  <div className="pf-row" key={a.id}>
                    <span className="k">{a.name}<ResetAgent id={a.id} /></span>
                    <span className="v" style={{ fontWeight: 400, color: 'var(--ink-2)', fontSize: 14 }}>
                      {a.query.salary ? `от ${Number(a.query.salary).toLocaleString('ru-RU')} ₽ · ` : ''}
                      {a.query.schedule === 'remote' ? 'удалённо · ' : ''}
                      {a.last_run_at
                        ? `обход ${new Date(a.last_run_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                        : 'первый обход идёт'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <div className="pf-block">
              <h2>подходящие вакансии</h2>
              {matches.rows.length === 0 ? (
                <p style={{ color: 'var(--ink-3)', fontSize: 14, margin: 0 }}>
                  {agents.rows.length === 0
                    ? 'Запустите поиск выше — первые оценки появятся через несколько минут.'
                    : 'Идёт первый обход. Вакансии появятся здесь по мере разбора.'}
                </p>
              ) : (
                matches.rows.map((m: any, i: number) => (
                  <div className="exp" key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div className="t">
                          {m.url
                            ? <a href={m.url} target="_blank" rel="noopener" style={{ color: 'inherit' }}>{m.title}</a>
                            : m.title}
                        </div>
                        <div className="c">
                          {[m.company, m.area, money(m.salary_to ?? m.salary_from, m.currency)]
                            .filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600,
                                     color: m.score >= 80 ? 'var(--match)' : 'var(--ink-2)' }}>
                        {m.score}
                      </span>
                    </div>
                    {m.explanation && (
                      <p style={{ fontSize: 14, color: 'var(--ink-2)', margin: '6px 0 0' }}>
                        {m.explanation}
                      </p>
                    )}
                    {m.missing?.length > 0 && (
                      <div className="chips" style={{ marginTop: 8 }}>
                        {m.missing.slice(0, 5).map((s: string) => (
                          <span className="chip listed" key={s}>{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pf-block">
              <h2>тариф и расход</h2>
              <div className="pf-row">
                <span className="k">Тариф</span>
                <span className="v">{user.plan}</span>
              </div>
              <div className="pf-row">
                <span className="k">Потрачено за месяц</span>
                <span className="v" style={{ fontFamily: 'var(--mono)' }}>
                  ${spent.toFixed(3)} из ${limit.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="pf-actions">
              <a className="btn ghost" href="/career/upload">Обновить резюме</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
