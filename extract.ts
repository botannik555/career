import { zodToJsonSchema } from 'zod-to-json-schema';
import { CandidateProfile, profileToEmbeddingText } from '../schema/profile';
import { callJson, embed, toVector } from './client';
import { MODELS, assertBudget } from './cost';
import { pool } from '../db';

const SYSTEM = `Ты разбираешь резюме в структурированный профиль кандидата.

Жёсткие правила:
1. Не выдумывай. Чего нет в тексте — null или пустой массив. Отсутствие данных
   это нормальный результат, догадка — брак.
2. Навык помечай evidence:"evidenced" только если он упомянут в описании
   конкретного места работы или достижения. Просто список в разделе Skills — "listed".
3. seniority определяй по реальному объёму ответственности и стажу, а не по слову
   в заголовке резюме. "Senior" в тайтле при двух годах опыта — это middle.
4. total_experience_months считай без наложения периодов; параллельные работы
   не суммируй дважды.
5. target_titles — должности, на которые кандидат проходит СЕЙЧАС, самая
   вероятная первой. adjacent_titles — смежные роли, куда его опыт переносится,
   но которые он сам, скорее всего, не рассматривает.
6. salary.inferred=true, если сумм в резюме нет и ты оценил их по рынку.
7. red_flags — то, что реально помешает на скрининге, а не придирки.
8. Названия навыков нормализуй: "MS Excel"/"Эксель" -> "Excel", "Power BI"
   не путай с "Tableau". Технологии — латиницей, как принято в индустрии.
9. confidence ставь честно: 0.4 и ниже, если раздел в резюме мутный.

Язык значений: сохраняй язык резюме для названий компаний и достижений;
названия навыков и должностей — в общепринятом виде для индустрии.`;

const jsonSchema = zodToJsonSchema(CandidateProfile, { target: 'openApi3' }) as Record<string, unknown>;

export async function extractProfile(args: {
  userId: string;
  resumeId: string;
  rawText: string;
}) {
  await assertBudget(args.userId);

  // Резюме длиннее ~25k символов почти всегда мусор из PDF-слоя.
  const text = args.rawText.slice(0, 25_000);

  const { data: profile, cost } = await callJson({
    userId: args.userId,
    action: 'extract_profile',
    model: MODELS.cheap,
    system: SYSTEM,
    user: `Резюме:\n\n<resume>\n${text}\n</resume>`,
    schema: CandidateProfile,
    jsonSchema,
    maxTokens: 8000,
  });

  const [vec] = await embed([profileToEmbeddingText(profile)]);

  const { rows } = await pool.query(
    `INSERT INTO profiles (user_id, resume_id, data, embedding)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [args.userId, args.resumeId, profile, toVector(vec)],
  );

  return { profileId: rows[0].id as string, profile, cost };
}
