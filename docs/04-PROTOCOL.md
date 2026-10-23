# 04 - Client/server protocol

Transport: Colyseus room `table` over WebSocket. The zod schemas and inferred types in `packages/shared/src/index.ts` are the executable contract. Bump `PROTOCOL_VERSION` when changing the wire contract. Mismatched clients receive `VERSION_MISMATCH` and must refresh.

## Implementation status — M4 recovery, protocol 3

Version **3** extends M3's live private tables with session recovery and a reconnect-grace value in `welcome`. All inbound intents reject unknown fields and malformed values. Outgoing views/events are schema-checked after filtering for each recipient. There is no public raw engine state or event broadcast.

Browser origins must appear in `ALLOWED_ORIGINS` for HTTP creation/lookup, matchmaking and WebSocket upgrades. Inbound HTTP JSON and WebSocket messages are limited to 4 KiB. Only `joinById` and authenticated `reconnect` matchmaking are exposed; public room creation/listing is disabled. Unlisted rooms expire after ten minutes empty, and disposal cleans the code registry. Pending reconnect reservations count as visitors until final departure.

Dropped connections now preserve their player identity, seat and host role through `allowReconnection`. Refresh uses the same private credential. Voluntary departure or reservation expiry uses the engine's safe withdrawal command. Chat has a one-message-per-second throttle; general token-bucket limits and host management remain later M4 task groups.

## Creating and joining

- `POST /api/tables` with `{ config }` returns `{ code, roomId, creatorToken }` (201). Invalid config receives `INVALID_MESSAGE` (400); room creation failure receives `SERVER_UNAVAILABLE` (503).
- Config: `{ maxSeats: 2..9, smallBlind, bigBlind, minBuyIn, maxBuyIn, actionSeconds: 5..120, assistAllowed }`. Chip values are positive safe integers. Small blind < big blind; min buy-in <= max buy-in; max buy-in covers the big blind and preserves safe total-table arithmetic.
- Codes contain six uniformly random characters from `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (30 bits), using Node crypto. Collisions are retried before room creation. Codes are the main join flow; `/t/:code` links are a convenience.
- `GET /api/tables/:code` returns `{ code, roomId }`, or `TABLE_NOT_FOUND` (404). Never returns the creator credential or game state.
- Join through SDK `joinById(roomId, { protocol: 3, code, displayName, creatorToken? })`. Names are trimmed, 1–24 characters. Wrong code: `TABLE_NOT_FOUND`; mismatched protocol: `VERSION_MISMATCH`; other malformed join options: `INVALID_MESSAGE`.
- The server assigns a random player ID and sends `welcome: { protocol: 3, playerId, reconnectGraceSeconds: 60 }`, including after reconnect. Clients cannot choose a player ID, own another seat, or specify which player performs an action.
- Only the first connection presenting the random UUID `creatorToken` becomes host. The browser keeps this credential in sessionStorage, never in a link or public view. The host role transfers to a remaining connected visitor when the host leaves. Names stored in localStorage are preferences, not credentials.
- Creating/joining does not automatically seat or start anyone. Pick a seat and buy-in; the host starts with at least two eligible players. Subsequent hands start five seconds after settlement when at least two players are ready. The host can deal sooner.

## Client → server intents

Every payload is strict; unknown types/fields receive `error`. All chip values are safe integers. Seats are 0–8, additionally bounded by the table configuration.

| Type               | Payload                             | Behavior                                                                                                                                                        |
| ------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sit`              | `{ seat, buyIn }`                   | Empty seat, configured buy-in limits; a connection can own only one seat. Mid-hand arrivals wait.                                                               |
| `stand`            | `{}`                                | Withdraw immediately between hands. During a hand, fold on the next legal turn and withdraw after payout; preserve all-in eligibility.                          |
| `action`           | `{ handId, turnId, type, amount? }` | `fold`, `check`, `call`, `allin` have no amount; `bet`/`raise` require a positive raise-to amount. Server checks hand/turn freshness before calling the engine. |
| `sitOut` / `sitIn` | `{}`                                | Preference takes effect next hand; sit-in also clears consecutive timeouts.                                                                                     |
| `rebuy`            | `{ amount }`                        | Positive addition between hands, subject to configured stack limits.                                                                                            |
| `chat`             | `{ text }`                          | Trimmed 1–200 characters; one per second.                                                                                                                       |
| `host`             | `{ op: 'start' }`                   | Host only; at least two eligible seats and no active hand.                                                                                                      |
| `resync`           | `{ lastSeq }`                       | Current snapshot, current sequence, empty events; does not mutate the table.                                                                                    |

The server schedules action deadlines and calls `applyTimeout` with the current timestamp; it auto-checks when legal, otherwise folds. Two consecutive timeouts sit a player out at hand end. All game rules remain in the pure engine. The server uses a cryptographic RNG adapter.

## Server → client

`update`:

```ts
{
  seq: number;           // increasing per table change
  view: TableView;       // THIS recipient's full current state
  events: TableEvent[];  // separately filtered for THIS recipient
  serverTime: number;    // epoch milliseconds for countdown offset
}
```

Sent on join and engine/membership changes. On a sequence gap, the browser asks for `resync`. Resync may repeat the current sequence. Stale, duplicate and previous-hand actions receive `STALE_TURN`. The browser renders the latest view immediately and queues public animation labels for dealing, bets and awards. It never replays old views or queues private cards.

