import { pool } from './db';
import { readSession } from './auth';

/**
 * Пользователь из текущей сессии. Публичной регистрации пока нет —
 * владелец заводится в БД при первом обращении, чтобы работали лимиты
 * и учёт расходов, которые завязаны на users.plan.
 */
export async function currentUser(): Promise<{ id: string; email: string; plan: string } | null> {
  const s = await readSession();
  if (!s) return null;

  const { rows } = await pool.query(
    `INSERT INTO users (email, plan) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING id, email, plan`,
    [s.email, s.role === 'admin' ? 'premium' : 'free'],
  );
  return rows[0];
}
