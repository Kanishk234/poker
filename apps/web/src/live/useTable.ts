import { useEffect, useRef, useState } from 'react';
import type { Room } from '@colyseus/sdk';
import {
  chatSchema,
  errorSchema,
  intentSchemas,
  updateSchema,
  welcomeSchema,
  type Chat,
  type IntentMap,
  type IntentType,
  type Update,
} from '@felt/shared';
import { connectTable } from './connection.js';

export function useTable(code: string, name: string) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [status, setStatus] = useState<'connecting' | 'connected' | 'closed'>(
    'connecting',
  );
  const [error, setError] = useState('');
  const [chat, setChat] = useState<Chat[]>([]);
  const [busy, setBusy] = useState(false);
  const roomRef = useRef<Room | null>(null);
  const waitingRef = useRef(false);
  const offset = useRef(0);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    let room: Room | undefined;
    let seq = -1;
    void connectTable(code, name, controller.signal)
      .then((joined) => {
        room = joined;
        if (disposed) {
          void joined.leave();
          return;
        }
        roomRef.current = joined;
        setStatus('connected');
        joined.onMessage('welcome', (payload: unknown) => {
          const parsed = welcomeSchema.safeParse(payload);
          if (parsed.success) setPlayerId(parsed.data.playerId);
        });
        joined.onMessage('update', (payload: unknown) => {
          const parsed = updateSchema.safeParse(payload);
          if (!parsed.success) {
            setError('The table needs a newer app version. Refresh to update.');
            return;
          }
          if (parsed.data.seq < seq) return;
          if (seq >= 0 && parsed.data.seq > seq + 1)
            joined.send('resync', { lastSeq: seq });
          seq = parsed.data.seq;
          offset.current = parsed.data.serverTime - Date.now();
          waitingRef.current = false;
          setBusy(false);
          setError('');
          setUpdate(parsed.data);
        });
        joined.onMessage('error', (payload: unknown) => {
          const parsed = errorSchema.safeParse(payload);
          waitingRef.current = false;
          setBusy(false);
          setError(
            parsed.success
              ? parsed.data.message
              : 'The request could not be completed.',
          );
        });
        joined.onMessage('chat', (payload: unknown) => {
          const parsed = chatSchema.safeParse(payload);
          if (parsed.success)
            setChat((previous) => [...previous.slice(-49), parsed.data]);
        });
        joined.onLeave(() => {
          if (!disposed) {
            roomRef.current = null;
            setStatus('closed');
            setBusy(false);
          }
        });
        joined.onError(() => {
          if (!disposed)
            setError('Connection interrupted. Refresh to rejoin the table.');
        });
        joined.send('resync', { lastSeq: 0 });
      })
      .catch((cause: unknown) => {
        if (!disposed) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Cannot connect. Check the room code and try again.',
          );
          setStatus('closed');
        }
      });
    return () => {
      disposed = true;
      controller.abort();
      roomRef.current = null;
      if (room) void room.leave();
    };
  }, [code, name]);
  function send<K extends IntentType>(type: K, payload: IntentMap[K]) {
    if (
      !roomRef.current ||
      status !== 'connected' ||
      (waitingRef.current && type !== 'chat')
    )
      return;
    const parsed = intentSchemas[type].safeParse(payload);
    if (!parsed.success) {
      setError('Check the values and try again.');
      return;
    }
    setError('');
    if (type !== 'chat') {
      waitingRef.current = true;
      setBusy(true);
    }
    roomRef.current.send(type, parsed.data);
  }
  return { update, playerId, status, error, chat, busy, send, offset };
}
