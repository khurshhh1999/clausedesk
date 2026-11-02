'use client';

import { CircleCheck, ShieldAlert, UserCheck } from 'lucide-react';
import type { Flag, VendorMatch } from '@/lib/domain';
import { cn } from '@/lib/utils';
import type { Focus } from './document-pane';

export function FlagList({ flags, onFocus, quoteFor }: { flags: Flag[]; onFocus: (focus: Focus) => void; quoteFor: (flag: Flag) => string | null }) {
  const risks = flags.filter((f) => f.severity === 'risk');

  return (
    <section className="rounded-xl border border-line bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Policy checks</h2>
        <span className={cn('text-xs', risks.length ? 'text-rose-700' : 'text-emerald-700')}>
          {risks.length ? `${risks.length} open ${risks.length === 1 ? 'flag' : 'flags'}` : 'All clear'}
        </span>
      </header>

      {flags.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-4 text-sm text-ink-soft">
          <CircleCheck className="size-4 text-emerald-600" />
          No policy issues in the current values.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {flags.map((flag) => {
            const Icon = flag.severity === 'approval' ? UserCheck : ShieldAlert;
            return (
              <li key={flag.id}>
                <button
                  type="button"
                  disabled={!flag.paragraph_id}
                  onClick={() => flag.paragraph_id && onFocus({ paragraphId: flag.paragraph_id, quote: quoteFor(flag) })}
                  className="flex w-full gap-3 px-4 py-3 text-left enabled:hover:bg-canvas/70"
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', flag.severity === 'approval' ? 'text-indigo-600' : 'text-rose-600')} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{flag.title}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{flag.detail}</span>
                  </span>
                  <span className="shrink-0 pt-0.5 font-mono text-[11px] text-ink-faint">
                    {flag.paragraph_id ?? 'clause not found'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function VendorMatches({ matches }: { matches: VendorMatch[] }) {
  if (matches.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">Possible duplicate in the finance system</p>
      <ul className="mt-1 space-y-0.5">
        {matches.map((vendor) => (
          <li key={vendor.id}>
            Existing vendor: {vendor.name}, ID <span className="font-mono">{vendor.id}</span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-xs text-amber-800">Found by the read-only lookup_vendor tool. Check before approving.</p>
    </div>
  );
}
