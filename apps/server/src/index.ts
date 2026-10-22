import { createGameServer } from './server.js';

const port = Number(process.env.PORT ?? 2567);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be 1–65535.');
const allowedOrigins = (
  process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173,http://127.0.0.1:5173'
)
  .split(',')
  .map((origin) => origin.trim());
const { gameServer } = createGameServer(allowedOrigins);
await gameServer.listen(port);
console.info(JSON.stringify({ event: 'server_started', port }));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void gameServer.gracefullyShutdown(true);
  });
}
