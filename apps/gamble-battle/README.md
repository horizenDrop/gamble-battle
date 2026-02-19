# Gamble Battle App

Модуль с игровой логикой и API для Base Mini App.

## API
- `createGambleBattle(config)`
- `parseGambleBattleEnv(rawEnv)`
- `mapTouchToGrid(x, y, width, height)`
- `mapKeyboardToCell(key)`

## Что включает
- Wallet gate и контроль chain.
- Hourly spin и внутриигровой баланс.
- PvP/PvE матчи со ставками.
- Профиль, XP/level, лидерборд.
- Onchain submit (`wallet_sendCalls` с fallback).

## Важно
- Профиль персистится полностью (включая баланс и таймер спина) через `storage`.
- Если `tsc` отсутствует в окружении, `npm run typecheck` не выполнится.
