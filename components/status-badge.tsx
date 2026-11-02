import type { ContractStatus } from '@/lib/domain';
import { Badge } from './ui/badge';

const STATUS: Record<ContractStatus, { label: string; tone: 'neutral' | 'found' | 'risk' | 'unsupported' | 'info' }> = {
  parsed: { label: 'Awaiting extraction', tone: 'neutral' },
  extracting: { label: 'Extracting', tone: 'info' },
  ready: { label: 'Needs review', tone: 'unsupported' },
  sent_back: { label: 'Sent back', tone: 'info' },
  approved: { label: 'Approved', tone: 'found' },
  rejected: { label: 'Rejected', tone: 'risk' },
};

export function StatusBadge({ status }: { status: ContractStatus }) {
  const { label, tone } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
