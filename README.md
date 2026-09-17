# Gamble Battle

Gamble Battle - Base Mini App с hourly spin и 1v1 матчами.

## Структура
- `site/index.html` - мини-апп shell с `fc:frame` embed meta.
- `site/app.js` - инициализация Mini App SDK, context, ready handshake, wallet/actions.
- `site/styles.css` - mobile-first UI + safe-area CSS vars.
- `api/*` - backend endpoints (spin, check-in, profile, leaderboard, PvP).
- `api/_lib/*` - shared логика профиля, PvP и storage.
- `scripts/generate-public.mjs` - build-пайплайн: копирует `site` в `public`, генерирует `/.well-known/farcaster.json`.
- `vercel.json` - `outputDirectory` = `public`.

## Build
- `npm run build` - генерирует `public/*` для Vercel.
- `npm run smoke` - прогоняет API-эндпоинты в memory-режиме (без Redis).

## Env для Base Mini App билда
- `APP_URL` - полный публичный URL приложения, например `https://your-app.vercel.app`.
- `WEBHOOK_URL` - URL webhook endpoint.
- `FARCASTER_HEADER` - account association header.
- `FARCASTER_PAYLOAD` - account association payload.
- `FARCASTER_SIGNATURE` - account association signature.

## Env для API/хранилища
- `REDIS_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `PAYMASTER_URL`

Без одной из Redis-конфигураций стор работает в памяти: данные живут только в
пределах одного warm-инстанса Vercel и теряются при рестарте.

## Экономика
- Монеты меняются только в `/api/spin` и в PvP-эндпоинтах (`/api/pvp-join`,
  `/api/pvp-move`), где состояние матча держит сервер.
- `/api/battle` пишет только статистику PvE и никогда не меняет баланс.
- У API нет аутентификации: любой клиент может отправить чужой адрес и
  накрутить PvE-статистику. Для защиты нужна подпись кошелька (SIWE) - это
  отдельная задача.
