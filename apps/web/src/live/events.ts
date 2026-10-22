import type { TableEvent, TableView } from '@felt/shared';
export interface Cue {
  key: string;
  kind: 'deal' | 'bet' | 'award';
  text: string;
}
// Only public labels enter the animation queue; the table always renders the latest view.
export function eventCues(
  events: readonly TableEvent[],
  view: TableView,
  seq: number,
): Cue[] {
  const name = (seat: number) => view.seats[seat]?.name ?? 'Player';
  return events.flatMap((event, index): Cue[] => {
    const key = `${seq}:${index}`;
    if (event.type === 'handStarted')
      return [{ key, kind: 'deal', text: `Hand #${event.handNumber}` }];
    if (event.type === 'boardDealt')
      return [
        {
          key,
          kind: 'deal',
          text:
            event.street === 'flop'
              ? 'Flop'
              : event.street === 'turn'
                ? 'Turn'
                : 'River',
        },
      ];
    if (event.type === 'playerActed')
      return [
        {
          key,
          kind: 'bet',
          text: `${name(event.seat)} ${event.action === 'fold' ? 'folds' : event.action === 'check' ? 'checks' : event.action === 'call' ? 'calls' : event.action === 'allin' ? 'is all-in' : `raises to ${event.raiseTo.toLocaleString('en-US')}`}`,
        },
      ];
    if (event.type === 'potAwarded')
      return [
        {
          key,
          kind: 'award',
          text: `${event.seats.map(name).join(' & ')} ${event.seats.length === 1 ? 'wins' : 'split'} ${event.amount.toLocaleString('en-US')}`,
        },
      ];
    return [];
  });
}
