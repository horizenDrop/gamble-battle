# Gamble Battle (Base Mini App)

Gamble Battle is a Base Mini App game built on CORE packages.

## Core loop
- Player spins a real slot once per hour.
- The rolled symbols are summed into in-game currency.
- Player can wager currency in 1v1 tic-tac-toe against bot or a real player.

## Run and typecheck
- `npm run build`
- `npm run typecheck`

## Required env
- `GAME_NAME`
- `MINIAPP_MANIFEST_URL`
- `WEBHOOK_URL`
- `CHAIN_ID_HEX`
- `REQUIRE_WALLET` (optional, default `true`)

## Main API
- `createGambleBattle(config)`
- `parseGambleBattleEnv(rawEnv)`
- `mapTouchToGrid(x, y, width, height)`
- `mapKeyboardToCell(key)`

## Reused CORE modules
- `@core/miniapp`: chain enforcement + onchain submit
- `@core/backend`: profile progression + leaderboard model
- `@core/gamekit`: RAF loop + buff balancing primitives
