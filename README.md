# Felt (working name)

Play-money Texas Hold'em for friends. Mobile-first web app (PWA) with a clean table, private invite-link games, and post-game stats. No real money, ever.

> "Felt" is a placeholder name. Rename freely (search the repo for `Felt`).

## Docs

| Doc | What it covers |
| --- | --- |
| [AGENTS.md](./AGENTS.md) | Rules and workflow for Codex / AI agents. **Read first.** |
| [docs/01-PRODUCT.md](./docs/01-PRODUCT.md) | Vision, scope, non-goals, user stories |
| [docs/02-ARCHITECTURE.md](./docs/02-ARCHITECTURE.md) | Stack, repo layout, data flow, key decisions |
| [docs/03-GAME-ENGINE.md](./docs/03-GAME-ENGINE.md) | Poker rules spec, engine API, test plan |
| [docs/04-PROTOCOL.md](./docs/04-PROTOCOL.md) | Client/server messages and the hidden-info rule |
| [docs/05-DESIGN-MOBILE.md](./docs/05-DESIGN-MOBILE.md) | UI layout, interaction, PWA and iOS checklist |
| [docs/06-STATS.md](./docs/06-STATS.md) | Stat definitions, hand history schema, live assist |
| [docs/07-ROADMAP.md](./docs/07-ROADMAP.md) | Milestones M0-M8 with task checklists |
| [docs/08-DEPLOYMENT.md](./docs/08-DEPLOYMENT.md) | Free hosting setup, env vars, CI, security |
| [docs/DECISIONS.md](./docs/DECISIONS.md) | Running log of decisions (append as you go) |

## Stack (short)

Vite + React + TypeScript + Tailwind (PWA) / Node + Colyseus (WebSockets) / Supabase (auth + Postgres) / pnpm monorepo / Vitest.

## Getting started

Use Node 24 LTS and pnpm 10.28.2 (pinned in `package.json`). If pnpm is not on your PATH, use `corepack pnpm` in place of `pnpm` below.

```bash
pnpm install
pnpm dev        # web + server
pnpm test
```

Open `http://localhost:5173`. The shell shows **Connected** after receiving the game server's validated greeting. The server runs on port 2567; `http://localhost:2567/health` reports its status. Stop both with Ctrl+C.

M0 is the workspace and connection scaffold. Poker rules, private tables, and code/link admission are not implemented yet. The roadmap tracks the remaining work. Engine and stats packages are intentionally empty until their milestones.

Local defaults work without env files. Copy each app's `.env.example` to `.env` to override them. Phone testing on your LAN also requires adding the web origin (for example `http://192.168.1.10:5173`) to the server's `ALLOWED_ORIGINS`. A deployed web build must set `VITE_SERVER_URL` to its game server URL.

Validation: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Formatting: `pnpm format` / `pnpm format:check`. Production server: `pnpm --filter @felt/server start`. Package imports currently resolve workspace TypeScript sources through `tsx`; this is intentional, not a standalone `dist` deployment. CI checks all validation commands and a production dependency audit. Placeholder PWA icons can be regenerated with `node scripts/generate-icons.mjs`.

## Starting with Codex

Open the repo and prompt:

> Read AGENTS.md and docs/07-ROADMAP.md. Complete milestone M0 only, tick the checkboxes as you go, and stop when its acceptance criteria pass.

Then continue one milestone (or one task group) at a time.
