import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { pool } from './db';

/**
 * Вход только для владельца. Публичной регистрации пока нет — когда появится,
 * эти же функции переиспользуются, добавится только users.password_hash.
 *
 * Пароль хранится как scrypt-хеш в ADMIN_PASSWORD_HASH (см. scripts/make-admin.mjs).
 * Секрет сессии — AUTH_SECRET.
 */

const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET!);
const COOKIE = 'career_session';
const MAX_AGE = 60 * 60 * 24 * 30;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [algo, saltHex, keyHex] = stored.split(':');
  if (algo !== 'scrypt') return false;
  const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(keyHex, 'hex');
  // timingSafeEqual падает при разной длине — сравниваем только совпадающие.
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

export interface Session { sub: string; email: string; role: 'admin' | 'user' }

export async function createSession(s: Session) {
  const token = await new SignJWT({ email: s.email, role: s.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(s.sub)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/career',          // ограничиваем подпапкой, чтобы не течь в Jitsi
    maxAge: MAX_AGE,
  });
}

export async function readSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { sub: payload.sub!, email: payload.email as string, role: payload.role as 'admin' | 'user' };
  } catch {
    return null;
  }
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

/** Простой лимит попыток входа в Postgres — Redis для этого не нужен. */
export async function checkLoginRate(ip: string): Promise<boolean> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS login_attempts (
       ip text, at timestamptz DEFAULT now())`,
  );
  await pool.query(`DELETE FROM login_attempts WHERE at < now() - interval '15 minutes'`);
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM login_attempts WHERE ip = $1`, [ip],
  );
  return rows[0].n < 5;
}

export async function recordLoginAttempt(ip: string) {
  await pool.query(`INSERT INTO login_attempts (ip) VALUES ($1)`, [ip]);
}

export async function clearLoginAttempts(ip: string) {
  await pool.query(`DELETE FROM login_attempts WHERE ip = $1`, [ip]);
}
