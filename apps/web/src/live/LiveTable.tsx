import { useEffect, useRef, useState } from 'react';
import { roomCodeSchema, type IntentMap } from '@felt/shared';
import { Dialog } from '../ui/Dialog.js';
import { ActionBar } from '../table/ActionBar.js';
import { RaiseSheet } from '../table/RaiseSheet.js';
import {
  Board,
  Card,
  Pot,
  Seat,
  TimerRing,
  TopBar,
  positionedStyle,
} from '../table/components.js';
import { chips, displayOrder, positions } from '../table/presentation.js';
import { eventCues, type Cue } from './events.js';
import { useTable } from './useTable.js';

export function LiveTable({ code, name }: { code: string; name: string }) {
  const connection = useTable(code, name);
  const { update, status, error, busy, send } = connection;
  const [sheet, setSheet] = useState<'info' | 'seat' | 'rebuy' | 'chat' | null>(
    null,
  );
  const [selectedSeat, setSelectedSeat] = useState(0);
  const [amount, setAmount] = useState('');
  const [raiseTurn, setRaiseTurn] = useState<string | null>(null);
  const [chatDraft, setChatDraft] = useState('');
  const [now, setNow] = useState(Date.now());
  const [cue, setCue] = useState<Cue | null>(null);
  const cues = useRef<Cue[]>([]);
  const lastSeq = useRef(-1);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!update || update.seq <= lastSeq.current) return;
    lastSeq.current = update.seq;
    if (update.events.some((e) => e.type === 'handStarted')) cues.current = [];
    cues.current = [
      ...cues.current,
      ...eventCues(update.events, update.view, update.seq),
    ].slice(-40);
  }, [update]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      const next = cues.current.shift();
      if (next) setCue(next);
    }, 400);
    return () => clearInterval(timer);
  }, []);
  const view = update?.view;
  if (!view)
    return (
      <main className="home-shell connection-screen">
        <a className="wordmark" href="/">
          felt♠
        </a>
        <h1>
          {status === 'closed'
            ? 'Let’s try that again.'
            : 'Pulling up a chair.'}
        </h1>
        <p className="intro" role="status">
          {error ||
            (status === 'waking'
              ? 'Waking up the server… Your table will open shortly.'
              : `Connecting to room ${code}…`)}
        </p>
        {status === 'closed' && (
          <>
            <button className="button primary" onClick={connection.retry}>
              Try again
            </button>
            <a className="button secondary" href="/">
              Back to home
            </a>
          </>
        )}
      </main>
    );
  const you = view.you;
  const ownSeat = you ? view.seats[you.seat] : null;
  const viewer = you?.seat ?? 0;
  const count = view.config.maxSeats;
  const remaining = Math.min(
    view.config.actionSeconds,
    Math.max(
      0,
      Math.ceil(
        ((view.turn?.deadlineMs ?? 0) - now - connection.offset.current) / 1000,
      ),
    ),
  );
  const acting =
    !!you && view.turn?.seat === you.seat && status === 'connected';
  const legal = acting ? you.legal : null;
  const totalPot =
    view.pots.reduce((sum, p) => sum + p.amount, 0) +
    view.seats.reduce((sum, s) => sum + (s?.bet ?? 0), 0);
  const isHost = view.hostId === connection.playerId || !!ownSeat?.isHost;
  const eligible = view.seats.filter(
    (s) => s && s.stack > 0 && s.status === 'waiting',
  ).length;
  function chooseSeat(index: number) {
    setSelectedSeat(index);
    setAmount(String(view!.config.minBuyIn));
    setSheet('seat');
  }
  function action(
    type: 'fold' | 'check' | 'call' | 'allin' | 'raise',
    raiseTo?: number,
  ) {
    if (!view?.turn || !view.handId) return;
    const base = { handId: view.handId, turnId: view.turn.turnId };
    const intent: IntentMap['action'] =
      type === 'raise'
        ? { ...base, type, amount: raiseTo! }
        : { ...base, type };
    send('action', intent);
    setRaiseTurn(null);
  }
  const occupied = view.seats.filter(Boolean).length;
  const bottom = view.seats[viewer];
  return (
    <main className="table-screen live-table">
      <TopBar code={code} onInfo={() => setSheet('info')} />
      {status !== 'connected' && (
        <div className="connection-banner" role="status">
          <span>
            {status === 'closed'
              ? 'Connection paused. Try reconnecting to your seat.'
              : 'Reconnecting… Your seat is held while we catch up.'}
          </span>
          {status === 'closed' && (
            <button className="button secondary" onClick={connection.retry}>
              Reconnect
            </button>
          )}
        </div>
      )}
      <div className="live-toolbar">
        <span
          className={`connection-dot ${status !== 'connected' ? 'offline' : ''}`}
        >
          {status === 'connected'
            ? `${occupied} / ${count} seated`
            : status === 'closed'
              ? 'Disconnected'
              : 'Reconnecting…'}
        </span>
        <button className="text-link" onClick={() => setSheet('chat')}>
          Chat{connection.chat.length ? ` (${connection.chat.length})` : ''}
        </button>
      </div>
      <div className="table-meta">
        <span>
          {view.config.smallBlind} / {view.config.bigBlind} blinds
        </span>
        <span>Hand #{view.handNumber}</span>
      </div>
      <section className="table-stage" aria-label="Live poker table">
        {displayOrder(count, viewer)
          .slice(1)
          .map((index, order) => {
            const seat = view.seats[index];
            return (
              <div
                key={index}
                className="seat-position"
                style={positionedStyle(positions[count]![order]!)}
              >
                {seat ? (
                  <Seat
                    seat={seat}
                    active={seat.seat === view.turn?.seat}
                    dealer={view.dealerSeat === seat.seat}
                    index={order}
                    remainingSeconds={remaining}
                    turnSeconds={view.config.actionSeconds}
                  />
                ) : (
                  <button
                    className="empty-seat"
                    aria-label={`Take seat ${index + 1}`}
                    disabled={!!you || busy || status !== 'connected'}
                    onClick={() => chooseSeat(index)}
                  >
                    <span aria-hidden="true">+</span>
                    <span>Open seat</span>
                  </button>
                )}
              </div>
            );
          })}
        <div className="table-center">
          {view.phase === 'waiting' ? (
            <div className="lobby-center">
              <span className="muted">Room code</span>
              <strong>{code}</strong>
              <p>Send this code to your people.</p>
            </div>
          ) : (
            <>
              <Pot amount={totalPot} />
              <div
                key={`${view.handId}:${view.board.length}`}
                className="live-board"
              >
                <Board board={view.board} />
              </div>
            </>
          )}
          <span
            key={cue?.key}
            className={`street-label live-cue ${cue ? `cue-${cue.kind}` : ''}`}
            aria-live="polite"
          >
            {view.phase === 'waiting'
              ? occupied < 2
                ? 'Good company is on the way.'
                : 'Ready when your host is.'
              : (cue?.text ?? view.phase)}
          </span>
        </div>
      </section>
      <section
        className={`your-seat ${acting ? 'your-turn' : ''}`}
        aria-label={you ? 'Your seat' : 'Spectator'}
      >
        {you && ownSeat ? (
          <>
            <div key={view.handId} className="your-cards live-hole">
              {you.holeCards ? (
                you.holeCards.map((card) => <Card key={card} card={card} />)
              ) : (
                <>
                  <Card />
                  <Card />
                </>
              )}
            </div>
            <div className="your-details">
              <div className="your-name">
                {ownSeat.name}
                <span className="muted">{isHost ? ' · Host' : ''}</span>
              </div>
              <div className="your-stack">
                {chips(ownSeat.stack)}
                <span className="muted"> chips</span>
              </div>
              <span className="your-status">
                {you.leavingAfterHand
                  ? 'Leaving after this hand'
                  : you.pendingSitOut
                    ? 'Sitting out next hand'
                    : ownSeat.status === 'busted'
                      ? 'Out of chips · rebuy to play'
                      : acting
                        ? `Your turn · ${remaining}s`
                        : ownSeat.status === 'allin'
                          ? 'All-in'
                          : ownSeat.status === 'sitting_out'
                            ? 'Sitting out'
                            : ownSeat.status === 'folded'
                              ? 'Folded'
                              : 'At the table'}
              </span>
            </div>
            {acting && (
              <div className="your-timer">
                <TimerRing
                  seconds={remaining}
                  turnSeconds={view.config.actionSeconds}
                />
                <span>{remaining}</span>
              </div>
            )}
          </>
        ) : bottom ? (
          <div className="spectator-seat">
            <Seat
              seat={bottom}
              active={bottom.seat === view.turn?.seat}
              dealer={view.dealerSeat === bottom.seat}
              index={0}
              remainingSeconds={remaining}
              turnSeconds={view.config.actionSeconds}
            />
            <span className="muted">You’re watching</span>
          </div>
        ) : (
          <button
            className="button secondary"
            disabled={busy || status !== 'connected'}
            onClick={() => chooseSeat(viewer)}
          >
            Take a seat
          </button>
        )}
      </section>
      <div className="action-area">
        <fieldset
          className="live-actions"
          disabled={busy || status !== 'connected'}
        >
          {legal ? (
            <ActionBar
              legal={legal}
              onAction={action}
              onRaise={() => setRaiseTurn(view.turn!.turnId)}
            />
          ) : isHost && !view.turn && eligible >= 2 ? (
            <button
              className="button primary"
              onClick={() => send('host', { op: 'start' })}
            >
              {view.started ? 'Deal next hand' : 'Start playing'}
            </button>
          ) : ownSeat?.status === 'sitting_out' ? (
            <button
              className="button primary"
              onClick={() => send('sitIn', {})}
            >
              I’m back
            </button>
          ) : ownSeat?.status === 'busted' ? (
            <button
              className="button primary"
              onClick={() => {
                setAmount(String(view.config.minBuyIn));
                setSheet('rebuy');
              }}
            >
              Rebuy chips
            </button>
          ) : !you && view.seats.some((s) => !s) ? (
            <button
              className="button primary"
              onClick={() => chooseSeat(view.seats.findIndex((s) => !s))}
            >
              Join the table
            </button>
          ) : (
            <div className="waiting-message">
              {view.phase === 'handOver'
                ? 'Next hand in a moment.'
                : view.turn
                  ? `Waiting for ${view.seats[view.turn.seat]?.name ?? 'the next player'}`
                  : occupied < 2
                    ? 'Share your code to get a game going.'
                    : 'Waiting for the host to start.'}
            </div>
          )}
        </fieldset>
        <p
          className={`action-notice ${error ? 'error-notice' : ''}`}
          role="status"
        >
          {error ||
            (status === 'closed'
              ? 'Connection paused. Use Reconnect above to try again.'
              : busy
                ? 'Sending…'
                : 'Play money. Good company.')}
        </p>
      </div>
      {raiseTurn === view.turn?.turnId && legal && ownSeat && (
        <RaiseSheet
          key={raiseTurn}
          legal={legal}
          pot={totalPot}
          bigBlind={view.config.bigBlind}
          currentBet={ownSeat.bet}
          onClose={() => setRaiseTurn(null)}
          onConfirm={(value) => action('raise', value)}
        />
      )}
      {(sheet === 'seat' || sheet === 'rebuy') && (
        <Dialog
          title={
            sheet === 'seat' ? 'Make yourself at home' : 'Back in the game'
          }
          onClose={() => setSheet(null)}
        >
          <p className="quiet-note">
            {chips(view.config.minBuyIn)}–{chips(view.config.maxBuyIn)} play
            chips.{' '}
            {sheet === 'rebuy'
              ? 'Top up between hands.'
              : 'No payments. Just poker.'}
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (sheet === 'seat')
                send('sit', { seat: selectedSeat, buyIn: Number(amount) });
              else send('rebuy', { amount: Number(amount) });
              setSheet(null);
            }}
          >
            <label>
              {sheet === 'seat' ? 'Buy-in chips' : 'Chips to add'}
              <input
                type="number"
                inputMode="numeric"
                min={sheet === 'seat' ? view.config.minBuyIn : 1}
                max={
                  sheet === 'seat'
                    ? view.config.maxBuyIn
                    : view.config.maxBuyIn - (ownSeat?.stack ?? 0)
                }
                step="1"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>
            <button className="button primary" disabled={busy} type="submit">
              {sheet === 'seat' ? 'Take this seat' : 'Add chips'}
            </button>
          </form>
        </Dialog>
      )}
      {sheet === 'info' && (
        <Dialog title="Your table" onClose={() => setSheet(null)}>
          <div className="room-code-card">
            <span className="muted">Room code</span>
            <strong>{code}</strong>
          </div>
          <p className="quiet-note">
            Friends can enter this code on the home screen, or open{' '}
            {location.origin}/t/{code}.
          </p>
          <dl className="table-info">
            <div>
              <dt>Blinds</dt>
              <dd>
                {view.config.smallBlind} / {view.config.bigBlind}
              </dd>
            </div>
            <div>
              <dt>Turn timer</dt>
              <dd>{view.config.actionSeconds}s</dd>
            </div>
          </dl>
          <div className="table-menu">
            {you && (
              <>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => {
                    send(
                      you.pendingSitOut || ownSeat?.status === 'sitting_out'
                        ? 'sitIn'
                        : 'sitOut',
                      {},
                    );
                    setSheet(null);
                  }}
                >
                  {you.pendingSitOut || ownSeat?.status === 'sitting_out'
                    ? 'Sit back in'
                    : 'Sit out next hand'}
                </button>
                <button
                  className="button secondary"
                  disabled={
                    busy ||
                    !!view.turn ||
                    (ownSeat?.stack ?? 0) >= view.config.maxBuyIn
                  }
                  onClick={() => {
                    setAmount(
                      String(
                        Math.min(
                          view.config.minBuyIn,
                          view.config.maxBuyIn - (ownSeat?.stack ?? 0),
                        ),
                      ),
                    );
                    setSheet('rebuy');
                  }}
                >
                  Rebuy chips
                </button>
                <button
                  className="button secondary"
                  disabled={busy || you.leavingAfterHand}
                  onClick={() => {
                    send('stand', {});
                    setSheet(null);
                  }}
                >
                  Leave seat
                </button>
              </>
            )}
            <a
              className="button secondary"
              href="/"
              onClick={(event) => {
                event.preventDefault();
                void connection.leave().finally(() => location.assign('/'));
              }}
            >
              Leave table
            </a>
          </div>
        </Dialog>
      )}
      {sheet === 'chat' && (
        <Dialog title="Table talk" onClose={() => setSheet(null)}>
          <div className="chat-messages" role="log" aria-live="polite">
            {connection.chat.length ? (
              connection.chat.map((entry, i) => (
                <p key={`${entry.ts}:${i}`}>
                  <strong>{entry.name}</strong> {entry.text}
                </p>
              ))
            ) : (
              <p className="quiet-note">Say hello to the table.</p>
            )}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              send('chat', { text: chatDraft });
              setChatDraft('');
            }}
          >
            <label>
              Message
              <input
                value={chatDraft}
                onChange={(event) => setChatDraft(event.target.value)}
                maxLength={200}
                required
              />
            </label>
            <button
              className="button primary"
              disabled={status !== 'connected'}
              type="submit"
            >
              Send message
            </button>
          </form>
        </Dialog>
      )}
    </main>
  );
}

export function RoomEntry({
  code,
  initialName,
  onName,
}: {
  code: string;
  initialName: string;
  onName: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [joinedName, setJoinedName] = useState(initialName.trim());
  if (!roomCodeSchema.safeParse(code).success)
    return (
      <main className="home-shell">
        <h1>Check that code.</h1>
        <p className="intro">Room codes have six letters or numbers.</p>
        <a className="button primary" href="/">
          Back to home
        </a>
      </main>
    );
  if (joinedName) return <LiveTable code={code} name={joinedName} />;
  return (
    <main className="home-shell connection-screen">
      <a className="wordmark" href="/">
        felt♠
      </a>
      <h1>A seat for you.</h1>
      <p className="intro">You’re joining room {code}.</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const trimmed = name.trim();
          if (trimmed) {
            onName(trimmed);
            setJoinedName(trimmed);
          }
        }}
      >
        <label>
          Your name
          <input
            autoComplete="nickname"
            maxLength={24}
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </label>
        <button className="button primary" type="submit">
          Join table
        </button>
      </form>
    </main>
  );
}
