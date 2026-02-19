# Base Game CORE (Isolated)

This repository is an isolated CORE for multiple Base Mini App games.
It is intentionally not connected to any existing game project, data, links, names, or builder codes.

## Structure
- packages/core-miniapp: Mini App runtime, wallet, chain, onchain-submit pipeline.
- packages/core-backend: leaderboard/profile domain and storage adapters.
- packages/core-gamekit: loop/input/progression/buff/game-balance primitives.
- apps/gamble-battle: slot spin + 1v1 tic-tac-toe wager game.
- docs/CORE_BLUEPRINT.md: complete implementation checklist.

## Design goals
- No game-specific branding baked in.
- Reusable modules with clear interfaces.
- Replaceable adapters for storage, wallet specifics, and gameplay rules.
- Ready to clone per new game without copy-paste chaos.

## Prompt Workflow
- Use `docs/GAME_CREATION_PROMPT.md` to generate a new game implementation request.
- Validate output against `docs/CORE_BLUEPRINT.md` before accepting.
