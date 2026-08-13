import { z } from 'zod';

/**
 * CandidateProfile — центральный объект. Из него питаются matching, resume
 * tailoring, cover letters, career advisor.
 *
 * Правила схемы:
 *  - никаких свободных строк там, где нужен фильтр (seniority, work_format);
 *  - всё, чего нет в резюме, = null, а не выдумка модели;
 *  - каждое утверждение о навыке привязано к источнику, иначе матчинг врёт.
 */

export const Seniority = z.enum([
  'intern', 'junior', 'middle', 'senior', 'lead', 'head', 'director',
]);

export const WorkFormat = z.enum(['remote', 'hybrid', 'onsite']);

export const SkillLevel = z.enum(['basic', 'working', 'strong', 'expert']);

export const Skill = z.object({
  name: z.string(),
  kind: z.enum(['hard', 'soft', 'tool', 'language_tech']),
  level: SkillLevel.nullable(),
  years: z.number().nullable(),
  /** Откуда это взято: 'listed' — просто перечислен, 'evidenced' — подтверждён опытом. */
  evidence: z.enum(['listed', 'evidenced']),
});

export const Experience = z.object({
  company: z.string(),
  title: z.string(),
  industry: z.string().nullable(),
  start: z.string().nullable(),           // YYYY-MM
  end: z.string().nullable(),             // YYYY-MM | null = по настоящее время
  months: z.number().nullable(),
  achievements: z.array(z.string()),      // с цифрами, если они есть в резюме
  stack: z.array(z.string()),
});

export const Education = z.object({
  institution: z.string(),
  degree: z.string().nullable(),
  field: z.string().nullable(),
  year: z.number().nullable(),
});

export const LanguageSkill = z.object({
  language: z.string(),
  level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'native']).nullable(),
});

export const CandidateProfile = z.object({
  full_name: z.string().nullable(),
  headline: z.string().nullable(),

  /** Должности, на которые кандидат реально проходит. Первая — основная. */
  target_titles: z.array(z.string()).min(1),
  /** Смежные профессии, о которых кандидат мог не подумать (career discovery). */
  adjacent_titles: z.array(z.string()),

  seniority: Seniority,
  total_experience_months: z.number(),
  industries: z.array(z.string()),

  skills: z.array(Skill),
  experience: z.array(Experience),
  education: z.array(Education),
  languages: z.array(LanguageSkill),

  location: z.object({
    city: z.string().nullable(),
    country: z.string().nullable(),
    relocation_ready: z.boolean().nullable(),
  }),
  work_formats: z.array(WorkFormat),

  salary: z.object({
    expected_from: z.number().nullable(),
    expected_to: z.number().nullable(),
    currency: z.string().nullable(),
    period: z.enum(['month', 'year']).nullable(),
    /** true, если суммы в резюме нет и они выведены из рынка. */
    inferred: z.boolean(),
  }),

  /** Проблемы резюме, которые сразу видно. Питает Resume AI. */
  red_flags: z.array(z.object({
    kind: z.enum(['gap', 'job_hopping', 'no_metrics', 'vague_title', 'missing_keywords', 'formatting']),
    detail: z.string(),
  })),

  /** Уверенность извлечения по блокам, 0..1. Низкая = переспросить пользователя. */
  confidence: z.object({
    experience: z.number(),
    skills: z.number(),
    salary: z.number(),
  }),
});

export type CandidateProfile = z.infer<typeof CandidateProfile>;

/** Текст, который уходит в embedding для префильтра по вакансиям. */
export function profileToEmbeddingText(p: CandidateProfile): string {
  const skills = p.skills
    .filter((s) => s.evidence === 'evidenced' || s.kind === 'hard')
    .map((s) => s.name);
  const roles = p.experience.map((e) => `${e.title} (${e.industry ?? ''})`);
  return [
    p.target_titles.join(', '),
    p.adjacent_titles.join(', '),
    `${p.seniority}, ${Math.round(p.total_experience_months / 12)} лет`,
    p.industries.join(', '),
    skills.join(', '),
    roles.join('; '),
  ].join('\n');
}
