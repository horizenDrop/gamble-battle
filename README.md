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
