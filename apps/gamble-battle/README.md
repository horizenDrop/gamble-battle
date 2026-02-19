# Gamble Battle App

Игровой модуль для Base Mini App.

## Игровой цикл
1. Игрок подключает кошелек.
2. Нажимает spin (не чаще 1 раза в час).
3. Получает награду в валюте по сумме символов слота.
4. Запускает бой 1v1:
- `bot` - матч против бота;
- `pvp` - матч против другого игрока через код лобби.
5. Победитель получает пул ставки за вычетом комиссии, профиль обновляется (score/xp/level).

## Публичный API
- `createGambleBattle(config)`
- `parseGambleBattleEnv(rawEnv)`
- `mapTouchToGrid(x, y, width, height)`
- `mapKeyboardToCell(key)`

## Основные возможности
- Wallet-gated flow.
- Chain switch enforcement.
- Submit pipeline (`wallet_sendCalls` + fallback).
- Лидерборд с сортировкой verified/best.
- Анти-абьюз базового уровня: rate limit, валидация входных данных.
- RAF loop и ограничения по бафам (cooldown/caps/duration).

## Конфиг
Обязательные env:
- `GAME_NAME`
- `MINIAPP_MANIFEST_URL`
- `WEBHOOK_URL`
- `CHAIN_ID_HEX`

Опционально:
- `REQUIRE_WALLET=true|false`

## Примечание по проверкам
Если `npm run typecheck` падает с ошибкой `tsc is not recognized`, установите TypeScript в окружение/проект.
