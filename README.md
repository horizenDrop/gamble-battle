# Gamble Battle

Gamble Battle - это Base Mini App с циклом: слот раз в час -> получение внутриигровой валюты -> PvP/PvE матч 1v1 со ставкой.

## Что внутри
- Часовой слот с наградой по выпавшим символам.
- Внутриигровой баланс игрока.
- Дуэли в крестики-нолики:
- против бота;
- против реального игрока через lobby code.
- Профиль игрока: XP, уровень, базовые производные статы.
- Лидерборд по результатам матча.
- Wallet gate и onchain submit pipeline для Base Mini App.

## Структура проекта
- `apps/gamble-battle` - игровая логика и публичный API игры.
- `packages/core-miniapp` - кошелек, chain enforcement, submit транзакций.
- `packages/core-backend` - профиль, прогрессия, лидерборд.
- `packages/core-gamekit` - RAF loop, утилиты рантайма, баф-политики.

## Запуск
- `npm run build`
- `npm run typecheck`

## Переменные окружения
- `GAME_NAME`
- `MINIAPP_MANIFEST_URL`
- `WEBHOOK_URL`
- `CHAIN_ID_HEX`
- `REQUIRE_WALLET` (опционально, по умолчанию `true`)

## Статус
Репозиторий приведен к одной игре Gamble Battle. Шаблонные документы и `docs` удалены.
