import { ArrowLeft, History } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { ReviewWorkspace } from '@/components/review/review-workspace';
import { StatusBadge } from '@/components/status-badge';
import { idSchema } from '@/lib/domain';
import { HttpError } from '@/lib/errors';
import { getContract } from '@/lib/store';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ extract?: string }> };

async function load(id: string) {
  if (!idSchema.safeParse(id).success) notFound();
  try {
    return await getContract(id);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const contract = await load((await params).id);
  return { title: contract.name };
}

export default async function ContractPage({ params, searchParams }: Props) {
  await connection();
  const contract = await load((await params).id);
  const { extract } = await searchParams;
  const model = contract.extraction?.mode;

  return (
    <div className="mx-auto max-w-[1440px] px-6 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft className="size-4" />
          Contracts
        </Link>
        <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{contract.name}</h1>
        <StatusBadge status={contract.status} />
        <div className="ml-auto flex items-center gap-4 text-xs text-ink-faint">
          {model && <span>Extracted with {model === 'demo-patterns' ? 'the demo extractor' : model}</span>}
          <Link href={`/audit?contractId=${contract.id}`} className="flex items-center gap-1 hover:text-ink">
            <History className="size-3.5" />
            Audit trail
          </Link>
        </div>
      </div>

      <ReviewWorkspace key={contract.version} contract={contract} autoExtract={extract === '1'} />
    </div>
  );
}
