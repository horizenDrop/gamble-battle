# Gamble Battle

Gamble Battle - Base Mini App с hourly spin и 1v1 матчами.

## Runtime структура
- `site/index.html` - мини-апп shell с `fc:frame` embed meta.
- `site/app.js` - инициализация Mini App SDK, context, ready handshake, wallet/actions.
- `site/styles.css` - mobile-first UI + safe-area CSS vars.
- `scripts/generate-public.mjs` - build-пайплайн: копирует `site` в `public`, генерирует `/.well-known/farcaster.json`.
- `vercel.json` - `outputDirectory` = `public`.

## Game engine структура
- `apps/gamble-battle/src/index.ts` - публичный API игры.
- `apps/gamble-battle/src/modules/profile.ts` - профиль/XP/лидерборд/storage.
- `apps/gamble-battle/src/modules/runtime.ts` - loop и runtime-утилиты.
- `apps/gamble-battle/src/modules/wallet.ts` - wallet/chain/onchain submit.

## Build
- `npm run build` - генерирует `public/*` для Vercel.
- `npm run typecheck` - TypeScript проверка (после `npm install`).

## Env для Base Mini App билда
- `APP_URL` - полный публичный URL приложения, например `https://your-app.vercel.app`.
- `WEBHOOK_URL` - URL webhook endpoint.
- `FARCASTER_HEADER` - account association header.
- `FARCASTER_PAYLOAD` - account association payload.
- `FARCASTER_SIGNATURE` - account association signature.

## Env для game engine API (опционально)
- `GAME_NAME`
- `MINIAPP_MANIFEST_URL`
- `CHAIN_ID_HEX`
- `REQUIRE_WALLET`
