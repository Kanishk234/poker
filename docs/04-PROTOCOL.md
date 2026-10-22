# 04 - Client/server protocol

Transport: Colyseus room `table` over WebSocket. Types and zod schemas live in `packages/shared`. `PROTOCOL_VERSION` is an integer; bump on any breaking change and reject mismatched clients with `VERSION_MISMATCH` so the PWA can prompt a refresh.

## Implementation status — M0

Protocol version **1** is the initial bootstrap transport only. The gameplay protocol below is the target for M3; gameplay messages are not implemented yet. M3 must bump the version when replacing this bootstrap contract.

- The app joins `table` using `{ protocol: 1 }`. This is a connectivity probe, not admission to a private game.
- On join, the server sends `hello`: `{ protocol: 1, message: "Connected to Felt" }`.
- Client `hello`: `{ text }` (trimmed, 1–80 characters, no extra fields) receives a `hello` echo with `{ protocol: 1, message: text }`.
- Malformed or unknown messages receive `error`: `{ code: "INVALID_MESSAGE", message, refType }`. Invalid join options are rejected with Colyseus error 400 and `VERSION_MISMATCH`.
- Browser origins must appear in `ALLOWED_ORIGINS` for both matchmaking and WebSocket upgrades. Message size is capped at 4 KiB.
- Room-code validation is shared now; actual code generation, lookup, and private-room admission arrive in M3. The landing join flow will prioritize typing a code, with invite links as a convenience.

## Creating and joining
- `POST /api/tables` with `{ config }` returns `{ code, roomId }`. `code` is 6 chars from an unambiguous alphabet (no `0/O/1/I`), ~30 bits of entropy or more.
- Invite link: `https://<host>/t/<code>`.
- Join options: `{ protocol, code, displayName, playerId?, sessionToken? }`.
  - First visit: server issues `playerId` + `sessionToken`; the client stores them in `localStorage`.
  - Returning/reconnecting: the token proves identity and restores the seat.

## Client -> server (intents)
All messages are validated; unknown types are rejected with an `error`.

| type | payload | notes |
| --- | --- | --- |
| `sit` | `{ seat, buyIn }` | seat must be empty; buyIn within config range |
| `stand` | `{}` | leave seat (folds if in a hand) |
| `action` | `{ handId, turnId, type, amount? }` | `amount` = raise-to for `bet`/`raise`. `turnId` rejects stale taps |
| `sitOut` / `sitIn` | `{}` | |
| `rebuy` | `{ amount }` | only between hands |
| `chat` | `{ text }` | max 200 chars, rate limited |
| `host` | `{ op, ... }` | host only: `kick`, `setBlinds`, `pause`, `resume`, `setTimer` (applies next hand) |
| `resync` | `{ lastSeq }` | ask for a fresh `update` |

## Server -> client

### `update`
```ts
{
  seq: number,            // strictly increasing per table
  view: TableView,        // full current state for THIS viewer
  events: TableEvent[],   // what happened since the previous seq (for animation)
  serverTime: number      // ms epoch, lets client show a correct countdown
}
```
Sent on join, reconnect, and after every state change. If the client sees a gap in `seq`, it sends `resync`.

### `error`
`{ code, message, refType? }` - codes: `VERSION_MISMATCH`, `INVALID_MESSAGE`, `NOT_YOUR_TURN`, `STALE_TURN`, `ILLEGAL_ACTION`, `SEAT_TAKEN`, `BAD_BUY_IN`, `NOT_HOST`, `RATE_LIMITED`, `TABLE_NOT_FOUND`.

### `chat`
`{ playerId, name, text, ts }` - text is plain text; the UI must render as text, never HTML.

## TableView (sketch)
```ts
type TableView = {
  tableId: string; config: TableConfig; phase: Phase;
  handId: string | null; handNumber: number; dealerSeat: number | null;
  board: Card[];
  pots: { amount: number; eligibleSeats: number[] }[];
  seats: (SeatView | null)[];
  turn: { seat: number; turnId: string; deadlineMs: number } | null;
  you: null | {
    seat: number | null;
    holeCards: [Card, Card] | null;
    legal: { canFold; canCheck; callAmount; minRaiseTo; maxRaiseTo; canAllIn } | null;
  };
  paused: boolean;
}
type SeatView = {
  seat: number; playerId: string; name: string; stack: number; bet: number;
  status: 'waiting' | 'active' | 'folded' | 'allin' | 'sitting_out' | 'busted';
  connected: boolean; isHost: boolean; lastAction?: string;
  cards: 'hidden' | [Card, Card] | null; // hidden = has cards, not visible to you; null = no cards
};
```

## The hidden-info rule
`cards` for another seat is `'hidden'` until showdown reveals it. The deck is never sent. Tests in `packages/engine` (and an integration test in `apps/server`) must fail if any opponent card appears early.

## Reconnection
- Server holds a seat for a disconnected player for the rest of the hand plus a grace period (default 60s via Colyseus `allowReconnection`). The action timer keeps running; timeouts auto-fold/check as normal.
- Client reconnects on `visibilitychange` (becoming visible), `online`, and socket close, with exponential backoff and a visible "Reconnecting..." state. After reconnect the server sends a fresh `update`.

## Rate limits (per connection)
`action` 10/s burst 5, `chat` 1/s burst 3, everything else 5/s. Exceeding => `RATE_LIMITED`; repeated abuse => disconnect.
