import { useState } from 'react';
import { roomCodeSchema } from '@felt/shared';
import { TablePreview } from './table/TablePreview.js';
import { Card } from './table/components.js';
import { Dialog } from './ui/Dialog.js';

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
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const params = new URLSearchParams({
                scene: 'flop',
                players: String(form.get('seats')),
                stack: String(form.get('stack')),
                blinds: String(form.get('blinds')),
                timer: String(form.get('timer')),
              });
              location.assign(`/dev/table?${params}`);
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
              This is a design preview. Creating live rooms is coming soon.
            </p>
            <button className="button primary" type="submit">
              Preview table
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
              setMessage(
                roomCodeSchema.safeParse(code.trim().toUpperCase()).success
                  ? 'That code has the right format. Live rooms are coming soon; explore the sample table below.'
                  : 'Use six letters or numbers. Codes don’t contain 0, O, 1, or I.',
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
              {message || 'Preview only. No live room will be joined yet.'}
            </p>
            <button className="button primary" type="submit">
              Check code
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
