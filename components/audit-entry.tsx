import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { fieldKeys, fieldLabels, formatValue, type FieldKey, type FieldValue } from '@/lib/domain';
import { cn } from '@/lib/utils';
import { LocalTime } from './local-time';
import { Badge } from './ui/badge';

type Entry = { id: string; contractId: string | null; role: string; action: string; detail: unknown; createdAt: string };
type Detail = Record<string, unknown>;

const TITLES: Record<string, string> = {
  contract_parsed: 'Contract parsed',
  extraction_completed: 'Terms extracted',
  extraction_failed: 'Extraction failed',
  vendor_lookup: 'Vendor lookup (read-only tool)',
  field_edited: 'Field edited',
  approve: 'Approved',
  send_back: 'Sent back',
  reject: 'Rejected',
  erp_vendor_created: 'Finance record created',
  api_call: 'API call',
};

const DOT: Record<string, string> = {
  approve: 'bg-emerald-500',
  erp_vendor_created: 'bg-emerald-500',
  reject: 'bg-rose-500',
  extraction_failed: 'bg-rose-500',
  field_edited: 'bg-sky-500',
  send_back: 'bg-sky-500',
  api_call: 'bg-stone-300',
};

const isField = (value: unknown): value is FieldKey => fieldKeys.includes(value as FieldKey);

function summary(action: string, d: Detail): React.ReactNode {
  switch (action) {
    case 'contract_parsed':
      return `${d.paragraphs} paragraphs across ${d.pages ?? '?'} pages`;
    case 'extraction_completed': {
      const unsupported = (d.unsupported as string[] | undefined) ?? [];
      const flags = (d.flags as string[] | undefined) ?? [];
      return `${d.model === 'demo-patterns' ? 'Demo extractor' : d.model}: ${d.found} fields cited, ${unsupported.length} rejected by the citation check, ${flags.length} ${flags.length === 1 ? 'flag' : 'flags'}`;
    }
    case 'extraction_failed':
      return String(d.message);
    case 'vendor_lookup': {
      const matches = (d.matches as { id: string; name: string }[] | undefined) ?? [];
      return `"${d.name}": ${matches.length ? matches.map((m) => `${m.name} (${m.id})`).join(', ') : 'no existing vendor'}`;
    }
    case 'field_edited':
      if (!isField(d.field)) return null;
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {fieldLabels[d.field]}:<span className="text-ink-faint line-through">{formatValue(d.field, d.old as FieldValue)}</span>
          <ArrowRight className="size-3" />
          <span className="font-medium text-ink">{formatValue(d.field, d.new as FieldValue)}</span>
        </span>
      );
    case 'approve':
    case 'send_back':
    case 'reject': {
      const edited = ((d.editedFields as string[] | undefined) ?? []).filter(isField).map((f) => fieldLabels[f]);
      return [d.reason ? `"${d.reason}"` : 'No reason given', edited.length ? `Edited: ${edited.join(', ')}` : null]
        .filter(Boolean)
        .join(' · ');
    }
    case 'erp_vendor_created':
      return `${d.name} as ${d.vendorId}, Idempotency-Key ${d.idempotencyKey}`;
    case 'api_call':
      return (
        <span className="font-mono text-xs">
          {String(d.method)} {String(d.path)} <span className={Number(d.status) >= 400 ? 'text-rose-700' : 'text-emerald-700'}>{String(d.status)}</span>
        </span>
      );
    default:
      return null;
  }
}

export function AuditEntry({ entry, contractName, showContract }: { entry: Entry; contractName: string | null; showContract: boolean }) {
  const detail = (entry.detail ?? {}) as Detail;
  return (
    <li className="flex gap-3 px-4 py-3">
      <span className={cn('mt-1.5 size-2 shrink-0 rounded-full bg-accent', DOT[entry.action])} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{TITLES[entry.action] ?? entry.action}</span>
          <Badge>{entry.role}</Badge>
          {showContract && entry.contractId && (
            <Link href={`/contracts/${entry.contractId}`} className="truncate text-xs text-accent hover:underline">
              {contractName ?? 'Contract'}
            </Link>
          )}
          <LocalTime value={entry.createdAt} className="ml-auto text-xs text-ink-faint tabular-nums" />
        </div>
        <div className="mt-0.5 text-sm text-ink-soft">{summary(entry.action, detail)}</div>
        <details className="mt-1 text-xs text-ink-faint">
          <summary className="w-fit cursor-pointer select-none hover:text-ink-soft">Raw record</summary>
          <pre className="scrollbar-thin mt-2 max-h-72 overflow-auto rounded-md bg-canvas p-3 font-mono text-[11px] leading-relaxed text-ink-soft">
            {JSON.stringify(detail, null, 2)}
          </pre>
        </details>
      </div>
    </li>
  );
}
