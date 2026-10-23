import { randomUUID } from 'node:crypto';
import { type Client, Room, ServerError } from '@colyseus/core';
import {
  applyAction,
  applyTimeout,
  createTable,
  EngineError,
  eventsFor,
  joinTable,
  leaveTable,
  rebuy,
  setSittingOut,
  startHand,
  viewFor,
  type HandResult,
  type HandEvent,
  type TableState,
} from '@felt/engine';
import {
  intentSchemas,
  joinSchema,
  PROTOCOL_VERSION,
  RECONNECT_GRACE_SECONDS,
  updateSchema,
  type IntentMap,
  type IntentType,
  type TableConfig,
} from '@felt/shared';
import { secureRng } from './random.js';

interface CreateOptions {
  config: TableConfig;
  code: string;
  creatorToken: string;
}
interface Visitor {
  id: string;
  name: string;
}
export class TableRoom extends Room {
  maxClients = 20;
  autoDispose = false;
  private table!: TableState;
  private code!: string;
  private creatorToken: string | null = null;
  private hostId: string | null = null;
  private visitors = new Map<string, Visitor>();
  private seq = 0;
  private started = false;
  private cancelTimer: (() => void) | undefined;
  private idleTimer: (() => void) | undefined;
  private chatAt = new Map<string, number>();
  private dropped = new Map<
    string,
    { handId: string | null; reject: () => void; cancel?: () => void }
  >();

  onCreate(options: CreateOptions): void {
    this.table = createTable(options.config);
    this.code = options.code;
    this.creatorToken = options.creatorToken;
    void this.setPrivate(true);
    this.expireIfEmpty();
    for (const type of Object.keys(intentSchemas) as IntentType[]) {
      this.onMessage(type, (client, payload: unknown) => {
        const parsed = intentSchemas[type].safeParse(payload);
        if (!parsed.success)
          return this.error(
            client,
            'INVALID_MESSAGE',
            'Unsupported or malformed message.',
            type,
          );
        try {
          // The schema indexed by this message type has validated its corresponding payload.
          this.intent(client, type, parsed.data as IntentMap[typeof type]);
        } catch (error) {
          if (error instanceof EngineError || error instanceof ServerError) {
            this.error(
              client,
              error instanceof EngineError ? error.code : error.message,
              error instanceof EngineError
                ? error.message
                : this.friendly(error.message),
              type,
            );
          } else {
            this.error(
              client,
              'INTERNAL_ERROR',
              'This request could not be completed.',
              type,
            );
            // Never log engine state or payloads containing cards.
            console.error(
              JSON.stringify({
                event: 'room_command_failed',
                roomId: this.roomId,
                type,
              }),
            );
          }
        }
      });
    }
    this.onMessage('*', (client, type) =>
      this.error(
        client,
        'INVALID_MESSAGE',
        'Unsupported or malformed message.',
        String(type).slice(0, 40),
      ),
    );
  }

  onJoin(client: Client, options: unknown): void {
    const parsed = joinSchema.safeParse(options);
    if (!parsed.success) {
      const version =
        typeof options === 'object' && options !== null && 'protocol' in options
          ? options.protocol
          : undefined;
      throw new ServerError(
        400,
        version !== PROTOCOL_VERSION ? 'VERSION_MISMATCH' : 'INVALID_MESSAGE',
      );
    }
    if (parsed.data.code !== this.code)
      throw new ServerError(404, 'TABLE_NOT_FOUND');
    const visitor = { id: randomUUID(), name: parsed.data.displayName };
    this.visitors.set(client.sessionId, visitor);
    if (this.creatorToken && parsed.data.creatorToken === this.creatorToken) {
      this.hostId = visitor.id;
      this.creatorToken = null;
    }
    this.idleTimer?.();
    this.welcome(client, visitor);
    this.publish([]);
  }

