'use client';

import { useState } from 'react';
import { booleanFields, dayFields, fieldValueSchemas, type FieldKey, type FieldValue } from '@/lib/domain';
import { Button } from '../ui/button';

const inputClass = 'h-8 w-full rounded-md border border-line bg-surface px-2.5 text-sm';

function initialDraft(key: FieldKey, value: FieldValue) {
  if (value === null) return { text: '', amount: '', currency: 'USD' };
  if (typeof value === 'object') return { text: '', amount: String(value.amount), currency: value.currency };
  if (typeof value === 'boolean') return { text: value ? 'yes' : 'no', amount: '', currency: 'USD' };
  return { text: String(value), amount: '', currency: 'USD' };
}

/** Typed inline editor. Values are validated with the same Zod schemas the server uses. */
export function FieldEditor({
  field,
  value,
  onSave,
  onCancel,
}: {
  field: FieldKey;
  value: FieldValue;
  onSave: (value: FieldValue) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(() => initialDraft(field, value));
  const [error, setError] = useState('');

  function toValue(): FieldValue {
    if (booleanFields.includes(field)) return draft.text === '' ? null : draft.text === 'yes';
    if (field === 'total_contract_value') {
      if (!draft.amount.trim()) return null;
      return { amount: Number(draft.amount.replaceAll(',', '')), currency: draft.currency.trim().toUpperCase() };
    }
    if (!draft.text.trim()) return null;
    if (dayFields.includes(field)) return Number(draft.text);
    return draft.text.trim();
  }

  function save() {
    const next = toValue();
    const result = fieldValueSchemas[field].nullable().safeParse(next);
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? 'Check this value.');
      return;
    }
    onSave(result.data as FieldValue);
  }

  return (
    <form
      className="mt-2 space-y-2 rounded-lg border border-line bg-canvas p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
    >
      {booleanFields.includes(field) ? (
        <select autoFocus className={inputClass} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })}>
          <option value="yes">Yes</option>
          <option value="no">No</option>
          <option value="">Not in contract</option>
        </select>
      ) : field === 'total_contract_value' ? (
        <div className="flex gap-2">
          <input
            autoFocus
            inputMode="decimal"
            placeholder="Amount"
            className={inputClass}
            value={draft.amount}
            onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
          />
          <input
            aria-label="Currency"
            maxLength={3}
            className={`${inputClass} w-20 uppercase`}
            value={draft.currency}
            onChange={(e) => setDraft({ ...draft, currency: e.target.value })}
          />
        </div>
      ) : (
        <input
          autoFocus
          type={field === 'effective_date' ? 'date' : dayFields.includes(field) ? 'number' : 'text'}
          min={dayFields.includes(field) ? 0 : undefined}
          placeholder={dayFields.includes(field) ? 'Days' : 'Leave blank if not in contract'}
          className={inputClass}
          value={draft.text}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
        />
      )}
      {error && <p className="text-xs text-rose-700">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Apply
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
