import { type Client, Room, ServerError } from '@colyseus/core';
import {
  helloIntentSchema,
  probeJoinSchema,
  PROTOCOL_VERSION,
} from '@felt/shared';

export class TableRoom extends Room {
  maxClients = 9;

  onCreate(): void {
    this.onMessage('hello', (client, payload: unknown) => {
      const parsed = helloIntentSchema.safeParse(payload);
      if (!parsed.success) {
        this.invalidMessage(client, 'hello');
        return;
      }
      client.send('hello', {
        protocol: PROTOCOL_VERSION,
        message: parsed.data.text,
      });
    });
    this.onMessage('*', (client, type) =>
      this.invalidMessage(client, String(type).slice(0, 40)),
    );
  }

  onJoin(client: Client, options: unknown): void {
    if (!probeJoinSchema.safeParse(options).success) {
      throw new ServerError(400, 'VERSION_MISMATCH');
    }
    client.send('hello', {
      protocol: PROTOCOL_VERSION,
      message: 'Connected to Felt',
    });
  }

  private invalidMessage(client: Client, refType: string): void {
    client.send('error', {
      code: 'INVALID_MESSAGE',
      message: 'Unsupported or malformed message.',
      refType,
    });
  }
}
