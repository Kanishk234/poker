import type { CSSProperties } from 'react';
import type { CardValue, SeatView } from './types.js';
import { chips } from './presentation.js';
const suits = {
  s: ['♠', 'spades'],
  h: ['♥', 'hearts'],
  d: ['♦', 'diamonds'],
  c: ['♣', 'clubs'],
} as const;
const ranks: Record<string, string> = {
  A: 'Ace',
  K: 'King',
  Q: 'Queen',
  J: 'Jack',
  T: 'Ten',
  '2': 'Two',
  '3': 'Three',
  '4': 'Four',
  '5': 'Five',
  '6': 'Six',
  '7': 'Seven',
  '8': 'Eight',
  '9': 'Nine',
};
export function Card({
  card,
  small = false,
}: {
  card?: CardValue | 'hidden';
  small?: boolean;
}) {
  const suit =
    card && card !== 'hidden' ? suits[card[1] as keyof typeof suits] : null;
  return (
    <div
      role="img"
      aria-label={
        card === 'hidden'
          ? 'Face-down card'
          : card && suit
            ? `${ranks[card[0]!]} of ${suit[1]}`
            : 'Undealt community card'
      }
      className={`card ${small ? 'small-card' : ''} ${card === 'hidden' ? 'card-back' : !card ? 'card-slot' : ''} ${card?.endsWith('h') || card?.endsWith('d') ? 'red-card' : ''}`}
    >
      {suit && card !== 'hidden' && (
        <>
          <span className="card-rank">
            {card?.[0] === 'T' ? '10' : card?.[0]}
          </span>
          <span className="card-suit">{suit[0]}</span>
        </>
      )}
      {card === 'hidden' && <span aria-hidden="true">♠</span>}
    </div>
  );
}
export function TimerRing({
  seconds = 18,
  turnSeconds = 30,
}: {
  seconds?: number;
  turnSeconds?: number;
}) {
  return (
    <svg
      className="timer-ring"
      viewBox="0 0 48 48"
      role="img"
      aria-label={`${seconds} seconds remaining`}
    >
      <circle cx="24" cy="24" r="22" />
      <circle
        cx="24"
        cy="24"
        r="22"
        strokeDasharray="138.2"
        strokeDashoffset={138.2 * (1 - seconds / turnSeconds)}
      />
    </svg>
  );
}
export function Seat({
  seat,
  active,
  dealer,
  index,
  remainingSeconds,
  turnSeconds,
}: {
  seat: SeatView;
  active: boolean;
  dealer: boolean;
  index: number;
  remainingSeconds: number;
  turnSeconds: number;
}) {
  return (
    <div
      className={`seat ${active ? 'active-seat' : ''} ${seat.status === 'folded' ? 'folded-seat' : ''}`}
      data-seat={seat.seat}
    >
      <div className="avatar-wrap">
        {Array.isArray(seat.cards) ? (
          <div className="revealed-cards">
            {seat.cards.map((card) => (
              <Card key={card} card={card} small />
            ))}
          </div>
        ) : (
          <div className={`avatar avatar-${index % 5}`} aria-hidden="true">
            {seat.name.slice(0, 1)}
          </div>
        )}
        {active && (
          <TimerRing seconds={remainingSeconds} turnSeconds={turnSeconds} />
        )}
        {dealer && (
          <span className="dealer" aria-label="Dealer">
            D
          </span>
        )}
      </div>
      <span className="seat-name">{seat.name}</span>
      <span className="seat-stack">{chips(seat.stack)}</span>
      <span className="seat-action">
        {seat.status === 'allin'
          ? 'All-in'
          : seat.status === 'folded'
            ? 'Folded'
            : seat.status === 'sitting_out'
              ? 'Sitting out'
              : !seat.connected
                ? 'Offline'
                : (seat.lastAction ??
                  (seat.bet ? `Bet ${chips(seat.bet)}` : ' '))}
      </span>
    </div>
  );
}
export function Board({ board }: { board: CardValue[] }) {
  return (
    <div className="board" aria-label="Community cards">
      {Array.from({ length: 5 }, (_, index) => (
        <Card key={index} {...(board[index] ? { card: board[index] } : {})} />
      ))}
    </div>
  );
}
export function Pot({ amount }: { amount: number }) {
  return (
    <div className="pot">
      <span className="pot-label">In the pot</span>
      <span className="pot-value">
        <span className="chip-symbol" aria-hidden="true" />
        {chips(amount)}
      </span>
    </div>
  );
}
export function TopBar({ code, onInfo }: { code: string; onInfo: () => void }) {
  return (
    <header className="table-topbar">
      <a className="icon-button" href="/" aria-label="Back to home">
        ‹
      </a>
      <div>
        <span className="table-title">The good company table</span>
        <span className="table-code">Room {code}</span>
      </div>
      <button
        className="icon-button"
        aria-label="Table information"
        onClick={onInfo}
      >
        ···
      </button>
    </header>
  );
}
export function positionedStyle(
  position: readonly [number, number],
): CSSProperties {
  return { left: `${position[0]}%`, top: `${position[1]}%` };
}
