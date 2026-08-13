import { NextResponse, type NextRequest } from 'next/server';
import {
  verifyPassword, createSession,
  checkLoginRate, recordLoginAttempt, clearLoginAttempts,
} from '@/lib/auth';

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-real-ip') ?? 'unknown';
  const { email, password } = await req.json();

  if (!(await checkLoginRate(ip))) {
    return NextResponse.json(
      { error: 'Слишком много попыток. Попробуйте через 15 минут.' }, { status: 429 },
    );
  }

  const ok = email === process.env.ADMIN_EMAIL
    && verifyPassword(password ?? '', process.env.ADMIN_PASSWORD_HASH ?? '');

  if (!ok) {
    await recordLoginAttempt(ip);
    // Не уточняем, что именно неверно — это подсказка для перебора.
    return NextResponse.json({ error: 'Неверная почта или пароль.' }, { status: 401 });
  }

  await clearLoginAttempts(ip);
  await createSession({ sub: 'owner', email, role: 'admin' });
  return NextResponse.json({ ok: true });
}
