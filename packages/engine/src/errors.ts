export type EngineErrorCode =
  | 'INVALID_CARD'
  | 'DUPLICATE_CARD'
  | 'INVALID_HAND'
  | 'INVALID_RNG'
  | 'INVALID_CONFIG'
  | 'INVALID_SEAT'
  | 'SEAT_TAKEN'
  | 'DUPLICATE_PLAYER'
  | 'BAD_BUY_IN'
  | 'INVALID_PLAYER'
  | 'HAND_IN_PROGRESS'
  | 'NOT_ENOUGH_PLAYERS'
  | 'NOT_YOUR_TURN'
  | 'ILLEGAL_ACTION'
  | 'ROUND_NOT_COMPLETE'
  | 'INVALID_POT'
  | 'INVALID_STATE'
  | 'INVALID_TIME'
  | 'TIMEOUT_NOT_DUE';

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}
