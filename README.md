# career — AI job platform на meet.rbmclub.com/career

Работает в подпапке рядом с Jitsi на одном сервере (2 CPU / 8 GB).

## Порядок развёртывания

### 1. Освободить память под приложение
Jitsi по умолчанию резервирует по 3 ГБ heap на JVB и jicofo. При редких звонках:

    # /etc/jitsi/videobridge/config
    VIDEOBRIDGE_MAX_MEMORY=512m
    # /etc/jitsi/jicofo/config
    JICOFO_MAX_MEMORY=384m
    systemctl restart jitsi-videobridge2 jicofo

Своп обязателен — иначе OOM-killer выберет Postgres:

    fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    sysctl -w vm.swappiness=10

### 2. nginx
    cp nginx/career.conf /etc/nginx/career.conf
    # в server{} для 443 в /etc/nginx/sites-available/meet.rbmclub.com.conf:
    #   include /etc/nginx/career.conf;
    nginx -t && systemctl reload nginx

Проверить, что Jitsi жив, ДО деплоя приложения: открыть комнату, начать звонок.
Эту строку include придётся вернуть после обновления пакета jitsi-meet-web.
Комната Jitsi с именем `career` после этого работать перестанет.

### 3. Запуск
    cp .env.example .env    # заполнить ключи
    docker compose up -d db redis
    docker compose exec -T db psql -U postgres -d career < db/001_init.sql
    docker compose up -d app worker
    curl -I http://127.0.0.1:3010/career/

### 4. hh.ru
Зарегистрировать приложение на https://dev.hh.ru, redirect_uri:
    https://meet.rbmclub.com/career/api/auth/hh/callback
User-Agent в .env должен содержать реальный контакт, иначе hh.ru отдаёт 403.

## Где деньги

`src/lib/match/pipeline.ts` — LLM_TOP_N решает всё. 10 000 вакансий проходят
SQL-фильтры и pgvector, до LLM доходит ~30. Поднять до 100 = утроить счёт.

`jobs.embedding` и `jobs.requirements` считаются один раз глобально: тысяча
пользователей на одну вакансию — один вызов, а не тысяча.

Себестоимость смотреть так:

    SELECT action, model, count(*), round(sum(cost_usd), 2) AS usd
      FROM ai_usage WHERE created_at >= date_trunc('month', now())
     GROUP BY 1, 2 ORDER BY usd DESC;

Цены в `src/lib/ai/cost.ts` — заглушки, сверить перед запуском.

## Что уже есть

    db/001_init.sql            схема: profiles, jobs (глобальный кэш), matches, ai_usage
    src/lib/schema/profile.ts  CandidateProfile — центральный объект
    src/lib/ai/extract.ts      резюме -> профиль, промпт извлечения
    src/lib/ai/cost.ts         учёт расходов, лимиты по тарифам, kill switch
    src/lib/hh/client.ts       hh.ru API, нормализация, дедупликация
    src/lib/match/pipeline.ts  префильтр -> LLM
    src/worker.ts              три очереди: poll -> index -> match

## Чего ещё нет

UI, авторизация, загрузка файла (pdf-parse/mammoth -> resumes.raw_text),
Telegram-бот, cover letters. Следующий шаг — загрузка резюме и дашборд.
