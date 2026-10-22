// View-only fixture contract matching the protocol sketch. No wire messages change in M2.
export type CardValue =
  `${'2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A'}${'s' | 'h' | 'c' | 'd'}`;
export type SeatStatus =
  'waiting' | 'active' | 'folded' | 'allin' | 'sitting_out' | 'busted';
export interface SeatView {
  seat: number;
  playerId: string;
  name: string;
  stack: number;
  bet: number;
  status: SeatStatus;
  connected: boolean;
  isHost: boolean;
  lastAction?: string;
  cards: 'hidden' | [CardValue, CardValue] | null;
}
export interface LegalActions {
  canFold: boolean;
  canCheck: boolean;
  callAmount: number;
  minRaiseTo: number | null;
  maxRaiseTo: number;
  canAllIn: boolean;
}
export interface TableView {
  tableId: string;
  config: {
    smallBlind: number;
    bigBlind: number;
    maxSeats: number;
    turnSeconds: number;
  };
  phase: 'preflop' | 'flop' | 'allin' | 'showdown';
  handId: string;
  handNumber: number;
  dealerSeat: number;
  board: CardValue[];
  pots: { amount: number; eligibleSeats: number[] }[];
  seats: (SeatView | null)[];
  turn: { seat: number; turnId: string; deadlineMs: number } | null;
  you: {
    seat: number;
    holeCards: [CardValue, CardValue];
    legal: LegalActions | null;
  };
  paused: boolean;
}
export type Scene = 'preflop' | 'flop' | 'allin' | 'showdown' | 'waiting';
