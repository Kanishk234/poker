# 08 - Deployment, environments, and security

Goal: run the whole thing at $0 for a friends-sized beta. **Free tier limits and terms change; verify current terms before relying on them.**

## Hosting map
| Piece | Option (free tier) | Notes |
| --- | --- | --- |
| Web (static PWA) | Cloudflare Pages, Vercel, or Netlify | HTTPS required for service workers/PWA |
| Game server (WebSocket) | Render, Fly.io, or Railway | Free web services may **sleep when idle** and cold-start slowly; the UI must handle "waking up" |
| DB + Auth | Supabase free project | Free projects may **pause after inactivity**; check current policy |
| CI | GitHub Actions | Free minutes for public repos; limited for private |
| Domain | Provider-assigned subdomain | A custom domain costs money; not needed for beta |

Design implications:
- Server keeps rooms in memory, so a sleeping/restarting server loses active tables. Fine for a beta; the M4 "voided hand" recovery covers it.
- Don't rely on an uptime-pinger hack without checking the provider's terms.

## Environment variables
`apps/web/.env` (public; anything `VITE_*` ships to the browser):
```
VITE_SERVER_URL=wss://your-server.example.com
VITE_API_URL=https://your-server.example.com
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
`apps/server/.env` (secret; never commit):
```
PORT=2567
ALLOWED_ORIGINS=https://your-web.example.com,http://localhost:5173
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...        # server only
NODE_ENV=production
```
Commit `.env.example` files with placeholder values only.

## Environments
- **local:** `pnpm dev` (web on 5173, server on 2567).
- **local on phone:** expose via a tunnel (e.g. Cloudflare Tunnel / ngrok) or run web with `--host` on the same Wi-Fi. Service workers need HTTPS except on `localhost`, so use a tunnel to test PWA install.
- **prod:** static web + server + Supabase. Add a **staging** copy only if needed.

## CI (GitHub Actions)
On every push/PR: checkout, setup pnpm + Node LTS, `pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`. The slow evaluator distribution test runs on a nightly schedule or manual trigger only.
Deploy: connect the web host to the repo for auto-deploy on `main`; deploy the server via the host's Git integration or a Dockerfile.

## Server health and ops
- `GET /health` returns `200` + version + uptime.
- Structured logs (JSON) with `tableId`, `handId`, `playerId`. **Never log hole cards or the deck.**
- Graceful shutdown: stop accepting new tables, let hands finish if possible, then persist last-hand snapshots.

## Security checklist
- [ ] All inbound messages validated with zod; max message size enforced.
- [ ] Rate limits per connection (see 04-PROTOCOL); disconnect repeat offenders.
- [ ] CORS and WebSocket origin restricted to `ALLOWED_ORIGINS`.
- [ ] Table codes unguessable (>= ~30 bits) and tables expire when empty for N minutes.
- [ ] Chat rendered as text only (no `dangerouslySetInnerHTML`); length-limited; basic profanity/spam throttling optional.
- [ ] Session tokens random and unguessable; stored hashed on the server if persisted.
- [ ] Supabase RLS enabled on every table; the service key stays server-side.
- [ ] Hidden-info tests run in CI (engine + integration).
- [ ] Dependency audit (`pnpm audit`) in CI; pin versions that are at least a couple of weeks old.
- [ ] Privacy: no personal data required for guests; a short privacy note before any accounts launch.

## Cost guard
Everything above targets $0. The first real costs appear if you (a) want the App Store (Apple Developer Program, $99/year), (b) outgrow free tiers, or (c) want a custom domain. Decide these only after friends are actually playing.
