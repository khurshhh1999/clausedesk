'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { fieldKeys, type Edits, type FieldKey, type FieldValue, type Flag, type ReviewAction } from '@/lib/domain';
import { riskFlags } from '@/lib/rules';
import type { ContractDetail } from '@/lib/store';
import { useSession } from '../session';
import { DecisionPanel } from './decision-panel';
import { DocumentPane, type Focus } from './document-pane';
import { ExtractionProgress } from './extraction-progress';
import { FieldList } from './field-list';
import { FlagList, VendorMatches } from './flag-list';

export function ReviewWorkspace({ contract, autoExtract }: { contract: ContractDetail; autoExtract: boolean }) {
  const router = useRouter();
  const { role } = useSession();
  const [focus, setFocus] = useState<Focus>(null);
  const [pendingEdits, setPendingEdits] = useState<Edits>({});
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const extraction = contract.extraction;

  if (!extraction) {
    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="lg:order-2">
          <ExtractionProgress contractId={contract.id} status={contract.status} autoStart={autoExtract} />
        </div>
        <div className="h-[calc(100vh-13rem)] lg:order-1">
          <DocumentPane name={contract.name} paragraphs={contract.paragraphs} focus={null} />
        </div>
      </div>
    );
  }

  const isViewer = role !== 'Reviewer';
  const awaitingReview = contract.status === 'ready' || contract.status === 'sent_back';
  const canAct = !isViewer && awaitingReview;
  const edits = { ...extraction.edits, ...pendingEdits };
  const flags = riskFlags(extraction.fields, edits);
  const originalFlags = riskFlags(extraction.fields);
  const unsupported = fieldKeys.filter((k) => extraction.fields[k].status === 'unsupported' && !Object.hasOwn(edits, k));
  const pendingCount = Object.keys(pendingEdits).length;

  // Mirrors the server rule in saveReview so the reviewer sees why a reason is needed before submitting.
  const reasonRequired =
    flags.length > 0 || originalFlags.length > 0
      ? 'flags were raised on this contract'
      : unsupported.length > 0
        ? 'some citations were rejected'
        : pendingCount > 0
          ? 'you edited extracted values'
          : null;
  const blockApproval = unsupported.length
    ? `Approval is blocked until you correct or clear: ${unsupported.length} unsupported ${unsupported.length === 1 ? 'field' : 'fields'}.`
    : editing
      ? 'Apply or cancel the open edit first.'
      : null;

  function changeField(key: FieldKey, value: FieldValue | undefined) {
    setPendingEdits((current) => {
      const next = { ...current };
      if (value === undefined) delete next[key];
      else (next as Record<FieldKey, FieldValue>)[key] = value;
      return next;
    });
  }

  function quoteFor(flag: Flag) {
    const field = extraction!.fields[flag.field];
    return field.status === 'found' ? field.quote : null;
  }

  async function decide(action: ReviewAction, reason: string) {
    const response = await fetch(`/api/contracts/${contract.id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, reason, version: contract.version, edits: pendingEdits }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setPendingEdits({});
    router.refresh();
  }

  async function retryHandoff() {
    const approval = contract.reviews.find((r) => r.action === 'approve');
    if (!approval) return;
    const response = await fetch('/api/erp/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `approval-${approval.id}` },
      body: JSON.stringify({ approvalId: approval.id }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="h-[calc(100vh-13rem)] min-h-[480px] lg:sticky lg:top-20">
        <DocumentPane name={contract.name} paragraphs={contract.paragraphs} focus={focus} />
      </div>

      <div className="space-y-4">
        <VendorMatches matches={extraction.lookup} />
        <FlagList flags={flags} onFocus={setFocus} quoteFor={quoteFor} />
        <FieldList
          fields={extraction.fields}
          savedEdits={extraction.edits}
          pendingEdits={pendingEdits}
          editing={editing}
          canEdit={canAct}
          focus={focus}
          onFocus={setFocus}
          onEdit={setEditing}
          onChange={changeField}
        />
        <DecisionPanel
          status={contract.status}
          latestReview={contract.reviews[0]}
          erpVendorId={contract.erpVendor?.id ?? null}
          reasonRequired={reasonRequired}
          blockApproval={blockApproval}
          pendingEditCount={pendingCount}
          canAct={canAct}
          isViewer={isViewer}
          onDecide={decide}
          onRetryHandoff={retryHandoff}
        />
      </div>
    </div>
  );
}
