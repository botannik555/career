// Генерирует хеш пароля для .env. Запускать локально, не на сервере:
//   node scripts/make-admin.mjs 'ваш-пароль'
import crypto from 'node:crypto';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('Нужен пароль длиной от 12 символов.');
  process.exit(1);
}
const salt = crypto.randomBytes(16);
const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
console.log(`ADMIN_PASSWORD_HASH=scrypt:${salt.toString('hex')}:${key.toString('hex')}`);
console.log(`AUTH_SECRET=${crypto.randomBytes(32).toString('hex')}`);
