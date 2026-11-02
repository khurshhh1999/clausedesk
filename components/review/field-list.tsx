'use client';

import { AlertTriangle, Check, Minus, Pencil, Undo2 } from 'lucide-react';
import { fieldKeys, fieldLabels, formatValue, type CheckedFields, type Edits, type FieldKey, type FieldValue } from '@/lib/domain';
import { effectiveValue } from '@/lib/rules';
import { cn } from '@/lib/utils';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import type { Focus } from './document-pane';
import { FieldEditor } from './field-editor';

type Props = {
  fields: CheckedFields;
  savedEdits: Edits;
  pendingEdits: Edits;
  editing: FieldKey | null;
  canEdit: boolean;
  focus: Focus;
  onFocus: (focus: Focus) => void;
  onEdit: (key: FieldKey | null) => void;
  onChange: (key: FieldKey, value: FieldValue | undefined) => void;
};

export function FieldList({ fields, savedEdits, pendingEdits, editing, canEdit, focus, onFocus, onEdit, onChange }: Props) {
  const edits = { ...savedEdits, ...pendingEdits };
  const verified = fieldKeys.filter((k) => fields[k].status === 'found').length;
  const unsupported = fieldKeys.filter((k) => fields[k].status === 'unsupported').length;

  return (
    <section className="rounded-xl border border-line bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Extracted terms</h2>
        <p className="text-xs text-ink-faint">
          {verified} cited{unsupported > 0 && <span className="text-amber-700"> · {unsupported} rejected by citation check</span>}
        </p>
      </header>

      <ul className="divide-y divide-line">
        {fieldKeys.map((key) => {
          const field = fields[key];
          const isEdited = Object.hasOwn(edits, key);
          const isPending = Object.hasOwn(pendingEdits, key);
          const value = effectiveValue(fields, edits, key);
          const target = field.paragraph_id ? { paragraphId: field.paragraph_id, quote: field.quote } : null;
          const isActive = target !== null && focus?.paragraphId === target.paragraphId && focus.quote === target.quote;

          return (
            <li key={key} className={cn('px-4 py-3', field.status === 'unsupported' && !isEdited && 'bg-amber-50/60')}>
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  disabled={!target}
                  onClick={() => onFocus(target)}
                  className={cn('min-w-0 flex-1 text-left', target && 'cursor-pointer')}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-ink-soft">{fieldLabels[key]}</span>
                    <StatusChip status={field.status} edited={isEdited} pending={isPending} />
                  </div>
                  <div className={cn('mt-1 text-[15px] font-medium', value === null && 'font-normal text-ink-faint')}>
                    {formatValue(key, value)}
                  </div>
                  {isEdited && field.status === 'found' && (
                    <div className="mt-0.5 text-xs text-ink-faint line-through">{formatValue(key, field.value)}</div>
                  )}
                  {target && (
                    <span
                      className={cn(
                        'mt-1.5 inline-flex items-center gap-1 rounded font-mono text-[11px] text-accent hover:underline',
                        isActive && 'underline',
                      )}
                    >
                      {field.paragraph_id}
                      {field.status === 'unsupported' ? ' · claimed source' : ' · view clause'}
                    </span>
                  )}
                </button>

                <div className="flex shrink-0 gap-0.5">
                  {isPending && (
                    <Button size="icon" variant="ghost" aria-label={`Undo edit to ${fieldLabels[key]}`} onClick={() => onChange(key, undefined)}>
                      <Undo2 />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Edit ${fieldLabels[key]}`}
                    disabled={!canEdit}
                    onClick={() => onEdit(editing === key ? null : key)}
                  >
                    <Pencil />
                  </Button>
                </div>
              </div>

              {field.status === 'unsupported' && !isEdited && (
                <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-amber-800">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    {field.issue} The model quoted: <q className="italic">{field.quote}</q>. Not treated as found. Correct or clear it before approving.
                  </span>
                </p>
              )}

              {editing === key && (
                <FieldEditor
                  field={key}
                  value={value}
                  onCancel={() => onEdit(null)}
                  onSave={(next) => {
                    onChange(key, next);
                    onEdit(null);
                  }}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatusChip({ status, edited, pending }: { status: CheckedFields[FieldKey]['status']; edited: boolean; pending: boolean }) {
  if (edited) return <Badge tone="edited">{pending ? 'Edited, unsaved' : 'Edited by reviewer'}</Badge>;
  if (status === 'found')
    return (
      <Badge tone="found">
        <Check />
        Found
      </Badge>
    );
  if (status === 'unsupported')
    return (
      <Badge tone="unsupported">
        <AlertTriangle />
        Unsupported
      </Badge>
    );
  return (
    <Badge tone="missing">
      <Minus />
      Not found
    </Badge>
  );
}
