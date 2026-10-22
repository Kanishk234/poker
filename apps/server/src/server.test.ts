import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import {
  createdTableSchema,
  errorSchema,
  PROTOCOL_VERSION,
  updateSchema,
  type Update,
} from '@felt/shared';
import { createGameServer } from './server.js';

const origin = 'http://localhost:5173';
const { gameServer, httpServer } = createGameServer([origin]);
let endpoint: string;
const config = {
  maxSeats: 3,
  smallBlind: 5,
  bigBlind: 10,
  minBuyIn: 100,
  maxBuyIn: 1000,
  actionSeconds: 5,
  assistAllowed: false,
};
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
async function create() {
  const response = await fetch(`${endpoint}/api/tables`, {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ config }),
  });
  expect(response.status).toBe(201);
  return createdTableSchema.parse(await response.json());
}
function nextMessage(room: Room, type: string): Promise<unknown> {
  return new Promise((resolve) => {
    const remove = room.onMessage(type, (payload: unknown) => {
      remove();
      resolve(payload);
    });
  });
}
class Peer {
  latest: Update | undefined;
  history: Update[] = [];
  constructor(readonly room: Room) {
    room.onMessage('welcome', () => {});
    room.onMessage('error', () => {});
    room.onMessage('chat', () => {});
    room.onMessage('update', (payload: unknown) => {
      this.latest = updateSchema.parse(payload);
      this.history.push(this.latest);
    });
  }
  async until(test: (update: Update) => boolean): Promise<Update> {
    const deadline = Date.now() + 12000;
    while (Date.now() < deadline) {
      if (this.latest && test(this.latest)) return this.latest;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Timed out waiting for table update');
  }
  send(type: string, payload: unknown) {
    this.room.send(type, payload);
  }
}
async function join(
  table: Awaited<ReturnType<typeof create>>,
  index: number,
  extra = {},
) {
  const room = await new Client(endpoint, {
    headers: { Origin: origin },
  }).joinById(table.roomId, {
    protocol: PROTOCOL_VERSION,
    code: table.code,
    displayName: `Friend ${index}`,
    ...extra,
  });
  const peer = new Peer(room);
  room.send('resync', { lastSeq: 0 });
  await peer.until(() => true);
  return peer;
}
describe('multiplayer transport', () => {
  it('serves health, creates private rooms and looks up valid codes', async () => {
    expect(await (await fetch(`${endpoint}/health`)).json()).toMatchObject({
      status: 'ok',
      protocol: PROTOCOL_VERSION,
    });
    const table = await create();
    const lookup = await fetch(`${endpoint}/api/tables/${table.code}`, {
      headers: { Origin: origin },
    });
    expect(await lookup.json()).toEqual({
      code: table.code,
      roomId: table.roomId,
    });
    expect(
      (
        await fetch(`${endpoint}/api/tables/AAAAAA`, {
          headers: { Origin: origin },
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await fetch(`${endpoint}/api/tables`, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: JSON.stringify({ config: { ...config, smallBlind: 10 } }),
        })
      ).status,
    ).toBe(400);
  });
  it('rejects unapproved origins and public matchmaking/room creation', async () => {
    for (const path of [
      '/api/tables',
      '/matchmake/joinOrCreate/table',
      '/matchmake/create/table',
    ]) {
      expect(
        (
          await fetch(`${endpoint}${path}`, {
            method: 'POST',
            headers: {
              Origin: 'https://unapproved.example',
              'Content-Type': 'application/json',
            },
            body: '{}',
          })
        ).status,
      ).toBe(403);
    }
    expect(
      (
        await fetch(`${endpoint}/matchmake/create/table`, {
          method: 'POST',
          headers: { Origin: origin, 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(403);
  });
  it('returns structured errors for broken JSON and oversized requests without creating a room', async () => {
    for (const [body, status] of [
      ['{ broken', 400],
      [JSON.stringify({ config, padding: 'x'.repeat(5000) }), 413],
    ] as const) {
      const response = await fetch(`${endpoint}/api/tables`, {
        method: 'POST',
        headers: { Origin: origin, 'Content-Type': 'application/json' },
        body,
      });
      expect(response.status).toBe(status);
      expect(errorSchema.parse(await response.json()).code).toBe(
        'INVALID_MESSAGE',
      );
    }
  });
  it('rejects wrong versions and wrong admission codes', async () => {
    const table = await create();
    await expect(
      join(table, 0, { protocol: PROTOCOL_VERSION + 1 }),
    ).rejects.toThrow('VERSION_MISMATCH');
    await expect(
      join(table, 0, { code: table.code === 'AAAAAA' ? 'BBBBBB' : 'AAAAAA' }),
    ).rejects.toThrow('TABLE_NOT_FOUND');
  });
  it('plays a three-client hand to showdown with private views, exact chips and stale-tap rejection', async () => {
    const table = await create();
    const peers = [
      await join(table, 0, { creatorToken: table.creatorToken }),
      await join(table, 1),
      await join(table, 2),
    ];
    try {
      for (let i = 0; i < peers.length; i++) {
        peers[i]!.send('sit', { seat: i, buyIn: 500 });
        await peers[i]!.until((u) => u.view.you?.seat === i);
      }
      const denied = nextMessage(peers[1]!.room, 'error');
      peers[1]!.send('host', { op: 'start' });
      expect(errorSchema.parse(await denied).code).toBe('NOT_HOST');
      for (const [type, payload] of [
        ['action', { type: 'raise', amount: 1.5 }],
        ['sit', { seat: 0, buyIn: 500, playerId: 'forged' }],
        ['unknown', {}],
      ] as const) {
        const error = nextMessage(peers[0]!.room, 'error');
        peers[0]!.send(type, payload);
        expect(errorSchema.parse(await error).code).toBe('INVALID_MESSAGE');
      }
      peers[0]!.send('host', { op: 'start' });
      let current = await peers[0]!.until((u) => u.view.phase === 'preflop');
      const first = current.view.turn!;
      const notActing = peers[(first.seat + 1) % 3]!;
      const wrongTurn = nextMessage(notActing.room, 'error');
      notActing.send('action', {
        handId: current.view.handId,
        turnId: first.turnId,
        type: 'fold',
      });
      expect(errorSchema.parse(await wrongTurn).code).toBe('NOT_YOUR_TURN');
      for (
        let step = 0;
        step < 30 && current.view.phase !== 'handOver';
        step++
      ) {
        for (const peer of peers) await peer.until((u) => u.seq >= current.seq);
        const actor = peers[current.view.turn!.seat]!;
        const own = actor.latest!.view;
        const intent = {
          handId: own.handId,
          turnId: own.turn!.turnId,
          type: own.you!.legal!.canCheck ? 'check' : 'call',
        };
        const previousSeq = current.seq;
        actor.send('action', intent);
        current = await peers[0]!.until((u) => u.seq > previousSeq);
        const stale = nextMessage(actor.room, 'error');
        actor.send('action', intent);
        expect(errorSchema.parse(await stale).code).toBe('STALE_TURN');
      }
      expect(current.view.phase).toBe('handOver');
      expect(current.view.board).toHaveLength(5);
      expect(
        current.view.seats.reduce((sum, s) => sum + (s?.stack ?? 0), 0),
      ).toBe(1500);
      expect(current.events.some((e) => e.type === 'potAwarded')).toBe(true);
      for (let index = 0; index < peers.length; index++) {
        const peer = peers[index]!;
        await peer.until((u) => u.seq >= current.seq);
        for (const update of peer.history) {
          const { view, events } = update;
          expect(JSON.stringify(update)).not.toMatch(
            /"(deck|burned|holeCardsDealtRaw)"/,
          );
          if (view.phase !== 'handOver')
            for (const s of view.seats)
              if (s && s.seat !== index)
                expect(Array.isArray(s.cards)).toBe(false);
          for (const e of events)
            if (e.type === 'holeCardsDealt') expect(e.seat).toBe(index);
          if (view.phase !== 'handOver')
            expect(events.some((e) => e.type === 'showdown')).toBe(false);
        }
      }
      const chat = nextMessage(peers[1]!.room, 'chat');
      peers[0]!.send('chat', { text: '<b>good hand</b>' });
      expect(await chat).toMatchObject({
        text: '<b>good hand</b>',
        name: 'Friend 0',
      });
    } finally {
      await Promise.all(peers.map((p) => p.room.leave()));
    }
  });
  it('runs the real server deadline and folds a timed-out player without losing chips', async () => {
    const table = await create();
    const host = await join(table, 0, { creatorToken: table.creatorToken });
    const guest = await join(table, 1);
    try {
      host.send('sit', { seat: 0, buyIn: 500 });
      guest.send('sit', { seat: 1, buyIn: 500 });
      await host.until((u) => u.view.seats.filter(Boolean).length === 2);
      host.send('host', { op: 'start' });
      await host.until((u) => u.view.phase === 'preflop');
      const ended = await host.until((u) => u.view.phase === 'handOver');
      expect(ended.events.some((e) => e.type === 'timeoutFold')).toBe(true);
      expect(
        ended.view.seats.reduce((sum, s) => sum + (s?.stack ?? 0), 0),
      ).toBe(1000);
      await host.until((u) => u.view.handNumber === 2);
    } finally {
      await host.room.leave();
      await guest.room.leave();
    }
  }, 15000);
});
