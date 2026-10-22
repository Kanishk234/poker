import { useState } from 'react';
import { Dialog } from '../ui/Dialog.js';
import { fixture, previewSettings, scenes } from './fixtures.js';
import {
  Board,
  Card,
  Pot,
  Seat,
  TimerRing,
  TopBar,
  positionedStyle,
} from './components.js';
import { chips, displayOrder, positions } from './presentation.js';
import { RaiseSheet } from './RaiseSheet.js';
import { ActionBar } from './ActionBar.js';
import type { Scene } from './types.js';
export function TablePreview() {
  const query = new URLSearchParams(location.search);
  const [scene, setScene] = useState<Scene>(
    () => scenes.find((item) => item.id === query.get('scene'))?.id ?? 'flop',
  );
  const [count, setCount] = useState(() => {
    const requested = Number(query.get('players'));
    return Number.isInteger(requested) && requested >= 2 && requested <= 9
      ? requested
      : 6;
  });
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const settings = previewSettings(query);
  const view = fixture(scene, count, settings);
  const remainingSeconds = view.turn ? view.turn.deadlineMs / 1000 : 0;
  const you = view.seats[view.you.seat]!;
  const totalPot =
    view.pots.reduce((sum, pot) => sum + pot.amount, 0) +
    view.seats.reduce((sum, seat) => sum + (seat?.bet ?? 0), 0);
  const legal = view.you.legal;
  const acting = view.turn?.seat === view.you.seat;
  const opponentOrder = displayOrder(count, view.you.seat).slice(1);
  function changePreview(nextScene: Scene, nextCount: number) {
    setScene(nextScene);
    setCount(nextCount);
    setNotice('');
    setRaiseOpen(false);
    query.set('scene', nextScene);
    query.set('players', String(nextCount));
    history.replaceState(null, '', `/dev/table?${query}`);
  }
  function intent(text: string) {
    setNotice(`Preview: ${text}. The sample hand stays unchanged.`);
  }
  return (
    <main className="table-screen">
      <TopBar code={view.tableId} onInfo={() => setInfoOpen(true)} />
      <div className="preview-toolbar">
        <span className="preview-badge">Sample table</span>
        <label className="sr-only" htmlFor="scene">
          Hand scenario
        </label>
        <select
          id="scene"
          value={scene}
          onChange={(event) =>
            changePreview(event.target.value as Scene, count)
          }
        >
          {scenes.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="players">
          Player count
        </label>
        <select
          id="players"
          value={count}
          onChange={(event) => changePreview(scene, Number(event.target.value))}
        >
          {[2, 3, 4, 5, 6, 7, 8, 9].map((value) => (
            <option key={value} value={value}>
              {value} players
            </option>
          ))}
        </select>
      </div>
      <div className="table-meta">
        <span>
          {view.config.smallBlind} / {view.config.bigBlind} blinds
        </span>
        <span>Hand #{view.handNumber}</span>
      </div>
      <section
        className="table-stage"
        aria-label={`${count}-player ${scene} sample hand`}
      >
        {opponentOrder.map((seatIndex, index) => {
          const seat = view.seats[seatIndex];
          return (
            seat && (
              <div
                key={seatIndex}
                className="seat-position"
                style={positionedStyle(positions[count]![index]!)}
              >
                <Seat
                  seat={seat}
                  active={seat.seat === view.turn?.seat}
                  dealer={view.dealerSeat === seat.seat}
                  index={index}
                  remainingSeconds={remainingSeconds}
                  turnSeconds={view.config.turnSeconds}
                />
              </div>
            )
          );
        })}
        <div className="table-center">
          <Pot amount={totalPot} />
          <Board board={view.board} />
          <span
            className={`street-label ${scene === 'showdown' ? 'winner-label' : ''}`}
          >
            {scene === 'showdown'
              ? 'You have two pair · aces & jacks'
              : scene === 'allin'
                ? 'All-in · sample runout'
                : view.phase === 'preflop'
                  ? 'Waiting for the flop'
                  : 'Flop'}
          </span>
        </div>
      </section>
      <section
        className={`your-seat ${acting ? 'your-turn' : ''}`}
        aria-label="Your seat"
      >
        <div className="your-cards">
          {view.you.holeCards.map((card) => (
            <Card key={card} card={card} />
          ))}
        </div>
        <div className="your-details">
          <div className="your-name">
            You{' '}
            <span className="muted">
              {scene === 'showdown' ? 'Two pair' : 'Good company'}
            </span>
          </div>
          <div className="your-stack">
            {chips(you.stack)}
            <span className="muted"> chips</span>
          </div>
          <span className="your-status">
            {acting
              ? `Your turn · ${remainingSeconds}s`
              : scene === 'allin'
                ? 'All-in'
                : scene === 'showdown'
                  ? 'Showdown'
                  : 'At the table'}
          </span>
        </div>
        {acting && (
          <div className="your-timer">
            <TimerRing
              seconds={remainingSeconds}
              turnSeconds={view.config.turnSeconds}
            />
            <span>{remainingSeconds}</span>
          </div>
        )}
      </section>
      <div className="action-area">
        {acting && legal ? (
          <ActionBar
            legal={legal}
            onAction={intent}
            onRaise={() => setRaiseOpen(true)}
          />
        ) : (
          <div className="waiting-message">
            {scene === 'waiting'
              ? `Waiting for ${view.seats[view.turn!.seat]!.name}`
              : scene === 'allin'
                ? 'All-in. Waiting for showdown.'
                : 'A hand worth sticking around for.'}
          </div>
        )}
        <p className="action-notice" role="status" aria-live="polite">
          {notice || 'Sample hand. Play money. Make yourself at home.'}
        </p>
      </div>
      {raiseOpen && legal && (
        <RaiseSheet
          legal={legal}
          pot={totalPot}
          bigBlind={view.config.bigBlind}
          currentBet={you.bet}
          onClose={() => setRaiseOpen(false)}
          onConfirm={(amount) => {
            intent(`raise to ${chips(amount)}`);
            setRaiseOpen(false);
          }}
        />
      )}
      {infoOpen && (
        <Dialog title="A seat at the table" onClose={() => setInfoOpen(false)}>
          <p className="intro">
            This table is a design preview. Try different hands and player
            counts using the controls at the top.
          </p>
          <dl className="table-info">
            <div>
              <dt>Room code</dt>
              <dd>{view.tableId}</dd>
            </div>
            <div>
              <dt>Blinds</dt>
              <dd>
                {view.config.smallBlind} / {view.config.bigBlind}
              </dd>
            </div>
            <div>
              <dt>Seats</dt>
              <dd>{count}</dd>
            </div>
            <div>
              <dt>Turn timer</dt>
              <dd>{view.config.turnSeconds} seconds</dd>
            </div>
          </dl>
          <p className="quiet-note">
            Live rooms and shareable invites are coming soon.
          </p>
          <a className="button secondary" href="/">
            Back to home
          </a>
        </Dialog>
      )}
    </main>
  );
}