`error`: `{ code, message, refType? }`. Codes include engine validation codes and `VERSION_MISMATCH`, `INVALID_MESSAGE`, `NOT_HOST`, `NOT_SEATED`, `ALREADY_SEATED`, `NOT_JOINED`, `STALE_TURN`, `TABLE_NOT_FOUND`, `RATE_LIMITED`, `SERVER_UNAVAILABLE`, `INTERNAL_ERROR`. Unexpected command failures log only room/type metadata; no payloads or engine state.

`chat`: `{ playerId, name, text, ts }`. Always render text, never HTML. Chat is ephemeral and not included in snapshots.

`TableEvent` is the shared strict union of public engine events and recipient-only `holeCardsDealt`. It includes hand/button/blind/street progression, actions, showdown, uncalled returns, pot awards with exact shares, busts, hand end, seating/removal, departure preference, rebuys, sit-out preferences and timeout events. See the shared schema for exact fields.

## TableView

```ts
type TableView = {
  tableId: string;
  config: TableConfig;
  phase: 'waiting' | 'preflop' | 'flop' | 'turn' | 'river' | 'handOver';
  handId: string | null;
  handNumber: number;
  dealerSeat: number | null;
  board: Card[];
  pots: { amount: number; eligibleSeats: number[] }[];
  seats: (SeatView | null)[];
  turn: { seat: number; turnId: string; deadlineMs: number } | null;
  you: null | {
    seat: number;
    holeCards: [Card, Card] | null;
    legal: LegalActions | null;
    pendingSitOut: boolean;
    leavingAfterHand: boolean;
  };
  paused: boolean;
  hostId: string | null;
  started: boolean;
};
type LegalActions = {
  canFold: boolean;
  canCheck: boolean;
  callAmount: number;
  minRaiseTo: number | null;
  maxRaiseTo: number;
  canAllIn: boolean;
};
type SeatView = {
  seat: number;
  playerId: string;
  name: string;
  stack: number;
  bet: number;
  status: 'waiting' | 'active' | 'folded' | 'allin' | 'sitting_out' | 'busted';
  connected: boolean;
  isHost: boolean;
  cards: 'hidden' | [Card, Card] | null;
};
```

`you` is null for spectators/fully withdrawn seats. Config uses `actionSeconds`; the `/dev/table` fixture-only contract keeps its historical `turnSeconds`. Pots exclude current street bets (displayed on seats). After settlement, pots are empty and chips are already in stacks; award events carry the result. `paused` remains false until M4 host tools.

## Hidden information

Build every recipient view using engine `viewFor(state, seat|'spectator')`; separately filter events using `eventsFor(events, viewer, state)`. Other players' cards stay `'hidden'` until revealed at showdown. Deck, burns, folded opponents' cards, internal state and other players' private deals never reach clients. Retained cards/events are bound to both player and hand identity to protect seat reuse. Engine property tests and a real three-client server integration test run in CI.

## Reconnection and cold starts

- On a non-consented drop, reserve the same Colyseus session with `allowReconnection`. Keep the seat, cards, chips and host identity; mark the seat disconnected in other players' snapshots. Disconnect/reconnect must not reset an existing action deadline.
- Hold the reservation through the currently active hand, then for 60 seconds after it ends. Between hands, the 60-second grace begins immediately. Timers continue to check/fold; two consecutive timeouts still sit a player out. A grace expiry triggers final departure, host transfer and chip withdrawal through the engine.
- The SDK's random reconnect token is the identity credential. Browser sessionStorage holds a strictly validated `{ protocol, code, playerId, reconnectionToken }` for each room; memory provides same-page recovery if storage is unavailable. Never put tokens in URLs, public messages or logs. SessionStorage isolates unrelated tabs; a new tab joins as a new guest.
- Refresh calls SDK `reconnect(room.reconnectionToken)`. Its native matchmaking body `{ reconnectionToken }` is validated with a shared strict schema before Colyseus authenticates the reservation. Successful recovery keeps the original player/session IDs and rotates the token; old tokens fail.
- On reconnect, send welcome plus a fresh recipient-specific snapshot with empty historical events. The browser also requests resync, updates its server-time offset and enables actions only after receiving a valid current view. Never queue or replay old poker intents.
- Retry with exponential delay, capped at four seconds, up to 25 attempts or a 90-second elapsed retry budget (an in-flight request has its own 20-second timeout). `online` wakes a pending retry. On visible/online, request a fresh snapshot; if a supposedly live connection fails to respond within three seconds, close it for recovery.
- Show a reconnecting banner while retaining the last view, with action controls disabled. Exhausted retries offer a manual Reconnect button. Invalid versions/malformed admission/missing rooms stop retrying. An expired reservation rejoins as a spectator and explains that a new seat is needed.
- An initial connection taking over four seconds, or a transient server failure, shows "Waking up the server…" and retries. Missing rooms remain a terminal error rather than a permanent waking screen.
- Explicit **Leave table** clears the local credential and sends consented departure, without reconnect grace. Normal refresh or accidental navigation preserves the reservation. Consent/expiry transfers host access; a transient drop does not.

Server timer callbacks recheck the wall-time deadline before invoking the engine: Colyseus's delta clock can fire slightly early. Early callbacks are rescheduled without changing the turn's deadline.

## Remaining M4 targets

- Host kick/pause/resume and next-hand blind/timer changes.
- Per-connection limits: action 10/s burst 5; chat 1/s burst 3; other intents 5/s; repeated abuse disconnects. M3 currently applies only chat's simple one-second throttle.
