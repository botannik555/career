import { NextResponse, type NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { currentUser } from '@/lib/user';
import { pollQueue } from '@/lib/queue';

/** Регионы hh.ru. Полный справочник: https://api.hh.ru/areas */
const AREAS: Record<string, string> = {
  '113': 'Россия', '1': 'Москва', '2': 'Санкт-Петербург',
  '2019': 'Московская область', '1202': 'Казахстан', '16': 'Беларусь',
};

export async function POST(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Нужно войти.' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const text = String(body.text ?? '').trim();
  const area = String(body.area ?? '113');
  const salary = Number(body.salary) || undefined;
  const remoteOnly = Boolean(body.remoteOnly);

  if (text.length < 2 || text.length > 100) {
    return NextResponse.json({ error: 'Укажите должность или ключевые слова.' }, { status: 400 });
  }
  if (!AREAS[area]) {
    return NextResponse.json({ error: 'Неизвестный регион.' }, { status: 400 });
  }

  const { rows: profiles } = await pool.query(
    `SELECT id FROM profiles WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [user.id],
  );
  if (!profiles.length) {
    return NextResponse.json(
      { error: 'Сначала загрузите резюме — без профиля оценивать вакансии не с чем.' },
      { status: 409 },
    );
  }

  // Больше трёх агентов на бесплатном тарифе не нужно: каждый тратит бюджет.
  const { rows: counted } = await pool.query(
    `SELECT count(*)::int AS n FROM search_agents WHERE user_id = $1 AND active`, [user.id],
  );
  const limit = user.plan === 'free' ? 1 : 5;
  if (counted[0].n >= limit) {
    return NextResponse.json(
      { error: `На вашем тарифе доступно поисков: ${limit}.` }, { status: 409 },
    );
  }

  const query: Record<string, unknown> = { text, area };
  if (salary) { query.salary = salary; query.only_with_salary = true; }
  if (remoteOnly) query.schedule = 'remote';

  const { rows } = await pool.query(
    `INSERT INTO search_agents (user_id, profile_id, name, query)
     VALUES ($1,$2,$3,$4) RETURNING id`,
    [user.id, profiles[0].id, text, query],
  );

  // Первый обход запускаем сразу, дальше воркер ходит по расписанию.
  try {
    await pollQueue.add('poll', { agentId: rows[0].id });
  } catch (e) {
    console.error('enqueue failed', e);
  }

  return NextResponse.json({ ok: true, id: rows[0].id });
}

export async function DELETE(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Нужно войти.' }, { status: 401 });

  const id = new URL(req.url).searchParams.get('id');
  await pool.query(
    `UPDATE search_agents SET active = false WHERE id = $1 AND user_id = $2`,
    [id, user.id],
  );
  return NextResponse.json({ ok: true });
}
