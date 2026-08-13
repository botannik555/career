-- career: initial schema
-- psql -h 127.0.0.1 -p 5433 -U postgres -d career -f db/001_init.sql

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- users ----------

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text UNIQUE NOT NULL,
  telegram_id   bigint UNIQUE,
  plan          text NOT NULL DEFAULT 'free',   -- free | pro | premium | hunter
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ---------- resume -> profile ----------

CREATE TABLE resumes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename      text NOT NULL,
  mime          text NOT NULL,
  raw_text      text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Центральный объект системы. Всё остальное питается отсюда.
CREATE TABLE profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resume_id     uuid REFERENCES resumes(id) ON DELETE SET NULL,
  is_master     boolean NOT NULL DEFAULT true,
  data          jsonb NOT NULL,          -- CandidateProfile, см. src/lib/schema/profile.ts
  embedding     vector(1536),            -- вектор профиля для префильтра
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX profiles_user_idx ON profiles (user_id);

-- Что именно ищем. У пользователя может быть несколько агентов.
CREATE TABLE search_agents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name          text NOT NULL,
  query         jsonb NOT NULL,          -- {text, area, salary, schedule, experience}
  digest_mode   text NOT NULL DEFAULT 'daily',  -- instant | daily | weekly | off
  min_score     int  NOT NULL DEFAULT 70,
  active        boolean NOT NULL DEFAULT true,
  last_run_at   timestamptz
);

-- ---------- jobs: ГЛОБАЛЬНЫЙ кэш, один разбор на всех пользователей ----------

CREATE TABLE jobs (
  id            text PRIMARY KEY,        -- 'hh:12345678'
  source        text NOT NULL,
  external_id   text NOT NULL,
  url           text,
  title         text NOT NULL,
  company       text,
  company_id    text,
  area          text,
  salary_from   int,
  salary_to     int,
  currency      text,
  schedule      text,                    -- remote | hybrid | onsite
  published_at  timestamptz,
  raw           jsonb NOT NULL,
  description   text,

  fingerprint   text,                    -- дедупликация между источниками
  canonical_id  text REFERENCES jobs(id),-- если дубль, ссылка на основную

  embedding     vector(1536),
  requirements  jsonb,                   -- извлечённые LLM требования
  analyzed_at   timestamptz,
  analysis_model text,

  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  is_active     boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX jobs_source_ext_idx ON jobs (source, external_id);
CREATE INDEX jobs_fingerprint_idx ON jobs (fingerprint);
CREATE INDEX jobs_active_idx ON jobs (is_active, published_at DESC);
-- lists=100 подходит примерно до 500k вакансий; пересоздать при росте
CREATE INDEX jobs_embedding_idx ON jobs
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ---------- matching ----------

CREATE TABLE matches (
  profile_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  job_id        text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score         int NOT NULL,            -- 0..100
  breakdown     jsonb NOT NULL,          -- {experience, skills, education, seniority, salary, location, industry}
  explanation   text,
  missing       text[],
  stage         text NOT NULL DEFAULT 'llm',   -- prefilter | llm
  model         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, job_id)
);
CREATE INDEX matches_profile_score_idx ON matches (profile_id, score DESC);

-- Feedback loop: чему система учится на поведении пользователя.
CREATE TABLE job_events (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id        text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  action        text NOT NULL,           -- view | save | apply | ignore | reject
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_events_user_idx ON job_events (user_id, created_at DESC);

-- ---------- cost control ----------

-- Пишется с первого дня. Без этого себестоимость не видна, пока не поздно.
CREATE TABLE ai_usage (
  id            bigserial PRIMARY KEY,
  user_id       uuid REFERENCES users(id) ON DELETE SET NULL,
  action        text NOT NULL,           -- extract_profile | analyze_job | match | cover_letter | chat
  model         text NOT NULL,
  tokens_in     int NOT NULL DEFAULT 0,
  tokens_out    int NOT NULL DEFAULT 0,
  cost_usd      numeric(12,6) NOT NULL DEFAULT 0,
  meta          jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_usage_user_month_idx ON ai_usage (user_id, created_at DESC);

CREATE VIEW ai_usage_current_month AS
SELECT user_id,
       sum(cost_usd)                    AS spent_usd,
       count(*)                          AS calls,
       count(*) FILTER (WHERE action = 'cover_letter') AS cover_letters
FROM ai_usage
WHERE created_at >= date_trunc('month', now())
GROUP BY user_id;

-- ---------- applications (V2, таблица заводится сразу) ----------

CREATE TABLE applications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id        text NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status        text NOT NULL DEFAULT 'applied',  -- applied | interview | tech | offer | rejected
  applied_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  notes         text,
  UNIQUE (user_id, job_id)
);
