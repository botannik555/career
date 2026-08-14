import { NextResponse, type NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import {
  verifyPassword, createSession,
  checkLoginRate, recordLoginAttempt, clearLoginAttempts,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') ?? 'unknown';
  const { email, password } = await req.json().catch(() => ({}));
  const addr = String(email ?? '').toLowerCase().trim();
  const pass = String(password ?? '');

  if (!(await checkLoginRate(ip))) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте через 15 минут.' }, { status: 429 },
    );
  }

  const isOwner = addr === (process.env.ADMIN_EMAIL ?? '').toLowerCase();

  const { rows } = await pool.query(
    `SELECT id, password_hash, plan FROM users WHERE email = $1`, [addr],
  );

  let userId: string | null = null;

  if (rows.length && rows[0].password_hash && verifyPassword(pass, rows[0].password_hash)) {
    userId = rows[0].id;
  } else if (isOwner && verifyPassword(pass, process.env.ADMIN_PASSWORD_HASH ?? '')) {
    // Запасной вход владельца по паролю из .env — на случай, если в БД
    // учётки ещё нет или пароль в ней потерян.
    const { rows: owner } = await pool.query(
      `INSERT INTO users (email, plan) VALUES ($1,'premium')
       ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id`,
      [addr],
    );
    userId = owner[0].id;
  }

  if (!userId) {
    await recordLoginAttempt(ip);
    // Не уточняем, что именно неверно — это подсказка для перебора.
    return NextResponse.json({ error: 'Неверная почта или пароль.' }, { status: 401 });
  }

  await clearLoginAttempts(ip);
  await createSession({ sub: userId, email: addr, role: isOwner ? 'admin' : 'user' });

  return NextResponse.json({ ok: true, redirect: isOwner ? '/career/admin' : '/career/app' });
}
