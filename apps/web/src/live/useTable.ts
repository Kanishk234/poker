import { useEffect, useRef, useState } from 'react';
import { CloseCode, MatchMakeError, type Room } from '@colyseus/sdk';
import {
  chatSchema,
  errorSchema,
  intentSchemas,
  PROTOCOL_VERSION,
  updateSchema,
  welcomeSchema,
  type Chat,
  type IntentMap,
  type IntentType,
  type SavedSession,
  type Update,
} from '@felt/shared';
import { ConnectionError, connectTable } from './connection.js';
import { forgetSession, saveSession } from './sessions.js';

export type ConnectionStatus =
  'connecting' | 'waking' | 'reconnecting' | 'connected' | 'closed';
export function useTable(code: string, name: string) {
  const [update, setUpdate] = useState<Update | null>(null);
  const [playerId, setPlayerId] = useState('');
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [error, setError] = useState('');
  const [chat, setChat] = useState<Chat[]>([]);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const roomRef = useRef<Room | null>(null);
  const readyRef = useRef(false);
  const waitingRef = useRef(false);
  const offset = useRef(0);
  const credentials = useRef<SavedSession | null>(null);
  useEffect(() => {
    let disposed = false;
    let working = false;
    let room: Room | null = null;
    let seq = -1;
    let hasJoined = false;
    let heartbeat: ReturnType<typeof setTimeout> | undefined;
    let wakeRetry: (() => void) | undefined;
    const controller = new AbortController();
    readyRef.current = false;
    setStatus('connecting');
    const waking = setTimeout(() => {
      if (!disposed && !hasJoined) setStatus('waking');
    }, 4000);
    function notReady() {
      readyRef.current = false;
      waitingRef.current = false;
      setBusy(false);
    }
    function remember() {
      if (room && credentials.current) {
        credentials.current = {
          ...credentials.current,
          reconnectionToken: room.reconnectionToken,
        };
        saveSession(credentials.current);
      }
    }
    function bind(joined: Room, restoredId: string, expired: boolean) {
      let expiredNotice = expired;
      room = joined;
      roomRef.current = joined;
      // Own retries are cancellable and also handle refresh; never buffer poker intents.
      joined.reconnection.enabled = false;
      joined.reconnection.maxEnqueuedMessages = 0;
      hasJoined = true;
      seq = -1;
      clearTimeout(waking);
      setPlayerId(restoredId);
      if (!restoredId) credentials.current = null;
      if (restoredId) {
        credentials.current = {
          protocol: PROTOCOL_VERSION,
          code,
          playerId: restoredId,
          reconnectionToken: joined.reconnectionToken,
        };
        remember();
      }
      joined.onMessage('welcome', (payload: unknown) => {
        if (disposed || room !== joined) return;
        const parsed = welcomeSchema.safeParse(payload);
        if (!parsed.success) {
          setError('Refresh the app to update its connection version.');
          return;
        }
        setPlayerId(parsed.data.playerId);
        credentials.current = {
          protocol: PROTOCOL_VERSION,
          code,
          playerId: parsed.data.playerId,
          reconnectionToken: joined.reconnectionToken,
        };
        remember();
      });
      joined.onMessage('update', (payload: unknown) => {
        if (disposed || room !== joined) return;
        const parsed = updateSchema.safeParse(payload);
        if (!parsed.success) {
          setError('The table needs a newer app version. Refresh to update.');
          return;
        }
        const next = parsed.data;
        if (next.seq < seq) return;
        if (seq >= 0 && next.seq > seq + 1 && joined.connection.isOpen)
          joined.send('resync', { lastSeq: seq });
        seq = next.seq;
        clearTimeout(heartbeat);
        offset.current = next.serverTime - Date.now();
        readyRef.current = true;
        waitingRef.current = false;
        setBusy(false);
        setStatus('connected');
        if (next.view.you) expiredNotice = false;
        setError(
          expiredNotice
            ? 'Your previous seat reservation expired. Take a new seat to play.'
            : '',
        );
        setUpdate(next);
        remember();
      });
      joined.onMessage('error', (payload: unknown) => {
        if (disposed || room !== joined) return;
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
        if (disposed || room !== joined) return;
        const parsed = chatSchema.safeParse(payload);
        if (parsed.success)
          setChat((previous) => [...previous.slice(-49), parsed.data]);
      });
      joined.onDrop(() => {
        if (disposed || room !== joined) return;
        remember();
        notReady();
        room = null;
        roomRef.current = null;
        setStatus('reconnecting');
        void recover();
      });
      joined.onLeave(() => {
        if (disposed || room !== joined) return;
        notReady();
        room = null;
        roomRef.current = null;
        forgetSession(code);
        credentials.current = null;
        setStatus('closed');
        setError('You have left this table.');
      });
      joined.onError(() => {
        if (!disposed && room === joined) {
          notReady();
          setStatus('reconnecting');
        }
      });
      joined.send('resync', { lastSeq: 0 });
      heartbeat = setTimeout(() => {
        if (!disposed && room === joined)
          joined.connection.close(CloseCode.MAY_TRY_RECONNECT);
      }, 5000);
    }
    async function recover() {
      if (disposed || working) return;
      working = true;
      const startedAt = Date.now();
      notReady();
      for (let retry = 0; retry < 25 && !disposed; retry++) {
        try {
          const connected = await connectTable(
            code,
            name,
            controller.signal,
            credentials.current,
          );
          if (connected.playerId) {
            credentials.current = {
              protocol: PROTOCOL_VERSION,
              code,
              playerId: connected.playerId,
              reconnectionToken: connected.room.reconnectionToken,
            };
            saveSession(credentials.current);
          }
          if (disposed) {
            connected.room.reconnection.enabled = false;
            connected.room.connection.close(CloseCode.GOING_AWAY);
            break;
          }
          bind(connected.room, connected.playerId, connected.expired);
          working = false;
          return;
        } catch (cause) {
          if (disposed) break;
          const terminal =
            (cause instanceof ConnectionError && !cause.retryable) ||
            (cause instanceof MatchMakeError &&
              /VERSION_MISMATCH|INVALID_MESSAGE|TABLE_NOT_FOUND/.test(
                cause.message,
              ));
          if (terminal || retry === 24 || Date.now() - startedAt >= 90000) {
            clearTimeout(waking);
            setError(
              cause instanceof Error
                ? cause.message
                : 'Cannot connect. Check the room code and try again.',
            );
            setStatus('closed');
            break;
          }
          setStatus(hasJoined ? 'reconnecting' : 'waking');
          await new Promise<void>((resolve) => {
            const timer = setTimeout(done, Math.min(4000, 300 * 2 ** retry));
            function done() {
              clearTimeout(timer);
              wakeRetry = undefined;
              controller.signal.removeEventListener('abort', done);
              resolve();
            }
            wakeRetry = done;
            controller.signal.addEventListener('abort', done, { once: true });
          });
        }
      }
      working = false;
    }
    function wake() {
      if (document.visibilityState === 'hidden' || disposed) return;
      if (room?.connection.isOpen) {
        notReady();
        setStatus('reconnecting');
        room.send('resync', { lastSeq: Math.max(0, seq) });
        const active = room;
        clearTimeout(heartbeat);
        heartbeat = setTimeout(() => {
          if (!disposed && room === active)
            active.connection.close(CloseCode.MAY_TRY_RECONNECT);
        }, 3000);
      } else {
        wakeRetry?.();
        void recover();
      }
    }
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    void recover();
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(waking);
      clearTimeout(heartbeat);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      roomRef.current = null;
      readyRef.current = false;
      if (room) {
        room.reconnection.enabled = false;
        room.connection.close(CloseCode.GOING_AWAY);
      }
    };
  }, [code, name, attempt]);
  function send<K extends IntentType>(type: K, payload: IntentMap[K]) {
    const room = roomRef.current;
    if (
      !room?.connection.isOpen ||
      !readyRef.current ||
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
    room.send(type, parsed.data);
  }
  async function leave() {
    forgetSession(code);
    credentials.current = null;
    readyRef.current = false;
    const room = roomRef.current;
    if (room?.connection.isOpen) await room.leave();
  }
  return {
    update,
    playerId,
    status,
    error,
    chat,
    busy,
    send,
    offset,
    leave,
    retry: () => setAttempt((previous) => previous + 1),
  };
}
