import { randomInt } from 'node:crypto';
import type { Rng } from '@felt/engine';

// Node's integer CSPRNG avoids modulo bias. Engine code never imports node:crypto.
export const secureRng: Rng = (upperExclusive) => randomInt(upperExclusive);
