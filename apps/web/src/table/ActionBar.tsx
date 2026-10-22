import { chips } from './presentation.js';
import type { LegalActions } from './types.js';

export function ActionBar({
  legal,
  onAction,
  onRaise,
}: {
  legal: LegalActions;
  onAction: (action: 'fold' | 'check' | 'call' | 'allin') => void;
  onRaise: () => void;
}) {
  return (
    <div className="action-bar">
      <button
        className="action-button fold-button"
        disabled={!legal.canFold}
        onClick={() => onAction('fold')}
      >
        Fold
      </button>
      <button
        className="action-button"
        onClick={() => onAction(legal.canCheck ? 'check' : 'call')}
      >
        {legal.canCheck ? (
          'Check'
        ) : (
          <>
            Call <span>{chips(legal.callAmount)}</span>
          </>
        )}
      </button>
      {legal.minRaiseTo !== null ? (
        <button className="action-button raise-button" onClick={onRaise}>
          Raise <span aria-hidden="true">↗</span>
        </button>
      ) : legal.canAllIn ? (
        <button
          className="action-button raise-button"
          onClick={() => onAction('allin')}
        >
          All-in
        </button>
      ) : null}
    </div>
  );
}
