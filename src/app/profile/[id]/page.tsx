import { notFound } from 'next/navigation';
import { pool } from '@/lib/db';
import { currentUser } from '@/lib/user';
import type { CandidateProfile } from '@/lib/schema/profile';
import '../../app.css';

export const dynamic = 'force-dynamic';

const SENIORITY: Record<string, string> = {
  intern: 'стажёр', junior: 'junior', middle: 'middle', senior: 'senior',
  lead: 'lead', head: 'руководитель', director: 'директор',
};

const FORMAT: Record<string, string> = {
  remote: 'удалённо', hybrid: 'гибрид', onsite: 'в офисе',
};

const FLAG: Record<string, string> = {
  gap: 'перерыв', job_hopping: 'частая смена', no_metrics: 'нет цифр',
  vague_title: 'размытая роль', missing_keywords: 'нет ключевых слов', formatting: 'вёрстка',
};

function years(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const yl = y % 10 === 1 && y % 100 !== 11 ? 'год' : [2, 3, 4].includes(y % 10) && ![12, 13, 14].includes(y % 100) ? 'года' : 'лет';
  return m ? `${y} ${yl} ${m} мес.` : `${y} ${yl}`;
}

export default async function Profile({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) notFound();

  const { rows } = await pool.query(
    `SELECT p.data, p.created_at, r.filename,
            (SELECT sum(cost_usd)::float FROM ai_usage
              WHERE user_id = p.user_id AND action = 'extract_profile') AS cost
       FROM profiles p LEFT JOIN resumes r ON r.id = p.resume_id
      WHERE p.id = $1 AND p.user_id = $2`,
    [id, user.id],
  );
  if (!rows.length) notFound();

  const p = rows[0].data as CandidateProfile;
  const low = Object.entries(p.confidence).filter(([, v]) => v < 0.5);

  return (
    <div className="ap">
      <div className="ap-wrap">
        <nav className="ap-nav">
          <span className="logo">career</span>
          <a href="/career/admin">Панель управления</a>
        </nav>

        <div className="pf-head">
          <div>
            <h1>{p.full_name ?? 'Профиль'}</h1>
            <p className="lead">{p.headline ?? rows[0].filename}</p>
          </div>
          {rows[0].cost != null && (
            <span className="pf-cost">разбор: ${Number(rows[0].cost).toFixed(3)}</span>
          )}
        </div>

        {low.length > 0 && (
          <div className="pf-block check">
            <h2>стоит проверить</h2>
            {low.map(([k]) => (
              <div className="flag" key={k}>
                <span className="kind">{k === 'experience' ? 'опыт' : k === 'skills' ? 'навыки' : 'зарплата'}</span>
                <span>Модель не уверена в этом блоке — в резюме он изложен неоднозначно. Сверьте значения ниже.</span>
              </div>
            ))}
          </div>
        )}

        <div className="pf-block">
          <h2>кем вы проходите</h2>
          <div className="pf-row">
            <span className="k">Основные роли</span>
            <span className="v">{p.target_titles.join(' · ')}</span>
          </div>
          {p.adjacent_titles.length > 0 && (
            <div className="pf-row">
              <span className="k">Смежные</span>
              <span className="v">{p.adjacent_titles.join(' · ')}</span>
            </div>
          )}
          <div className="pf-row">
            <span className="k">Грейд</span>
            <span className="v">{SENIORITY[p.seniority] ?? p.seniority}</span>
          </div>
          <div className="pf-row">
            <span className="k">Опыт</span>
            <span className="v">{years(p.total_experience_months)}</span>
          </div>
          {p.industries.length > 0 && (
            <div className="pf-row">
              <span className="k">Индустрии</span>
              <span className="v">{p.industries.join(', ')}</span>
            </div>
          )}
        </div>

        <div className="pf-block">
          <h2>навыки</h2>
          <div className="chips">
            {[...p.skills]
              .sort((a, b) => (a.evidence === b.evidence ? 0 : a.evidence === 'evidenced' ? -1 : 1))
              .map((s) => (
                <span className={`chip ${s.evidence}`} key={s.name}>{s.name}</span>
              ))}
          </div>
          <p className="chips-note">
            Заливкой — подтверждённые описанием работы. Контуром — просто перечисленные
            в резюме: на них оценка совпадения опирается слабее.
          </p>
        </div>

        <div className="pf-block">
          <h2>условия</h2>
          <div className="pf-row">
            <span className="k">Локация</span>
            <span className={`v ${p.location.city ? '' : 'empty'}`}>
              {[p.location.city, p.location.country].filter(Boolean).join(', ') || 'не указана'}
            </span>
          </div>
          <div className="pf-row">
            <span className="k">Формат</span>
            <span className={`v ${p.work_formats.length ? '' : 'empty'}`}>
              {p.work_formats.map((f) => FORMAT[f]).join(', ') || 'не указан'}
            </span>
          </div>
          <div className="pf-row">
            <span className="k">Ожидания</span>
            <span className={`v ${p.salary.expected_from ? '' : 'empty'}`}>
              {p.salary.expected_from
                ? `${p.salary.expected_from.toLocaleString('ru-RU')}–${(p.salary.expected_to ?? p.salary.expected_from).toLocaleString('ru-RU')} ${p.salary.currency ?? ''}${p.salary.inferred ? ' · оценка по рынку' : ''}`
                : 'в резюме не указаны'}
            </span>
          </div>
        </div>

        {p.experience.length > 0 && (
          <div className="pf-block">
            <h2>опыт</h2>
            {p.experience.map((e, i) => (
              <div className="exp" key={i}>
                <div className="t">{e.title}</div>
                <div className="c">{e.company}{e.industry ? ` · ${e.industry}` : ''}</div>
                <div className="d">{e.start ?? '?'} — {e.end ?? 'по настоящее время'}</div>
                {e.achievements.length > 0 && (
                  <ul>{e.achievements.slice(0, 3).map((a, j) => <li key={j}>{a}</li>)}</ul>
                )}
              </div>
            ))}
          </div>
        )}

        {p.red_flags.length > 0 && (
          <div className="pf-block">
            <h2>что помешает на скрининге</h2>
            {p.red_flags.map((f, i) => (
              <div className="flag" key={i}>
                <span className="kind">{FLAG[f.kind] ?? f.kind}</span>
                <span>{f.detail}</span>
              </div>
            ))}
          </div>
        )}

        <div className="pf-actions">
          <a className="btn" href="/career/upload">Загрузить другое резюме</a>
          <a className="btn ghost" href="/career/admin">К панели управления</a>
        </div>
      </div>
    </div>
  );
}