  onDrop(client: Client): void {
    if (!this.visitors.has(client.sessionId)) return;
    const reservation = this.allowReconnection(client, 'manual');
    void reservation.catch(() => {
      /* Colyseus calls onLeave when the reservation expires. */
    });
    this.dropped.set(client.sessionId, {
      handId: this.table.round ? this.table.hand!.id : null,
      reject: () => reservation.reject(),
    });
    // Membership changes must not reset the actor's existing deadline.
    this.publish([]);
  }

  onReconnect(client: Client): void {
    const visitor = this.visitors.get(client.sessionId);
    if (!visitor) throw new ServerError(403, 'SESSION_EXPIRED');
    this.dropped.get(client.sessionId)?.cancel?.();
    this.dropped.delete(client.sessionId);
    this.welcome(client, visitor);
    this.publish([]);
  }

  private welcome(client: Client, visitor: Visitor): void {
    client.send('welcome', {
      protocol: PROTOCOL_VERSION,
      playerId: visitor.id,
      reconnectGraceSeconds: RECONNECT_GRACE_SECONDS,
    });
  }

  onLeave(client: Client): void {
    const visitor = this.visitors.get(client.sessionId);
    if (!visitor) return;
    this.dropped.get(client.sessionId)?.cancel?.();
    this.dropped.delete(client.sessionId);
    this.visitors.delete(client.sessionId);
    this.chatAt.delete(client.sessionId);
    let events: HandEvent[] = [];
    const seat = visitor
      ? this.table.seats.findIndex((s) => s?.id === visitor.id)
      : -1;
    if (seat >= 0) {
      const result = leaveTable(this.table, seat, Date.now());
      this.table = result.state;
      events = result.events;
    }
    if (visitor?.id === this.hostId)
      this.hostId = this.visitors.values().next().value?.id ?? null;
    this.publish(events);
    this.schedule();
    this.expireIfEmpty();
  }

  onDispose(): void {
    this.cancelTimer?.();
    this.idleTimer?.();
    for (const reservation of this.dropped.values()) {
      reservation.cancel?.();
      reservation.reject();
    }
    this.dropped.clear();
  }

  private intent<K extends IntentType>(
    client: Client,
    type: K,
    payload: IntentMap[K],
  ): void {
    const visitor = this.visitors.get(client.sessionId);
    if (!visitor) throw new ServerError(403, 'NOT_JOINED');
    const seat = this.table.seats.findIndex((s) => s?.id === visitor.id);
    const now = Date.now();
    if (type === 'resync') {
      this.sendUpdate(client, []);
      return;
    }
    if (type === 'chat') {
      if (now - (this.chatAt.get(client.sessionId) ?? 0) < 1000)
        throw new ServerError(429, 'RATE_LIMITED');
      this.chatAt.set(client.sessionId, now);
      this.broadcast('chat', {
        playerId: visitor.id,
        name: visitor.name,
        text: (payload as IntentMap['chat']).text,
        ts: now,
      });
      return;
    }
    let result: HandResult;
    if (type === 'sit') {
      if (seat >= 0) throw new ServerError(400, 'ALREADY_SEATED');
      const p = payload as IntentMap['sit'];
      result = joinTable(this.table, p.seat, visitor, p.buyIn);
    } else if (type === 'host') {
      if (visitor.id !== this.hostId) throw new ServerError(403, 'NOT_HOST');
      result = startHand(this.table, secureRng, now);
      this.started = true;
    } else {
      if (seat < 0) throw new ServerError(400, 'NOT_SEATED');
      if (type === 'stand') result = leaveTable(this.table, seat, now);
      else if (type === 'sitOut' || type === 'sitIn')
        result = setSittingOut(this.table, seat, type === 'sitOut');
      else if (type === 'rebuy')
        result = rebuy(
          this.table,
          seat,
          (payload as IntentMap['rebuy']).amount,
        );
      else {
        const p = payload as IntentMap['action'];
        const turn = viewFor(this.table, seat).turn;
        if (
          !turn ||
          this.table.hand?.id !== p.handId ||
          turn.turnId !== p.turnId
        )
          throw new ServerError(400, 'STALE_TURN');
        result = applyAction(
          this.table,
          seat,
          'amount' in p ? { type: p.type, amount: p.amount } : { type: p.type },
          now,
        );
      }
    }
    this.table = result.state;
    this.publish(result.events);
    this.schedule();
  }

