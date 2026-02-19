# Gamble Battle

Репозиторий содержит только код игры Gamble Battle без шаблонных универсальных слоев.

## Структура
- `apps/gamble-battle/src/index.ts` - публичный API игры.
- `apps/gamble-battle/src/modules/profile.ts` - профиль, лидерборд, прогрессия, storage.
- `apps/gamble-battle/src/modules/runtime.ts` - RAF loop и runtime-утилиты.
- `apps/gamble-battle/src/modules/wallet.ts` - кошелек, chain enforcement, onchain submit.

## Игра
- `spin` раз в час с наградой внутренней валютой.
- Бои 1v1 в крестики-нолики: `bot` и `pvp` (через lobby code).
- Ставки, payout, прогрессия игрока, лидерборд.

## Команды
- `npm run build`
- `npm run typecheck`

## Переменные окружения
- `GAME_NAME`
- `MINIAPP_MANIFEST_URL`
- `WEBHOOK_URL`
- `CHAIN_ID_HEX`
- `REQUIRE_WALLET` (опционально)
