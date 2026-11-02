'use client';

import { Ban, Check, CircleCheck, CircleX, LoaderCircle, Lock, RotateCcw, Undo2 } from 'lucide-react';
import { useState } from 'react';
import type { ContractStatus, ReviewAction } from '@/lib/domain';
import type { ContractDetail } from '@/lib/store';
import { LocalTime } from '../local-time';
import { Button } from '../ui/button';

type Props = {
  status: ContractStatus;
  latestReview: ContractDetail['reviews'][number] | undefined;
  erpVendorId: string | null;
  reasonRequired: string | null;
  blockApproval: string | null;
  pendingEditCount: number;
  canAct: boolean;
  isViewer: boolean;
  onDecide: (action: ReviewAction, reason: string) => Promise<void>;
  onRetryHandoff: () => Promise<void>;
};

const ACTION_LABEL: Record<ReviewAction, string> = { approve: 'Approved', send_back: 'Sent back', reject: 'Rejected' };

export function DecisionPanel(props: Props) {
  const { status, latestReview, reasonRequired, blockApproval, pendingEditCount, canAct, isViewer, onDecide } = props;
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<ReviewAction | null>(null);
  const [error, setError] = useState('');
  const awaitingReview = status === 'ready' || status === 'sent_back';

  async function decide(action: ReviewAction) {
    setError('');
    if (reasonRequired && !reason.trim()) {
      setError(`Add a reason first: ${reasonRequired}`);
      return;
    }
    setPending(action);
    try {
      await onDecide(action, reason.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The decision could not be saved.');
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-surface shadow-sm">
      <header className="border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold">Decision</h2>
      </header>

      <div className="space-y-3 p-4">
        {latestReview && (
          <PreviousDecision review={latestReview} status={status} erpVendorId={props.erpVendorId} canRetry={!isViewer} onRetry={props.onRetryHandoff} />
        )}

        {awaitingReview && (
          <>
            <div>
              <label htmlFor="reason" className="flex items-baseline justify-between text-xs text-ink-soft">
                <span>Reason{reasonRequired ? '' : ' (optional)'}</span>
                {reasonRequired && <span className="text-rose-700">Required: {reasonRequired}</span>}
              </label>
              <textarea
                id="reason"
                rows={3}
                value={reason}
                disabled={!canAct}
                onChange={(e) => setReason(e.target.value)}
                placeholder={isViewer ? 'Viewers cannot record decisions.' : 'What did you check, accept or ask the vendor to change?'}
                className="mt-1.5 w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-sm placeholder:text-ink-faint disabled:bg-canvas"
              />
            </div>

            {pendingEditCount > 0 && (
              <p className="text-xs text-sky-800">
                {pendingEditCount} unsaved {pendingEditCount === 1 ? 'edit' : 'edits'} will be saved with this decision and logged with old and new values.
              </p>
            )}
            {blockApproval && <p className="text-xs text-amber-800">{blockApproval}</p>}
            {error && (
              <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {error}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="accent" disabled={!canAct || pending !== null || Boolean(blockApproval)} onClick={() => decide('approve')}>
                {pending === 'approve' ? <LoaderCircle className="animate-spin" /> : <Check />}
                Approve
              </Button>
              <Button variant="outline" disabled={!canAct || pending !== null} onClick={() => decide('send_back')}>
                {pending === 'send_back' ? <LoaderCircle className="animate-spin" /> : <Undo2 />}
                Send back
              </Button>
              <Button variant="danger" disabled={!canAct || pending !== null} onClick={() => decide('reject')}>
                {pending === 'reject' ? <LoaderCircle className="animate-spin" /> : <Ban />}
                Reject
              </Button>
            </div>

            {isViewer && (
              <p className="flex items-center gap-1.5 text-xs text-ink-faint">
                <Lock className="size-3.5" />
                Read-only. The server also rejects review requests from Viewers.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

function PreviousDecision({
  review,
  status,
  erpVendorId,
  canRetry,
  onRetry,
}: {
  review: ContractDetail['reviews'][number];
  status: ContractStatus;
  erpVendorId: string | null;
  canRetry: boolean;
  onRetry: () => Promise<void>;
}) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState('');
  const Icon = review.action === 'approve' ? CircleCheck : review.action === 'reject' ? CircleX : RotateCcw;
  const tone = review.action === 'approve' ? 'text-emerald-700' : review.action === 'reject' ? 'text-rose-700' : 'text-sky-700';

  return (
    <div className="rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm">
      <p className={`flex items-center gap-1.5 font-medium ${tone}`}>
        <Icon className="size-4" />
        {ACTION_LABEL[review.action]} by {review.role}
        <LocalTime value={review.createdAt} className="ml-auto text-xs font-normal text-ink-faint" />
      </p>
      {review.reason && <p className="mt-1 text-ink-soft">{review.reason}</p>}

      {status === 'approved' &&
        (erpVendorId ? (
          <p className="mt-2 text-xs text-ink-soft">
            Finance record created: <span className="font-mono text-ink">{erpVendorId}</span>
          </p>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-800">
            The finance handoff has not completed.
            {canRetry && (
              <Button
                size="sm"
                variant="outline"
                disabled={retrying}
                onClick={async () => {
                  setRetrying(true);
                  setError('');
                  try {
                    await onRetry();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Retry failed.');
                  } finally {
                    setRetrying(false);
                  }
                }}
              >
                Retry handoff
              </Button>
            )}
            {error && <span className="text-rose-700">{error}</span>}
          </div>
        ))}
    </div>
  );
}
