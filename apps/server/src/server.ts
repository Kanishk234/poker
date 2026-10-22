import { createServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { createRouter, matchMaker, Server } from '@colyseus/core';
import express from 'express';
import { WebSocketTransport } from '@colyseus/ws-transport';
import {
  createTableSchema,
  PROTOCOL_VERSION,
  ROOM_CODE_ALPHABET,
  roomCodeSchema,
} from '@felt/shared';
import { TableRoom } from './table-room.js';

export function createGameServer(allowedOrigins: string[]): {
  gameServer: Server;
  httpServer: ReturnType<typeof createServer>;
} {
  const startedAt = Date.now();
  const httpServer = createServer();
  const rooms = new Map<string, string>();
  class RegisteredTableRoom extends TableRoom {
    override onDispose(): void {
      super.onDispose();
      for (const [code, roomId] of rooms)
        if (roomId === this.roomId) rooms.delete(code);
    }
  }
  const gameServer = new Server({
    express: (app) => {
      app.use('/api', (request, response, next) => {
        const origin = request.headers.origin ?? '';
        if (!allowedOrigins.includes(origin)) {
          response.sendStatus(403);
          return;
        }
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader(
          'Access-Control-Allow-Methods',
          'GET, POST, OPTIONS',
        );
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        response.setHeader('Cache-Control', 'no-store');
        if (request.method === 'OPTIONS') {
          response.sendStatus(204);
          return;
        }
        next();
      });
      app.use('/api', express.json({ limit: '4kb' }));
      app.post('/api/tables', async (request, response) => {
        const parsed = createTableSchema.safeParse(request.body);
        if (!parsed.success) {
          response
            .status(400)
            .json({
              code: 'INVALID_MESSAGE',
              message: 'Choose valid table settings.',
            });
          return;
        }
        // Claim the code before awaiting room creation so concurrent requests cannot collide.
        let code: string;
        do {
          code = Array.from(
            { length: 6 },
            () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
          ).join('');
        } while (rooms.has(code));
        rooms.set(code, '');
        try {
          const creatorToken = randomUUID();
          const room = await matchMaker.createRoom('table', {
            config: parsed.data.config,
            code,
            creatorToken,
          });
          rooms.set(code, room.roomId);
          response
            .status(201)
            .json({ code, roomId: room.roomId, creatorToken });
        } catch {
          rooms.delete(code);
          response
            .status(503)
            .json({
              code: 'SERVER_UNAVAILABLE',
              message: 'The table could not be created. Try again.',
            });
        }
      });
      app.get('/api/tables/:code', async (request, response) => {
        const code = roomCodeSchema.safeParse(request.params.code);
        const roomId = code.success ? rooms.get(code.data) : undefined;
        if (roomId) {
          try {
            if (await matchMaker.getRoomById(roomId)) {
              response.json({ code: code.data, roomId });
              return;
            }
          } catch {
            /* Expired room. */
          }
          rooms.delete(code.data!);
        }
        response
          .status(404)
          .json({
            code: 'TABLE_NOT_FOUND',
            message: 'That room is closed or the code is incorrect.',
          });
      });
      app.get('/health', (_request, response) => {
        response.json({
          status: 'ok',
          protocol: PROTOCOL_VERSION,
          uptime: Math.floor((Date.now() - startedAt) / 1000),
        });
      });
    },
    transport: new WebSocketTransport({
      server: httpServer,
      maxPayload: 4096,
      verifyClient: ({ origin }: { origin: string }) =>
        allowedOrigins.includes(origin),
    }),
    greet: false,
    gracefullyShutdown: false,
  });
  gameServer.router = createRouter(
    {},
    {
      onRequest: (request) => {
        if (
          new URL(request.url).pathname.startsWith('/matchmake/') &&
          (!allowedOrigins.includes(request.headers.get('origin') ?? '') ||
            !/^\/matchmake\/joinById\/[^/]+$/.test(
              new URL(request.url).pathname,
            ))
        ) {
          return new Response(null, { status: 403 });
        }
      },
    },
  );
  gameServer.define('table', RegisteredTableRoom);
  return { gameServer, httpServer };
}
