export type EngineErrorCode =
  'INVALID_CARD' | 'DUPLICATE_CARD' | 'INVALID_HAND' | 'INVALID_RNG';

export class EngineError extends Error {
  constructor(
    public readonly code: EngineErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}
