import { useState } from 'react';
import { Dialog } from '../ui/Dialog.js';
import { chips, clampRaise } from './presentation.js';
import type { LegalActions } from './types.js';
export function RaiseSheet({
  legal,
  bigBlind,
  pot,
  currentBet,
  onClose,
  onConfirm,
}: {
  legal: LegalActions;
  bigBlind: number;
  pot: number;
  currentBet: number;
  onClose: () => void;
  onConfirm: (amount: number) => void;
}) {
  const minimum = legal.minRaiseTo ?? legal.maxRaiseTo;
  const [draft, setDraft] = useState(String(minimum));
  const amount = clampRaise(Number(draft), legal, bigBlind);
  function update(value: number) {
    setDraft(String(clampRaise(value, legal, bigBlind)));
  }
  const presets = [
    { label: 'Min', amount: minimum },
    ...[0.5, 0.75, 1].map((fraction) => ({
      label: fraction === 0.5 ? '½ pot' : fraction === 0.75 ? '¾ pot' : 'Pot',
      amount:
        currentBet + legal.callAmount + (pot + legal.callAmount) * fraction,
    })),
    ...(legal.canAllIn ? [{ label: 'All-in', amount: legal.maxRaiseTo }] : []),
  ];
  return (
    <Dialog title="Raise to" onClose={onClose}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(clampRaise(amount, legal, bigBlind));
        }}
      >
        <p className="quiet-note">Total chips committed on this street.</p>
        <label className="raise-amount">
          Chips
          <input
            aria-label="Raise to chips"
            type="number"
            inputMode="numeric"
            value={draft}
            min={minimum}
            max={legal.maxRaiseTo}
            step={1}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => update(Number(draft))}
          />
        </label>
        <input
          className="raise-slider"
          type="range"
          aria-label="Raise amount"
          min={minimum}
          max={legal.maxRaiseTo}
          step={1}
          value={amount}
          onChange={(event) => update(event.target.valueAsNumber)}
        />
        <div className="range-labels">
          <span>{chips(minimum)}</span>
          <span>{chips(legal.maxRaiseTo)}</span>
        </div>
        <div className="raise-presets">
          {presets.map((preset) => (
            <button
              className="preset"
              type="button"
              key={preset.label}
              onClick={() => update(preset.amount)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <button className="button primary" type="submit">
          {amount === legal.maxRaiseTo ? 'All-in' : 'Raise to'} {chips(amount)}
        </button>
        <p className="quiet-note centered">Sample hand · no chips will move</p>
      </form>
    </Dialog>
  );
}
