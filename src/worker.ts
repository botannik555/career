import { Queue, Worker } from 'bullmq';
import { pool } from './lib/db';
import { searchVacancies, getVacancy, upsertVacancy } from './lib/hh/client';
import { embed, toVector } from './lib/ai/client';
import { prefilter, scoreJob } from './lib/match/pipeline';

const connection = { url: process.env.REDIS_URL! };

export const q = {
  poll: new Queue('poll-agent', { connection }),
  index: new Queue('index-job', { connection }),
  match: new Queue('match-agent', { connection }),
};

/**
 * 1. poll-agent — тянет вакансии по запросу агента и кладёт в общий кэш.
 *    LLM здесь не участвует: только hh.ru API и SQL.
 */
const pollW = new Worker("poll-agent", async (job) => {
  const { agentId } = job.data as { agentId: string };
  const { rows } = await pool.query(
    `SELECT id, query, profile_id, user_id FROM search_agents WHERE id = $1 AND active`,
    [agentId],
  );
  if (!rows.length) return;
  const agent = rows[0];

  const fresh: string[] = [];
  for (let page = 0; page < 1; page++) {
    const res = await searchVacancies(agent.query, page, 20);
    console.log("hh found", res.found, "items", res.items?.length, JSON.stringify(agent.query));
    for (const item of res.items) {
      // Полное описание тянем только для незнакомых вакансий.
      const known = await pool.query(`SELECT 1 FROM jobs WHERE id = $1`, [`hh:${item.id}`]);
      const raw = known.rowCount ? item : await getVacancy(item.id);
      const { id, isNew } = await upsertVacancy(raw);
      if (isNew) fresh.push(id);
    }
    if (page + 1 >= res.pages) break;
  }

  for (const id of fresh) await q.index.add('index', { jobId: id });
  await q.match.add('match', { agentId });
  await pool.query(`UPDATE search_agents SET last_run_at = now() WHERE id = $1`, [agentId]);
}, { connection, concurrency: 2 });

/**
 * 2. index-job — считает embedding вакансии ОДИН РАЗ на всех пользователей.
 *    Это и есть кэш из пункта 7: 1000 пользователей на одну вакансию — один вызов.
 */
const indexW = new Worker("index-job", async (job) => {
  const { jobId } = job.data as { jobId: string };
  const { rows } = await pool.query(
    `SELECT id, title, company, description FROM jobs
      WHERE id = $1 AND embedding IS NULL`,
    [jobId],
  );
  if (!rows.length) return;
  const j = rows[0];
  const text = `${j.title}\n${j.company ?? ''}\n${(j.description ?? '').slice(0, 4000)}`;
  const [vec] = await embed([text]);
  await pool.query(
    `UPDATE jobs SET embedding = $2, analyzed_at = now() WHERE id = $1`,
    [j.id, toVector(vec)],
  );
}, { connection, concurrency: 1 });

/**
 * 3. match-agent — префильтр по вектору, затем LLM только на топ-N.
 */
const matchW = new Worker("match-agent", async (job) => {
  const { agentId } = job.data as { agentId: string };
  const { rows } = await pool.query(
    `SELECT a.id, a.profile_id, a.min_score, a.query, p.data AS profile, p.user_id
       FROM search_agents a JOIN profiles p ON p.id = a.profile_id
      WHERE a.id = $1`,
    [agentId],
  );
  if (!rows.length) return;
  const a = rows[0];

  const candidates = await prefilter(a.profile_id, {
    minSalary: a.query.salary,
    sinceHours: 48,
  });

  for (const c of candidates) {
    try {
      await scoreJob({
        userId: a.user_id, profileId: a.profile_id, profile: a.profile, job: c,
      });
    } catch (e: any) {
      if (e.name === 'BudgetExceeded') break;   // kill switch: молча останавливаемся
      console.error('score failed', c.id, e.message);
    }
  }
}, { connection, concurrency: 1 });  // LLM-очередь: одна за раз, бережём 2 CPU

console.log('worker up');

// Планировщик: раз в 15 минут ставим обход агентам, которые давно не обновлялись.
setInterval(async () => {
  try {
    const { rows } = await pool.query(
      `SELECT id FROM search_agents WHERE active
         AND (last_run_at IS NULL OR last_run_at < now() - interval '30 minutes')`);
    for (const r of rows) await q.poll.add('poll', { agentId: r.id });
  } catch (e) { console.error('scheduler', e); }
}, 15 * 60 * 1000);

// Ошибки обработчиков BullMQ по умолчанию не печатаются — только оседают в Redis.
for (const w of [pollW, indexW, matchW]) {
  w.on('failed', (job, err) => console.error('FAILED', w.name, job?.id, err?.message));
}
