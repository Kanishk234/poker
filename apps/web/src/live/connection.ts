import { Client, ErrorCode, MatchMakeError } from '@colyseus/sdk';
import {
  createdTableSchema,
  errorSchema,
  PROTOCOL_VERSION,
  type TableConfig,
  type SavedSession,
} from '@felt/shared';
import { savedSession, forgetSession } from './sessions.js';

export class ConnectionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

const api = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
const socket =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  `${location.origin}/colyseus`;
async function request(path: string, options: RequestInit = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)])
      : AbortSignal.timeout(20000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok)
    throw new ConnectionError(
      errorSchema.safeParse(payload).data?.message ??
        'Cannot reach the table. Trying again…',
      response.status >= 500 || response.status === 429,
    );
  return payload;
}
export async function createLiveTable(config: TableConfig) {
  const created = createdTableSchema.parse(
    await request('/api/tables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config }),
    }),
  );
  sessionStorage.setItem(`felt.host.${created.code}`, created.creatorToken);
  return created;
}
export async function connectTable(
  code: string,
  displayName: string,
  signal: AbortSignal,
  memorySession?: SavedSession | null,
) {
  const result = await request(`/api/tables/${code}`, { signal });
  signal.throwIfAborted();
  if (
    !result ||
    typeof result !== 'object' ||
    !('roomId' in result) ||
    typeof result.roomId !== 'string'
  )
    throw new Error('Cannot find that room. Check the code.');
  let creatorToken: string | null = null;
  try {
    creatorToken = sessionStorage.getItem(`felt.host.${code}`);
  } catch {
    /* Storage may be disabled. */
  }
  const client = new Client(socket);
  const previous = memorySession ?? savedSession(code);
  if (previous) {
    try {
      const room = await client.reconnect(previous.reconnectionToken);
      return { room, playerId: previous.playerId, expired: false };
    } catch (error) {
      if (
        !(error instanceof MatchMakeError) ||
        (error.code !== ErrorCode.MATCHMAKE_EXPIRED &&
          error.code !== ErrorCode.MATCHMAKE_INVALID_ROOM_ID)
      )
        throw error;
      forgetSession(code);
      signal.throwIfAborted();
    }
  }
  const room = await client.joinById(result.roomId, {
    protocol: PROTOCOL_VERSION,
    code,
    displayName,
    ...(creatorToken ? { creatorToken } : {}),
  });
  return { room, playerId: '', expired: !!previous };
}