  private viewer(client: Client): number | 'spectator' {
    const visitor = this.visitors.get(client.sessionId);
    const seat = visitor
      ? this.table.seats.findIndex((s) => s?.id === visitor.id)
      : -1;
    return seat < 0 ? 'spectator' : seat;
  }
  private sendUpdate(client: Client, events: readonly HandEvent[]): void {
    const viewer = this.viewer(client);
    const view = viewFor(this.table, viewer);
    const online = new Set(
      this.clients
        .filter((c) => !this.dropped.has(c.sessionId))
        .map((c) => this.visitors.get(c.sessionId)?.id),
    );
    client.send(
      'update',
      updateSchema.parse({
        seq: this.seq,
        serverTime: Date.now(),
        view: {
          ...view,
          tableId: this.code,
          hostId: this.hostId,
          started: this.started,
          seats: view.seats.map((s) =>
            s
              ? {
                  ...s,
                  connected: online.has(s.playerId),
                  isHost: s.playerId === this.hostId,
                }
              : null,
          ),
        },
        events: eventsFor(events, viewer, this.table),
      }),
    );
  }
  private publish(events: readonly HandEvent[]): void {
    for (const reservation of this.dropped.values()) {
      if (
        !reservation.cancel &&
        (!this.table.round || this.table.hand?.id !== reservation.handId)
      ) {
        const timer = this.clock.setTimeout(
          reservation.reject,
          RECONNECT_GRACE_SECONDS * 1000,
        );
        reservation.cancel = () => timer.clear();
      }
    }
    this.seq++;
    for (const client of this.clients)
      if (this.visitors.has(client.sessionId)) this.sendUpdate(client, events);
  }
  private schedule(): void {
    this.cancelTimer?.();
    this.cancelTimer = undefined;
    const turn = viewFor(this.table, 'spectator').turn;
    if (turn) {
      const handId = this.table.hand!.id;
      const timer = this.clock.setTimeout(
        () => {
          const current = viewFor(this.table, 'spectator').turn;
          if (this.table.hand?.id !== handId || current?.turnId !== turn.turnId)
            return;
          const now = Date.now();
          // Colyseus uses a delta clock; wait again if its timer fires before wall time.
          if (now < current.deadlineMs) {
            this.schedule();
            return;
          }
          const result = applyTimeout(this.table, turn.seat, now);
          this.table = result.state;
          this.publish(result.events);
          this.schedule();
        },
        Math.max(0, turn.deadlineMs - Date.now()),
      );
      this.cancelTimer = () => timer.clear();
    } else if (
      this.started &&
      this.table.seats.filter((s) => s && s.stack > 0 && s.status === 'waiting')
        .length >= 2
    ) {
      const timer = this.clock.setTimeout(() => {
        const result = startHand(this.table, secureRng, Date.now());
        this.table = result.state;
        this.publish(result.events);
        this.schedule();
      }, 5000);
      this.cancelTimer = () => timer.clear();
    }
  }
  private expireIfEmpty(): void {
    this.idleTimer?.();
    if (!this.visitors.size) {
      const timer = this.clock.setTimeout(
        () => {
          void this.disconnect();
        },
        10 * 60 * 1000,
      );
      this.idleTimer = () => timer.clear();
    }
  }
  private friendly(code: string): string {
    const messages: Record<string, string> = {
      NOT_HOST: 'Only the host can start the table.',
      STALE_TURN: 'That turn has changed. Try your action again.',
      NOT_SEATED: 'Take a seat first.',
      ALREADY_SEATED: 'You already have a seat.',
      RATE_LIMITED: 'Wait a moment before sending another message.',
    };
    return messages[code] ?? 'This request is not available.';
  }
  private error(
    client: Client,
    code: string,
    message: string,
    refType: string,
  ): void {
    client.send('error', { code, message, refType });
  }
}
