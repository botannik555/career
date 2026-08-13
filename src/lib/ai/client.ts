import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { logUsage } from './cost';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/**
 * Один вход для всех LLM-вызовов. Не зовите SDK напрямую из фич —
 * иначе расход перестанет попадать в ai_usage и себестоимость станет невидимой.
 *
 * Структурированный вывод получаем через tool с input_schema: это надёжнее,
 * чем просить «ответь только JSON» — модель не может вернуть преамбулу.
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
  const res = await anthropic.messages.create({
    model: args.model,
    max_tokens: args.maxTokens ?? 4096,
    system: args.system,
    messages: [{ role: 'user', content: args.user }],
    tools: [{
      name: 'result',
      description: 'Return the structured result.',
      input_schema: args.jsonSchema as Anthropic.Tool.InputSchema,
    }],
    tool_choice: { type: 'tool', name: 'result' },
  });

  const cost = await logUsage({
    userId: args.userId,
    action: args.action,
    model: args.model,
    tokensIn: res.usage.input_tokens,
    tokensOut: res.usage.output_tokens,
  });

  const block = res.content.find((b) => b.type === 'tool_use');
  if (!block || block.type !== 'tool_use') {
    throw new Error(`${args.action}: model returned no structured result`);
  }

  const parsed = args.schema.safeParse(block.input);
  if (!parsed.success) {
    throw new Error(`${args.action}: schema mismatch — ${parsed.error.message}`);
  }
  return { data: parsed.data, cost };
}

/** Embeddings у Anthropic нет; берём OpenAI 1536-dim под vector(1536) в схеме. */
export async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: 'text-embedding-3-small', input: texts }),
  });
  if (!res.ok) throw new Error(`embeddings failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.data.map((d: { embedding: number[] }) => d.embedding);
}

/** pgvector принимает literal вида '[0.1,0.2,...]'. */
export function toVector(v: number[]): string {
  return `[${v.join(',')}]`;
}
