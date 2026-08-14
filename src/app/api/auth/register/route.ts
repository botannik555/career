import { NextResponse, type NextRequest } from 'next/server';
import { pool } from '@/lib/db';
import { hashPassword, createSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}));
  const addr = String(email ?? '').toLowerCase().trim();
  const pass = String(password ?? '');

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) {
    return NextResponse.json({ error: 'Проверьте адрес почты.' }, { status: 400 });
  }
  if (pass.length < 8) {
    return NextResponse.json({ error: 'Пароль от 8 символов.' }, { status: 400 });
  }
  if (pass.length > 200) {
    return NextResponse.json({ error: 'Слишком длинный пароль.' }, { status: 400 });
  }

  const isOwner = addr === (process.env.ADMIN_EMAIL ?? '').toLowerCase();

  // Занятый адрес — отдельный ответ: человеку нужно понимать, что он уже
  // регистрировался, а не гадать, почему не пускает.
  const { rows: existing } = await pool.query(
    `SELECT id, password_hash FROM users WHERE email = $1`, [addr],
  );
  if (existing.length && existing[0].password_hash) {
    return NextResponse.json(
      { error: 'Такая почта уже зарегистрирована. Войдите.' }, { status: 409 },
    );
  }

  const hash = hashPassword(pass);
  const { rows } = await pool.query(
    `INSERT INTO users (email, plan, password_hash) VALUES ($1,$2,$3)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [addr, isOwner ? 'premium' : 'free', hash],
  );

  await createSession({
    sub: rows[0].id,
    email: addr,
    role: isOwner ? 'admin' : 'user',
  });

  return NextResponse.json({ ok: true, redirect: isOwner ? '/career/admin' : '/career/upload' });
}
