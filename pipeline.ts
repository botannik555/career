import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { pool } from '../db';
import { callJson } from '../ai/client';
import { MODELS } from '../ai/cost';
import type { CandidateProfile } from '../schema/profile';

/**
 * Экономика всей системы держится на этом файле.
 *
 *   10 000 вакансий
 *     -> SQL-фильтры (локация, вилка, формат, свежесть)   ~2 000
 *     -> pgvector cosine, топ-N                              30
 *     -> LLM                                                 30
 *
 * Если пустить LLM на все вакансии, себестоимость пользователя
 * улетает в десятки долларов в месяц. LLM_TOP_N — главный рычаг цены.
 */
const LLM_TOP_N = Number(process.env.LLM_TOP_N ?? 30);

const MatchResult = z.object({
  score: z.number().min(0).max(100),
  breakdown: z.object({
    experience: z.number(), skills: z.number(), education: z.number(),
    seniority: z.number(), salary: z.number(), location: z.number(),
    industry: z.number(),
  }),
  /** Одно-два предложения на языке резюме: почему подходит и что мешает. */
  explanation: z.string(),
  /** Чего конкретно не хватает. Питает Career Gap Analysis. */
  missing: z.array(z.string()),
  /** Оценка вероятности приглашения, 0..100. Отдельно от score. */
  interview_probability: z.number().min(0).max(100),
});
type MatchResult = z.infer<typeof MatchResult>;

const jsonSchema = zodToJsonSchema(MatchResult, { target: 'openApi3' }) as Record<string, unknown>;

const SYSTEM = `Ты оцениваешь соответствие ОДНОГО кандидата ОДНОЙ вакансии.

Правила:
1. Оценивай кандидата относительно требований вакансии, а не абстрактной нормы.
2. Формальные требования (лет опыта, диплом) не абсолютны: если реальные
   достижения перекрывают формальный недобор, score это отражает.
3. score — не среднее по breakdown. Критичный провал по ключевому требованию
   тянет общий балл вниз сильнее, чем провал по второстепенному.
4. Разделяй score (подходит ли объективно) и interview_probability
   (позовут ли реально: конкуренция, переспециализация, гео, вилка).
5. missing — только то, чего действительно нет в профиле. Не перечисляй
   всё подряд из вакансии.
6. explanation — конкретика из профиля и вакансии, без общих слов
   вроде "хороший опыт". Максимум два предложения.`;

/** Шаг 1-2: SQL-фильтры + векторный префильтр. Ноль стоимости LLM. */
export async function prefilter(profileId: string, agentQuery: {
  minSalary?: number;
  areas?: string[];
  formats?: string[];
  sinceHours?: number;
}, limit = LLM_TOP_N) {
  const { rows } = await pool.query(
    `WITH p AS (SELECT embedding, id FROM profiles WHERE id = $1)
     SELECT j.id, j.title, j.company, j.description, j.salary_from, j.salary_to,
            j.currency, j.schedule, j.area,
            1 - (j.embedding <=> p.embedding) AS similarity
       FROM jobs j, p
      WHERE j.is_active
        AND j.canonical_id IS NULL                       -- только оригиналы, не дубли
        AND j.embedding IS NOT NULL
        AND ($2::int IS NULL OR COALESCE(j.salary_to, j.salary_from) >= $2)
        AND ($3::text[] IS NULL OR j.area = ANY($3))
        AND ($4::text[] IS NULL OR j.schedule = ANY($4))
        AND j.published_at > now() - make_interval(hours => $5)
        AND NOT EXISTS (                                  -- уже оценивали: не платим дважды
              SELECT 1 FROM matches m
               WHERE m.profile_id = p.id AND m.job_id = j.id)
      ORDER BY j.embedding <=> p.embedding
      LIMIT $6`,
    [
      profileId,
      agentQuery.minSalary ?? null,
      agentQuery.areas ?? null,
      agentQuery.formats ?? null,
      agentQuery.sinceHours ?? 168,
      limit,
    ],
  );
  return rows;
}

/** Шаг 3: LLM оценивает только то, что прошло префильтр. */
export async function scoreJob(args: {
  userId: string;
  profileId: string;
  profile: CandidateProfile;
  job: { id: string; title: string; company: string | null; description: string | null;
         salary_from: number | null; salary_to: number | null; currency: string | null;
         schedule: string; area: string | null };
}): Promise<MatchResult> {
  const jobText = [
    `Должность: ${args.job.title}`,
    `Компания: ${args.job.company ?? '—'}`,
    `Локация: ${args.job.area ?? '—'} (${args.job.schedule})`,
    `Вилка: ${args.job.salary_from ?? '?'}–${args.job.salary_to ?? '?'} ${args.job.currency ?? ''}`,
    '',
    (args.job.description ?? '').slice(0, 6000),
  ].join('\n');

  const { data } = await callJson({
    userId: args.userId,
    action: 'match',
    model: MODELS.smart,
    system: SYSTEM,
    user: `<candidate>\n${JSON.stringify(args.profile)}\n</candidate>\n\n<job>\n${jobText}\n</job>`,
    schema: MatchResult,
    jsonSchema,
    maxTokens: 1200,
  });

  await pool.query(
    `INSERT INTO matches (profile_id, job_id, score, breakdown, explanation, missing, stage, model)
     VALUES ($1,$2,$3,$4,$5,$6,'llm',$7)
     ON CONFLICT (profile_id, job_id) DO UPDATE
       SET score = EXCLUDED.score, breakdown = EXCLUDED.breakdown,
           explanation = EXCLUDED.explanation, missing = EXCLUDED.missing`,
    [args.profileId, args.job.id, data.score,
     { ...data.breakdown, interview_probability: data.interview_probability },
     data.explanation, data.missing, MODELS.smart],
  );

  return data;
}
