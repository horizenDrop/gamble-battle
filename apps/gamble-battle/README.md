# Gamble Battle App Engine

Игровой TypeScript модуль с API для спина, матчей и профиля.

## API
- `createGambleBattle(config)`
- `parseGambleBattleEnv(rawEnv)`
- `mapTouchToGrid(x, y, width, height)`
- `mapKeyboardToCell(key)`

## Что покрывает
- Wallet gate и chain enforcement.
- Onchain submit (`wallet_sendCalls` + fallback).
- Hourly spin и внутриигровой баланс.
- PvP/PvE tic-tac-toe с wager.
- Profile progression и leaderboard.

## Примечания
- Storage персистит полный профиль, включая `balance` и spin cooldown state.
- Для `npm run typecheck` требуется установленный TypeScript (`npm install`).
