import { desc, eq, inArray } from 'drizzle-orm';
import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { z } from 'zod';
import { AuditEntry } from '@/components/audit-entry';
import { Button } from '@/components/ui/button';
import { getDb } from '@/lib/db';
import { auditLog, contracts } from '@/lib/db/schema';

export const metadata: Metadata = { title: 'Audit log' };

const PAGE_SIZE = 50;
const query = z.object({
  contractId: z.uuid().optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1),
});

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  await connection();
  const { contractId, page } = query.parse(await searchParams);
  const db = await getDb();

  const entries = await db
    .select()
    .from(auditLog)
    .where(contractId ? eq(auditLog.contractId, contractId) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  const hasMore = entries.length > PAGE_SIZE;
  const visible = entries.slice(0, PAGE_SIZE);
  const contractIds = [...new Set(visible.map((e) => e.contractId).filter((id): id is string => Boolean(id)))];
  const names = contractIds.length
    ? new Map(
        (await db.select({ id: contracts.id, name: contracts.name }).from(contracts).where(inArray(contracts.id, contractIds))).map(
          (c) => [c.id, c.name],
        ),
      )
    : new Map<string, string>();

  const pageHref = (n: number) => `/audit?${new URLSearchParams({ ...(contractId ? { contractId } : {}), page: String(n) })}`;

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="mt-2 text-[15px] text-ink-soft">
          Every extraction, field edit, decision, finance-system call and write request, with the role that made it.
        </p>
        {contractId && (
          <p className="mt-3 text-sm">
            Showing one contract: <span className="font-medium">{names.get(contractId) ?? contractId}</span> ·{' '}
            <Link href="/audit" className="text-accent hover:underline">
              Show all
            </Link>
          </p>
        )}
      </header>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line px-6 py-12 text-center text-sm text-ink-soft">Nothing recorded yet.</p>
      ) : (
        <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {visible.map((entry) => (
            <AuditEntry
              key={entry.id}
              entry={{ ...entry, createdAt: entry.createdAt.toISOString() }}
              contractName={entry.contractId ? (names.get(entry.contractId) ?? null) : null}
              showContract={!contractId}
            />
          ))}
        </ol>
      )}

      {(page > 1 || hasMore) && (
        <nav className="mt-4 flex items-center justify-between">
          <Button asChild variant="outline" size="sm" className={page === 1 ? 'invisible' : ''}>
            <Link href={pageHref(page - 1)}>Newer</Link>
          </Button>
          <span className="text-xs text-ink-faint">Page {page}</span>
          <Button asChild variant="outline" size="sm" className={hasMore ? '' : 'invisible'}>
            <Link href={pageHref(page + 1)}>Older</Link>
          </Button>
        </nav>
      )}
    </div>
  );
}
