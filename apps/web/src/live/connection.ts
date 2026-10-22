import { Client } from '@colyseus/sdk';
import {
  createdTableSchema,
  errorSchema,
  PROTOCOL_VERSION,
  type TableConfig,
} from '@felt/shared';

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
  const payload: unknown = await response.json();
  if (!response.ok)
    throw new Error(
      errorSchema.safeParse(payload).data?.message ??
        'Cannot reach the table. Try again.',
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
  return new Client(socket).joinById(result.roomId, {
    protocol: PROTOCOL_VERSION,
    code,
    displayName,
    ...(creatorToken ? { creatorToken } : {}),
  });
}
