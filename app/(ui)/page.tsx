import { ChevronRight, FileText } from 'lucide-react';
import Link from 'next/link';
import { connection } from 'next/server';
import { Intake, TrySampleButton } from '@/components/intake';
import { StatusBadge } from '@/components/status-badge';
import { samples } from '@/lib/samples';
import { listContracts } from '@/lib/store';

export default async function HomePage() {
  await connection();
  const contracts = await listContracts();

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Contract intake</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-soft">
          Upload a vendor contract. Claude extracts the key terms, each linked to the clause it came from. Policy
          checks flag the risks, and nothing reaches the finance system until a reviewer approves it.
        </p>
      </header>

      <Intake samples={samples} />

      <section className="mt-12">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium">Recent contracts</h2>
          {contracts.length > 0 && <span className="text-xs text-ink-faint">{contracts.length} shown</span>}
        </div>

        {contracts.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-line px-6 py-12 text-center">
            <FileText className="mb-3 size-6 text-ink-faint" />
            <p className="font-medium">No contracts yet</p>
            <p className="mt-1 mb-5 text-sm text-ink-soft">
              Northwind is a fictional agreement with every risk the policy checks for.
            </p>
            <TrySampleButton sampleId="northwind-risky" label="Try a sample contract" />
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
            {contracts.map((contract) => (
              <li key={contract.id}>
                <Link href={`/contracts/${contract.id}`} className="group flex items-center gap-4 px-4 py-3 hover:bg-canvas/70">
                  <FileText className="size-4 shrink-0 text-ink-faint" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{contract.name}</span>
                  <span className="hidden text-xs text-ink-faint tabular-nums sm:block">
                    {contract.createdAt.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                  <StatusBadge status={contract.status} />
                  <ChevronRight className="size-4 text-ink-faint transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
