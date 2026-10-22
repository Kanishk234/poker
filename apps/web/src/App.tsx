import { useEffect, useState } from 'react';
import { Client, type Room } from '@colyseus/sdk';
import { helloSchema, PROTOCOL_VERSION } from '@felt/shared';

type Connection = 'connecting' | 'connected' | 'offline';

export function App() {
  const [connection, setConnection] = useState<Connection>('connecting');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let disposed = false;
    let room: Room | undefined;
    const endpoint = import.meta.env.VITE_SERVER_URL as string | undefined;
    const client = new Client(
      endpoint ??
        `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.hostname}:2567`,
    );
    const timeout = window.setTimeout(() => {
      if (!disposed) setConnection('offline');
    }, 10_000);
    void client
      .joinOrCreate('table', { protocol: PROTOCOL_VERSION })
      .then((joined) => {
        if (disposed) {
          void joined.leave();
          return;
        }
        room = joined;
        joined.onMessage('hello', (message: unknown) => {
          if (!disposed) {
            window.clearTimeout(timeout);
            setConnection(
              helloSchema.safeParse(message).success ? 'connected' : 'offline',
            );
          }
        });
        joined.onMessage('error', () => {
          if (!disposed) setConnection('offline');
        });
        joined.onLeave(() => {
          if (!disposed) setConnection('offline');
        });
        joined.onError(() => {
          if (!disposed) setConnection('offline');
        });
      })
      .catch(() => {
        if (!disposed) {
          window.clearTimeout(timeout);
          setConnection('offline');
        }
      });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      void room?.leave();
    };
  }, [attempt]);

  return (
    <main className="app-shell flex min-h-dvh flex-col">
      <header className="masthead flex items-center justify-between">
        <a className="wordmark" href="/" aria-label="Felt home">
          felt<span aria-hidden="true">♠</span>
        </a>
        <span className="edition">Poker with friends</span>
      </header>
      <section
        className="welcome flex flex-1 flex-col items-center justify-center"
        aria-labelledby="welcome-title"
      >
        <div className="hand" aria-label="Ace of spades and ace of hearts">
          <div className="playing-card spade" aria-hidden="true">
            <span>
              A<small>♠</small>
            </span>
            <b>♠</b>
            <span className="card-bottom">
              A<small>♠</small>
            </span>
          </div>
          <div className="playing-card heart" aria-hidden="true">
            <span>
              A<small>♥</small>
            </span>
            <b>♥</b>
            <span className="card-bottom">
              A<small>♥</small>
            </span>
          </div>
        </div>
        <h1 id="welcome-title">
          Good hands.
          <br />
          Better company.
        </h1>
        <p className="intro">
          A little poker. Your favorite people.
          <br />
          Pull up a chair.
        </p>
        <div className="connection" role="status" aria-live="polite">
          <span className={`status-dot ${connection}`} aria-hidden="true" />
          {connection === 'connected'
            ? 'Connected'
            : connection === 'connecting'
              ? 'Connecting to the table…'
              : 'Can’t reach the table server'}
        </div>
        {connection === 'offline' && (
          <button
            className="retry"
            onClick={() => {
              setConnection('connecting');
              setAttempt((value) => value + 1);
            }}
          >
            Try again
          </button>
        )}
        <p className="coming-next">
          Private tables and room codes are coming next.
        </p>
      </section>
      <footer className="footer flex items-center justify-between">
        <span>Just for the love of the game.</span>
        <span>Play money only</span>
      </footer>
    </main>
  );
}
