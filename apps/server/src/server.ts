import { createServer } from 'node:http';
import { createRouter, Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { PROTOCOL_VERSION } from '@felt/shared';
import { TableRoom } from './table-room.js';

export function createGameServer(allowedOrigins: string[]): {
  gameServer: Server;
  httpServer: ReturnType<typeof createServer>;
} {
  const startedAt = Date.now();
  const httpServer = createServer();
  const gameServer = new Server({
    express: (app) => {
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
          !allowedOrigins.includes(request.headers.get('origin') ?? '')
        ) {
          return new Response(null, { status: 403 });
        }
      },
    },
  );
  gameServer.define('table', TableRoom);
  return { gameServer, httpServer };
}
