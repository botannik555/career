import { z } from 'zod';
import { logUsage } from './cost';

const BASE = process.env.OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1';

/**
 * Единственный вход для всех LLM-вызовов — через OpenRouter.
 * Не зовите API напрямую из фич: тогда расход перестанет попадать
 * в ai_usage и себестоимость станет невидимой.
 *
 * Структуру получаем через function calling: модель обязана вернуть
 * аргументы по схеме и физически не может добавить преамбулу.
 */
export async function callJson<T>(args: {
  userId: string | null;
  action: string;
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<{ data: T; cost: number }> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      // OpenRouter показывает эти поля в статистике аккаунта.
      'HTTP-Referer': process.env.APP_URL ?? 'https://meet.rbmclub.com/career',
      'X-Title': 'career',
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: args.maxTokens ?? 4096,
      temperature: 0,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.user },
      ],
      tools: [{
        type: 'function',
        function: {
          name: 'result',
          description: 'Return the structured result.',
          parameters: args.jsonSchema,
        },
      }],
      tool_choice: { type: 'function', function: { name: 'result' } },
      // Просим вернуть реальную стоимость вызова, а не считать её по прайсу.
      usage: { include: true },
    }),
  });

  if (!res.ok) {
    throw new Error(`${args.action}: OpenRouter ${res.status} — ${await res.text()}`);
  }

  const json = await res.json();

  if (json.error) {
    throw new Error(`${args.action}: ${json.error.message ?? 'ошибка провайдера'}`);
  }

  const usage = json.usage ?? {};
  const cost = await logUsage({
    userId: args.userId,
    action: args.action,
    model: json.model ?? args.model,
    tokensIn: usage.prompt_tokens ?? 0,
    tokensOut: usage.completion_tokens ?? 0,
    // OpenRouter отдаёт фактическую цену — она точнее любой таблицы.
    costUsd: typeof usage.cost === 'number' ? usage.cost : undefined,
  });

  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call?.function?.arguments) {
    throw new Error(`${args.action}: модель не вернула структурированный результат`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(call.function.arguments);
  } catch {
    throw new Error(`${args.action}: аргументы не разобрались как JSON`);
  }

  const parsed = args.schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`${args.action}: результат не сходится со схемой — ${parsed.error.message}`);
  }

  return { data: parsed.data, cost };
}

/**
 * Embeddings. OpenRouter их не отдаёт, поэтому берём отдельного провайдера
 * с OpenAI-совместимым эндпоинтом — по умолчанию сам OpenAI.
 * Размерность обязана совпадать с vector(1536) в схеме БД.
 */
export async function embed(texts: string[]): Promise<number[][]> {
  const base = process.env.EMBEDDINGS_BASE_URL ?? 'https://api.openai.com/v1';
  const key = process.env.EMBEDDINGS_API_KEY ?? process.env.OPENAI_API_KEY;
  const model = process.env.EMBEDDINGS_MODEL ?? 'text-embedding-3-small';

  if (!key) {
    throw new Error('Не задан EMBEDDINGS_API_KEY: без него поиск по вакансиям не работает.');
  }

  const res = await fetch(`${base}/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) throw new Error(`embeddings: ${res.status} — ${await res.text()}`);

  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

/** pgvector принимает literal вида '[0.1,0.2,...]'. */
export function toVector(v: number[]): string {
  return `[${v.join(',')}]`;
}
