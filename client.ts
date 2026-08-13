import crypto from 'node:crypto';
import { pool } from '../db';

const BASE = 'https://api.hh.ru';

/** hh.ru отклоняет запросы без осмысленного User-Agent. Подставьте контакт. */
const UA = process.env.HH_USER_AGENT ?? 'career-app/0.1 (admin@rbmclub.com)';

export interface HhQuery {
  text: string;
  area?: string | number;       // 1 = Москва, 2 = СПб, 113 = Россия
  salary?: number;
  currency?: string;
  schedule?: string;            // remote | fullDay | flexible
  experience?: string;          // noExperience | between1And3 | between3And6 | moreThan6
  only_with_salary?: boolean;
  period?: number;              // дней назад
}

async function hhGet(path: string, params: Record<string, unknown> = {}) {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });

  if (res.status === 429) {
    throw Object.assign(new Error('hh.ru rate limit'), { retryable: true });
  }
  if (!res.ok) throw new Error(`hh.ru ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Список вакансий. Отдаёт только «шапки», без полного описания. */
export async function searchVacancies(q: HhQuery, page = 0, perPage = 100) {
  return hhGet('/vacancies', { ...q, page, per_page: perPage });
}

/** Полное описание. Дорогой по количеству запросов вызов — только для новых id. */
export async function getVacancy(id: string) {
  return hhGet(`/vacancies/${id}`);
}

/**
 * Отпечаток для склейки дублей между источниками.
 * Компания + нормализованный тайтл + вилка. Одна и та же вакансия на hh,
 * LinkedIn и сайте компании даст один fingerprint.
 */
export function fingerprint(v: {
  company?: string | null; title: string;
  salary_from?: number | null; salary_to?: number | null;
}): string {
  const norm = (s: string) =>
    s.toLowerCase()
      .replace(/[ёе]/g, 'е')
      .replace(/\((remote|удал[её]нно|hybrid)\)/g, '')
      .replace(/[^a-zа-я0-9]+/g, ' ')
      .trim();
  const key = [
    norm(v.company ?? ''),
    norm(v.title),
    v.salary_from ?? '', v.salary_to ?? '',
  ].join('|');
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 16);
}

function scheduleOf(raw: any): string {
  const id = raw?.schedule?.id;
  if (raw?.work_format?.some?.((f: any) => f.id === 'REMOTE') || id === 'remote') return 'remote';
  if (id === 'flexible' || id === 'shift') return 'hybrid';
  return 'onsite';
}

function stripHtml(html?: string | null): string {
  return (html ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|ul|div)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Сохраняет вакансию в глобальный кэш. Повторный вызов для той же вакансии
 * только обновляет last_seen_at — описание и LLM-разбор не трогаются,
 * поэтому анализ каждой вакансии делается ровно один раз на всех пользователей.
 */
export async function upsertVacancy(raw: any): Promise<{ id: string; isNew: boolean }> {
  const id = `hh:${raw.id}`;
  const title = raw.name as string;
  const company = raw.employer?.name ?? null;
  const salaryFrom = raw.salary?.from ?? null;
  const salaryTo = raw.salary?.to ?? null;

  const fp = fingerprint({ company, title, salary_from: salaryFrom, salary_to: salaryTo });
  const description = stripHtml(raw.description);

  const { rows } = await pool.query(
    `INSERT INTO jobs (
       id, source, external_id, url, title, company, company_id, area,
       salary_from, salary_to, currency, schedule, published_at,
       raw, description, fingerprint
     ) VALUES ($1,'hh',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     ON CONFLICT (id) DO UPDATE
       SET last_seen_at = now(), is_active = true
     RETURNING (xmax = 0) AS is_new`,
    [
      id, String(raw.id), raw.alternate_url, title, company,
      raw.employer?.id ?? null, raw.area?.name ?? null,
      salaryFrom, salaryTo, raw.salary?.currency ?? null,
      scheduleOf(raw), raw.published_at, raw, description, fp,
    ],
  );

  const isNew = rows[0].is_new as boolean;

  // Дубль по отпечатку — привязываем к самой ранней вакансии.
  if (isNew) {
    await pool.query(
      `UPDATE jobs SET canonical_id = c.id
         FROM (SELECT id FROM jobs
                WHERE fingerprint = $1 AND id <> $2 AND canonical_id IS NULL
                ORDER BY first_seen_at LIMIT 1) c
        WHERE jobs.id = $2`,
      [fp, id],
    );
  }

  return { id, isNew };
}
