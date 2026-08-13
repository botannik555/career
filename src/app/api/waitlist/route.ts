import { NextResponse, type NextRequest } from 'next/server';
import { pool } from '@/lib/db';

export async function POST(req: NextRequest) {
  const { email } = await req.json().catch(() => ({}));

  if (typeof email !== 'string'
      || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)
      || email.length > 200) {
    return NextResponse.json({ error: 'Проверьте адрес почты.' }, { status: 400 });
  }

  const ip = req.headers.get('x-real-ip') ?? 'unknown';

  // Пять записей с одного адреса за час — дальше молча подтверждаем,
  // чтобы бот не понял, что его отсекли.
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM waitlist
      WHERE ip = $1 AND created_at > now() - interval '1 hour'`,
    [ip],
  );
  if (rows[0].n >= 5) return NextResponse.json({ ok: true });

  await pool.query(
    `INSERT INTO waitlist (email, ip) VALUES ($1,$2)
     ON CONFLICT (email) DO NOTHING`,
    [email.toLowerCase().trim(), ip],
  );

  return NextResponse.json({ ok: true });
}
