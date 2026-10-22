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

Open `http://localhost:5173` for the landing page, `/create` for the table setup preview, or `/dev/table` for sample hands. The server runs on port 2567; `http://localhost:2567/health` reports its status. Stop both with Ctrl+C.

M0 is the workspace and connection scaffold. M2 adds a static table UI: select preflop, flop, all-in, showdown, or another player's turn, with 2–9 seats. `/dev/table?scene=flop&players=9` opens a crowded sample. The create form carries supported stack/blind/timer settings into the preview. Names are remembered locally; code entry validates format only. Actions show feedback without altering fixtures. Timers are frozen sample displays.

The preview works without a game server. The engine now provides cards, injected Fisher–Yates shuffling, and best-five-of-seven hand evaluation. Betting, private rooms, real joining, and live timers are not implemented yet. The stats package is still empty. No protocol messages changed in M1/M2; server bootstrap tests still cover the M0 transport probe.

`localhost` links open only on the computer running the app. For a temporary phone-accessible HTTPS preview, run `pnpm --filter @felt/web build`, then `pnpm --filter @felt/web exec vite preview --host 127.0.0.1 --port 4173 --strictPort`. In another terminal run `cloudflared tunnel --url http://127.0.0.1:4173 --http-host-header localhost:4173`. Open the printed HTTPS URL on the phone. Install `cloudflared` using [Cloudflare's instructions](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). The tunnel serves the built UI only, needs both processes running, and anyone with its URL can access the preview. This is for testing; persistent hosting remains a launch task.

Local defaults work without env files. Copy each app's `.env.example` to `.env` to override them. Phone testing on your LAN also requires adding the web origin (for example `http://192.168.1.10:5173`) to the server's `ALLOWED_ORIGINS`. A deployed web build must set `VITE_SERVER_URL` to its game server URL.

Validation: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. Formatting: `pnpm format` / `pnpm format:check`. Production server: `pnpm --filter @felt/server start`. Package imports currently resolve workspace TypeScript sources through `tsx`; this is intentional, not a standalone `dist` deployment. CI checks all validation commands and a production dependency audit. Placeholder PWA icons can be regenerated with `node scripts/generate-icons.mjs`.

Engine validation: `pnpm test:engine:coverage` enforces at least 90% coverage per source file. `pnpm test:engine:exhaustive` checks exact category frequencies and distinct scores for every five-card hand; it is separate from the quick test suite and also runs in CI. The optional full seven-card distribution audit is not implemented yet.

## Starting with Codex

Open the repo and prompt:

> Read AGENTS.md and docs/07-ROADMAP.md. Complete milestone M0 only, tick the checkboxes as you go, and stop when its acceptance criteria pass.

Then continue one milestone (or one task group) at a time.
