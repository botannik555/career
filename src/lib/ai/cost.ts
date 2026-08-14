import { pool } from '../db';

/**
 * Cost Control Engine.
 *
 * Основной источник цены — фактическая стоимость вызова, которую отдаёт
 * OpenRouter. Таблица ниже нужна только как запасной вариант, если провайдер
 * стоимость не вернул. USD за 1M токенов, сверяйте на openrouter.ai/models.
 */
export const PRICING: Record<string, { in: number; out: number }> = {
  'anthropic/claude-haiku-4.5': { in: 1.0, out: 5.0 },
  'anthropic/claude-sonnet-4.5': { in: 3.0, out: 15.0 },
  'openai/gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'text-embedding-3-small': { in: 0.02, out: 0 },
};

/** Слаги OpenRouter. Проверить актуальные: https://openrouter.ai/models */
export const MODELS = {
  /** Классификация, extraction, разбор вакансии — самый частый вызов. */
  cheap: process.env.MODEL_CHEAP ?? 'anthropic/claude-haiku-4.5',
  /** Матчинг с объяснением, cover letters, переписывание резюме. */
  smart: process.env.MODEL_SMART ?? 'anthropic/claude-sonnet-4.5',
  /** Только карьерный советник на сложных запросах. */
  premium: process.env.MODEL_PREMIUM ?? 'anthropic/claude-sonnet-4.5',
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
  /** Фактическая стоимость от провайдера. Если её нет — считаем по PRICING. */
  costUsd?: number;
  meta?: Record<string, unknown>;
}): Promise<number> {
  const cost = args.costUsd ?? costUsd(args.model, args.tokensIn, args.tokensOut);
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
    this.name = 'BudgetExceeded';
  }
}

/**
 * Kill switch. Вызывать ПЕРЕД каждым платным действием пользователя.
 * Фоновые задачи (разбор вакансии в общий кэш) сюда не попадают —
 * они списываются на общий бюджет, а не на пользователя.
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
