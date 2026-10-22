import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { errorSchema, helloSchema, PROTOCOL_VERSION } from '@felt/shared';
import { createGameServer } from './server.js';

const origin = 'http://localhost:5173';
const { gameServer, httpServer } = createGameServer([origin]);
let endpoint: string;

beforeAll(async () => {
  await gameServer.listen(0, '127.0.0.1');
  const address = httpServer.address();
  if (!address || typeof address === 'string')
    throw new Error('Missing test port');
  endpoint = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  await gameServer.gracefullyShutdown(false);
});

function nextMessage(
  room: Room,
  type: string,
  accepts: (payload: unknown) => boolean = () => true,
): Promise<unknown> {
  return new Promise((resolve) => {
    const remove = room.onMessage(type, (payload: unknown) => {
      if (accepts(payload)) {
        remove();
        resolve(payload);
      }
    });
  });
}

function client() {
  return new Client(endpoint, { headers: { Origin: origin } });
}

describe('table transport', () => {
  it('exposes a health endpoint', async () => {
    const response = await fetch(`${endpoint}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      status: 'ok',
      protocol: PROTOCOL_VERSION,
    });
  });

  it('joins, echoes a validated hello, rejects bad input, and stays usable', async () => {
    const room = await client().joinOrCreate('table', {
      protocol: PROTOCOL_VERSION,
    });
    try {
      const hello = nextMessage(
        room,
        'hello',
        (payload) =>
          helloSchema.safeParse(payload).data?.message === 'hello friends',
      );
      room.send('hello', { text: 'hello friends' });
      expect(helloSchema.parse(await hello).message).toBe('hello friends');
      const malformed = nextMessage(room, 'error');
      room.send('hello', { text: 123 });
      expect(errorSchema.parse(await malformed).code).toBe('INVALID_MESSAGE');
      const unknown = nextMessage(room, 'error');
      room.send('not-a-message', {});
      expect(errorSchema.parse(await unknown).code).toBe('INVALID_MESSAGE');
      const echo = nextMessage(room, 'hello');
      room.send('hello', { text: 'still here' });
      expect(helloSchema.parse(await echo).message).toBe('still here');
    } finally {
      await room.leave();
    }
  });

  it('rejects incompatible clients', async () => {
    await expect(
      client().joinOrCreate('table', { protocol: PROTOCOL_VERSION + 1 }),
    ).rejects.toThrow('VERSION_MISMATCH');
  });

  it('rejects matchmaking from unapproved origins', async () => {
    const response = await fetch(`${endpoint}/matchmake/joinOrCreate/table`, {
      method: 'POST',
      headers: {
        Origin: 'https://unapproved.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ protocol: PROTOCOL_VERSION }),
    });
    expect(response.status).toBe(403);
  });
});
