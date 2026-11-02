import type { CheckedFields, Edits, FieldKey, FieldValue, Flag } from './domain';

export const POLICY = {
  minRenewalNoticeDays: 30,
  maxPaymentTermDays: 60,
  secondApproverThresholdUsd: 250_000,
};

/** The value a reviewer is approving: their edit if they made one, otherwise the verified extraction. */
export function effectiveValue(fields: CheckedFields, edits: Edits, key: FieldKey): FieldValue {
  if (Object.hasOwn(edits, key)) return edits[key] ?? null;
  return fields[key].status === 'found' ? fields[key].value : null;
}

/** Deterministic policy checks. Unsupported citations count as missing, so they can never hide a risk. */
export function riskFlags(fields: CheckedFields, edits: Edits = {}): Flag[] {
  const flags: Flag[] = [];
  const value = (key: FieldKey) => effectiveValue(fields, edits, key);
  const add = (flag: Omit<Flag, 'paragraph_id' | 'severity'> & { severity?: Flag['severity'] }) => {
    const source = fields[flag.field];
    flags.push({
      severity: 'risk',
      ...flag,
      paragraph_id: source.status === 'found' ? source.paragraph_id : null,
    });
  };

  if (value('auto_renewal') === true) {
    const notice = value('renewal_notice_days');
    if (typeof notice === 'number' && notice < POLICY.minRenewalNoticeDays) {
      add({
        id: 'short_renewal',
        field: 'renewal_notice_days',
        title: 'Short renewal notice',
        detail: `Auto-renews with only ${notice} days to opt out. Policy minimum is ${POLICY.minRenewalNoticeDays}.`,
      });
    } else if (notice === null) {
      add({
        id: 'unknown_renewal',
        field: 'renewal_notice_days',
        title: 'Renewal notice not verified',
        detail: 'The contract auto-renews, but no verified notice period was found.',
      });
    }
  }

  if (!value('liability_cap')) {
    add({
      id: 'liability',
      field: 'liability_cap',
      title: 'No liability cap',
      detail: 'No verified limit on liability was found.',
    });
  }

  const paymentDays = value('payment_terms');
  if (typeof paymentDays === 'number' && paymentDays > POLICY.maxPaymentTermDays) {
    add({
      id: 'payment',
      field: 'payment_terms',
      title: 'Long payment terms',
      detail: `Net ${paymentDays} is beyond the net ${POLICY.maxPaymentTermDays} policy.`,
    });
  }

  if (value('data_protection') !== true) {
    add({
      id: 'data',
      field: 'data_protection',
      title: 'No data-protection clause',
      detail: 'No verified data-protection or DPA clause was found.',
    });
  }

  const total = value('total_contract_value');
  if (
    total &&
    typeof total === 'object' &&
    total.currency === 'USD' &&
    total.amount > POLICY.secondApproverThresholdUsd
  ) {
    add({
      id: 'second_approver',
      field: 'total_contract_value',
      title: 'Second approver required',
      detail: `Value is over USD ${POLICY.secondApproverThresholdUsd.toLocaleString('en-US')}.`,
      severity: 'approval',
    });
  }

  return flags;
}
