import { useState } from 'react';
import { roomCodeSchema } from '@felt/shared';
import { TablePreview } from './table/TablePreview.js';
import { Card } from './table/components.js';
import { Dialog } from './ui/Dialog.js';
import { RoomEntry } from './live/LiveTable.js';
import { createLiveTable } from './live/connection.js';

function storedName(): string {
  try {
    return localStorage.getItem('felt.name') ?? '';
  } catch {
    return '';
  }
}
export function App() {
  const [name, setName] = useState(storedName);
  const [joinOpen, setJoinOpen] = useState(false);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [creating, setCreating] = useState(false);
  const create = location.pathname === '/create';
  function rememberName(value: string) {
    setName(value);
    try {
      localStorage.setItem('felt.name', value);
    } catch {
      /* Private browsing can disable storage. */
    }
  }
  if (location.pathname === '/dev/table') return <TablePreview />;
  const roomPath = /^\/t\/([^/]+)\/?$/.exec(location.pathname);
  if (roomPath)
    return (
      <RoomEntry
        code={roomPath[1]!.toUpperCase()}
        initialName={name}
        onName={rememberName}
      />
    );
  return (
    <main className="home-shell">
      <header className="masthead">
        <a className="wordmark" href="/" aria-label="Felt home">
          felt<span aria-hidden="true">♠</span>
        </a>
        <span className="muted">Poker with friends</span>
      </header>
      {create ? (
        <section className="create-screen">
          <a className="back-link" href="/">
            ‹ Back
          </a>
          <h1>
            Your table.
            <br />
            Your people.
          </h1>
          <p className="intro">Keep it casual. Make yourself at home.</p>
          <form
            className="create-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (creating) return;
              const form = new FormData(event.currentTarget);
              const [smallBlind, bigBlind] = String(form.get('blinds'))
                .split('/')
                .map(Number);
              setCreating(true);
              setMessage('');
              try {
                const table = await createLiveTable({
                  maxSeats: Number(form.get('seats')),
                  smallBlind: smallBlind!,
                  bigBlind: bigBlind!,
                  minBuyIn: Number(form.get('stack')),
                  maxBuyIn: Number(form.get('stack')) * 5,
                  actionSeconds: Number(form.get('timer')),
                  assistAllowed: false,
                });
                location.assign(`/t/${table.code}`);
              } catch (error) {
                setMessage(
                  error instanceof Error
                    ? error.message
                    : 'Cannot create a table. Try again.',
                );
                setCreating(false);
              }
            }}
          >
            <label>
              Your name
              <input
                value={name}
                onChange={(event) => rememberName(event.target.value)}
                maxLength={24}
                placeholder="What should we call you?"
                autoComplete="nickname"
                required
              />
            </label>
            <div className="form-pair">
              <label>
                Starting chips
                <select name="stack" defaultValue="2000">
                  <option value="1000">1,000</option>
                  <option value="2000">2,000</option>
                  <option value="5000">5,000</option>
                </select>
              </label>
              <label>
                Blinds
                <select name="blinds" defaultValue="10/20">
                  <option>5/10</option>
                  <option>10/20</option>
                  <option>25/50</option>
                </select>
              </label>
            </div>
            <div className="form-pair">
              <label>
                Seats
                <select name="seats" defaultValue="6">
                  {[2, 3, 4, 5, 6, 7, 8, 9].map((count) => (
                    <option key={count}>{count}</option>
                  ))}
                </select>
              </label>
              <label>
                Turn timer
                <select name="timer" defaultValue="30">
                  <option value="15">15 seconds</option>
                  <option value="30">30 seconds</option>
                  <option value="60">60 seconds</option>
                </select>
              </label>
            </div>
            <p className="quiet-note">
              {message ||
                'Play chips only. Share your room code when you’re ready.'}
            </p>
            <button
              className="button primary"
              type="submit"
              disabled={creating}
            >
              {creating ? 'Creating your table…' : 'Create table'}
            </button>
          </form>
        </section>
      ) : (
        <section className="home-content">
          <div className="home-hand" aria-label="Pair of aces">
            <Card card="As" />
            <Card card="Ah" />
          </div>
          <h1>
            Good hands.
            <br />
            Better company.
          </h1>
          <p className="intro">
            A little poker. Your favorite people.
            <br />
            Pull up a chair.
          </p>
          <div className="home-actions">
            <a className="button primary" href="/create">
              Create table
            </a>
            <button
              className="button secondary"
              onClick={() => setJoinOpen(true)}
            >
              Join with code
            </button>
          </div>
          <a className="text-link" href="/dev/table">
            Take a look around <span aria-hidden="true">↗</span>
          </a>
        </section>
      )}
      <footer className="home-footer">
        <span>Just for the love of the game.</span>
        <span>Play money only</span>
      </footer>
      {joinOpen && (
        <Dialog title="Pull up a chair" onClose={() => setJoinOpen(false)}>
          <p className="intro">Have a room code? You’re in the right place.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const normalized = code.trim().toUpperCase();
              if (roomCodeSchema.safeParse(normalized).success && name.trim())
                location.assign(`/t/${normalized}`);
              else
                setMessage(
                  'Use six letters or numbers. Codes don’t contain 0, O, 1, or I.',
                );
            }}
          >
            <label>
              Your name
              <input
                autoComplete="nickname"
                value={name}
                onChange={(event) => rememberName(event.target.value)}
                maxLength={24}
                placeholder="Your name"
                required
              />
            </label>
            <label>
              Room code
              <input
                className="code-input"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={6}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value.toUpperCase());
                  setMessage('');
                }}
                placeholder="K7QX2M"
                required
                aria-describedby="join-message"
              />
            </label>
            <p id="join-message" className="quiet-note" role="status">
              {message || 'Ask your friend for their six-character room code.'}
            </p>
            <button className="button primary" type="submit">
              Join table
            </button>
            <a className="text-link centered" href="/dev/table">
              Explore a sample table
            </a>
          </form>
        </Dialog>
      )}
    </main>
  );
}
