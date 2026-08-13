#!/usr/bin/env bash
# Деплой на meet.rbmclub.com. Запускать на сервере из ~/career.
set -euo pipefail

cd "$(dirname "$0")"

# Не собираем во время звонка: сборка next на 2 CPU займёт всё ядро.
CONF=$(curl -s --max-time 3 localhost:8080/colibri/stats | grep -o '"conferences":[0-9]*' | cut -d: -f2 || echo 0)
if [ "${CONF:-0}" != "0" ]; then
  echo "В Jitsi сейчас ${CONF} конференций. Деплой отменён — повторите позже."
  exit 1
fi

git pull --ff-only
docker compose build app
docker compose up -d app worker
sleep 5
curl -fsS -o /dev/null http://127.0.0.1:3010/career/login && echo "Готово: https://meet.rbmclub.com/career/login"
