import type { CardValue, Scene, TableView } from './types.js';
export const scenes: { id: Scene; label: string }[] = [
  { id: 'preflop', label: 'Preflop' },
  { id: 'flop', label: 'Flop' },
  { id: 'allin', label: 'All-in' },
  { id: 'showdown', label: 'Showdown' },
  { id: 'waiting', label: 'Their turn' },
];
const names = [
  'Jules',
  'Sam',
  'Alex',
  'Mika',
  'Theo',
  'Robin',
  'Noor',
  'Charlie',
  'Drew',
];
export interface PreviewSettings {
  stack: number;
  smallBlind: number;
  bigBlind: number;
  turnSeconds: number;
}
export function previewSettings(query: URLSearchParams): PreviewSettings {
  const stack = Number(query.get('stack'));
  const timer = Number(query.get('timer'));
  const blinds = query.get('blinds');
  const [smallBlind, bigBlind] =
    blinds === '5/10' ? [5, 10] : blinds === '25/50' ? [25, 50] : [10, 20];
  return {
    stack: [1000, 2000, 5000].includes(stack) ? stack : 2000,
    smallBlind: smallBlind!,
    bigBlind: bigBlind!,
    turnSeconds: [15, 30, 60].includes(timer) ? timer : 30,
  };
}
export function fixture(
  scene: Scene,
  count: number,
  settings = previewSettings(new URLSearchParams()),
): TableView {
  const stack = settings.stack - 200;
  const bet = settings.bigBlind * 2;
  const viewerSeat = Math.min(2, count - 1);
  const seats = Array.from({ length: count }, (_, seat) => ({
    seat,
    playerId: `sample-${seat}`,
    name: seat === viewerSeat ? 'You' : names[seat]!,
    stack,
    bet: 0,
    status: 'active' as const,
    connected: true,
    isHost: seat === viewerSeat,
    cards:
      seat === viewerSeat
        ? (['As', 'Jh'] as [CardValue, CardValue])
        : ('hidden' as const),
  }));
  const opponent = (viewerSeat + 1) % count;
  const board: CardValue[] =
    scene === 'preflop'
      ? []
      : scene === 'allin' || scene === 'showdown'
        ? ['Ah', '7c', 'Jd', '2s', '9h']
        : ['Ah', '7c', 'Jd'];
  const isFinished = scene === 'allin' || scene === 'showdown';
  const view: TableView = {
    tableId: 'K7QX2M',
    config: {
      smallBlind: settings.smallBlind,
      bigBlind: settings.bigBlind,
      maxSeats: count,
      turnSeconds: settings.turnSeconds,
    },
    phase: scene === 'waiting' ? 'flop' : scene,
    handId: 'sample-hand',
    handNumber: 12,
    dealerSeat: opponent,
    board,
    pots: [
      { amount: count * 200, eligibleSeats: seats.map((seat) => seat.seat) },
    ],
    seats,
    turn: isFinished
      ? null
      : {
          seat: scene === 'waiting' ? opponent : viewerSeat,
          turnId: 'sample-turn',
          deadlineMs: settings.turnSeconds * 600,
        },
    you: {
      seat: viewerSeat,
      holeCards: ['As', 'Jh'],
      legal:
        isFinished || scene === 'waiting'
          ? null
          : {
              canFold: true,
              canCheck: scene === 'preflop',
              callAmount: scene === 'preflop' ? 0 : bet,
              minRaiseTo: scene === 'preflop' ? bet : bet * 2,
              maxRaiseTo: stack,
              canAllIn: true,
            },
    },
    paused: false,
  };
  if (scene === 'flop' || scene === 'waiting') {
    view.seats[opponent] = {
      ...seats[opponent]!,
      stack: stack - bet,
      bet,
      lastAction: `Bet ${bet}`,
    };
    if (count > 2)
      view.seats[(viewerSeat + 2) % count] = {
        ...seats[(viewerSeat + 2) % count]!,
        lastAction: 'Checked',
      };
  }
  if (scene === 'allin') {
    view.pots = [
      {
        amount: count * 200 + stack * 2,
        eligibleSeats: [viewerSeat, opponent],
      },
    ];
    for (const seat of [viewerSeat, opponent])
      view.seats[seat] = {
        ...seats[seat]!,
        stack: 0,
        status: 'allin',
        lastAction: 'All-in',
      };
  }
  if (scene === 'showdown')
    view.seats[opponent] = {
      ...seats[opponent]!,
      cards: ['Ac', 'Kd'],
      lastAction: 'Pair of aces',
    };
  if (scene === 'showdown' || scene === 'allin') {
    for (const seat of seats)
      if (seat.seat !== viewerSeat && seat.seat !== opponent)
        view.seats[seat.seat] = { ...seat, status: 'folded', cards: null };
  }
  return view;
}
