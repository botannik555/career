-- Сбор почт с главной страницы, пока загрузка резюме не открыта.
CREATE TABLE IF NOT EXISTS waitlist (
  id          bigserial PRIMARY KEY,
  email       text UNIQUE NOT NULL,
  ip          text,
  invited_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
