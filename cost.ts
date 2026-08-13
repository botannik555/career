import { pool } from '../db';

/**
 * Cost Control Engine.
 *
 * ВАЖНО: цены ниже — заглушки. Сверьте с actual pricing перед запуском
 * и держите их в одном месте: это единственный источник правды о
 * себестоимости каждого действия.
 * USD за 1M токенов.
 */
export const PRICING: Record<string, { in: number; out: number }> = {
  'claude-haiku-4-5-20251001': { in: 1.0, out: 5.0 },
  'claude-sonnet-5':           { in: 3.0, out: 15.0 },
  'claude-opus-5':             { in: 15.0, out: 75.0 },
  'text-embedding-3-small':    { in: 0.02, out: 0 },
};

export const MODELS = {
  /** Классификация, extraction, keywords, разбор вакансии. */
  cheap: process.env.MODEL_CHEAP ?? 'claude-haiku-4-5-20251001',
  /** Матчинг с объяснением, cover letters, переписывание резюме. */
  smart: process.env.MODEL_SMART ?? 'claude-sonnet-5',
  /** Только career advisor на сложных запросах. */
  premium: process.env.MODEL_PREMIUM ?? 'claude-opus-5',
};

/** Месячный потолок переменной себестоимости на пользователя, USD. */
export const BUDGET_BY_PLAN: Record<string, number> = {
  free: 0.25,
  pro: 3.0,
  premium: 6.0,
  hunter: 12.0,
};

export function costUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING[model];
  if (!p) return 0;
  return (tokensIn / 1e6) * p.in + (tokensOut / 1e6) * p.out;
}

export async function logUsage(args: {
  userId: string | null;
  action: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  meta?: Record<string, unknown>;
}): Promise<number> {
  const cost = costUsd(args.model, args.tokensIn, args.tokensOut);
  await pool.query(
    `INSERT INTO ai_usage (user_id, action, model, tokens_in, tokens_out, cost_usd, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [args.userId, args.action, args.model, args.tokensIn, args.tokensOut, cost, args.meta ?? {}],
  );
  return cost;
}

export class BudgetExceeded extends Error {
  constructor(public spent: number, public limit: number) {
    super(`AI budget exceeded: ${spent.toFixed(2)} / ${limit.toFixed(2)} USD`);
  }
}

/**
 * Kill switch. Вызывать ПЕРЕД каждым платным действием пользователя.
 * Фоновые задачи (разбор вакансии в общий кэш) сюда не попадают — они
 * списываются на global budget, а не на пользователя.
 */
export async function assertBudget(userId: string): Promise<{ spent: number; limit: number }> {
  const { rows } = await pool.query(
    `SELECT u.plan, COALESCE(s.spent_usd, 0) AS spent
       FROM users u
       LEFT JOIN ai_usage_current_month s ON s.user_id = u.id
      WHERE u.id = $1`,
    [userId],
  );
  if (!rows.length) throw new Error('user not found');
  const limit = BUDGET_BY_PLAN[rows[0].plan] ?? 0;
  const spent = Number(rows[0].spent);
  if (spent >= limit) throw new BudgetExceeded(spent, limit);
  return { spent, limit };
}
