import { z } from 'zod';

export const fieldKeys = [
  'vendor_name',
  'effective_date',
  'initial_term',
  'auto_renewal',
  'renewal_notice_days',
  'payment_terms',
  'total_contract_value',
  'termination_for_convenience',
  'liability_cap',
  'governing_law',
  'data_protection',
] as const;

export type FieldKey = (typeof fieldKeys)[number];

export const fieldLabels: Record<FieldKey, string> = {
  vendor_name: 'Vendor name',
  effective_date: 'Effective date',
  initial_term: 'Initial term',
  auto_renewal: 'Auto-renewal',
  renewal_notice_days: 'Renewal notice',
  payment_terms: 'Payment terms',
  total_contract_value: 'Total contract value',
  termination_for_convenience: 'Termination for convenience',
  liability_cap: 'Liability cap',
  governing_law: 'Governing law',
  data_protection: 'Data protection / DPA',
};

const text = z.string().trim().min(1).max(2000);
const days = z.number().int().min(0).max(3650);

export const fieldValueSchemas = {
  vendor_name: text,
  effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  initial_term: text,
  auto_renewal: z.boolean(),
  renewal_notice_days: days,
  payment_terms: days,
  total_contract_value: z
    .object({
      amount: z.number().nonnegative(),
      currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
    })
    .strict(),
  termination_for_convenience: z.boolean(),
  liability_cap: text,
  governing_law: text,
  data_protection: z.boolean(),
} satisfies Record<FieldKey, z.ZodType>;

export const booleanFields: readonly FieldKey[] = ['auto_renewal', 'termination_for_convenience', 'data_protection'];
export const dayFields: readonly FieldKey[] = ['renewal_notice_days', 'payment_terms'];

/** One extracted field as returned by the model: a value plus the paragraph and verbatim quote it relied on. */
function extractedField<T extends z.ZodType>(value: T) {
  return z
    .object({
      value: value.nullable(),
      paragraph_id: z.string().regex(/^p-\d{3,}$/).nullable(),
      quote: z.string().max(8000).nullable(),
      status: z.enum(['found', 'not_found']),
    })
    .strict()
    .superRefine((raw, ctx) => {
      const field = raw as { value: unknown; paragraph_id: string | null; quote: string | null; status: string };
      if (field.status === 'found' && (field.value === null || !field.paragraph_id || !field.quote?.trim())) {
        ctx.addIssue({ code: 'custom', message: 'A found field needs a value, a paragraph_id and a quote.' });
      }
      if (field.status === 'not_found' && (field.value !== null || field.paragraph_id !== null || field.quote !== null)) {
        ctx.addIssue({ code: 'custom', message: 'A not_found field must have null value, paragraph_id and quote.' });
      }
    });
}

export const extractionSchema = z
  .object({
    vendor_name: extractedField(fieldValueSchemas.vendor_name),
    effective_date: extractedField(fieldValueSchemas.effective_date),
    initial_term: extractedField(fieldValueSchemas.initial_term),
    auto_renewal: extractedField(fieldValueSchemas.auto_renewal),
    renewal_notice_days: extractedField(fieldValueSchemas.renewal_notice_days),
    payment_terms: extractedField(fieldValueSchemas.payment_terms),
    total_contract_value: extractedField(fieldValueSchemas.total_contract_value),
    termination_for_convenience: extractedField(fieldValueSchemas.termination_for_convenience),
    liability_cap: extractedField(fieldValueSchemas.liability_cap),
    governing_law: extractedField(fieldValueSchemas.governing_law),
    data_protection: extractedField(fieldValueSchemas.data_protection),
  })
  .strict();

export type Extraction = z.infer<typeof extractionSchema>;
export type FieldValue = Extraction[FieldKey]['value'];

export type FieldStatus = 'found' | 'not_found' | 'unsupported';

export type CheckedField = {
  value: FieldValue;
  paragraph_id: string | null;
  quote: string | null;
  status: FieldStatus;
  issue?: string;
};

export type CheckedFields = Record<FieldKey, CheckedField>;

export type Paragraph = { id: string; page: number; text: string };

export type Flag = {
  id: string;
  field: FieldKey;
  title: string;
  detail: string;
  paragraph_id: string | null;
  severity: 'risk' | 'approval';
};

export const roles = ['Reviewer', 'Viewer'] as const;
export type Role = (typeof roles)[number];

export type VendorMatch = { id: string; name: string };

export const contractStatuses = ['parsed', 'extracting', 'ready', 'sent_back', 'approved', 'rejected'] as const;
export type ContractStatus = (typeof contractStatuses)[number];

export const editsSchema = z
  .object(
    Object.fromEntries(fieldKeys.map((key) => [key, fieldValueSchemas[key].nullable().optional()])) as {
      [K in FieldKey]: z.ZodOptional<z.ZodNullable<(typeof fieldValueSchemas)[K]>>;
    },
  )
  .strict();

export type Edits = z.infer<typeof editsSchema>;

export const reviewActions = ['approve', 'send_back', 'reject'] as const;
export type ReviewAction = (typeof reviewActions)[number];

export const reviewSchema = z
  .object({
    action: z.enum(reviewActions),
    reason: z.string().trim().max(2000).default(''),
    version: z.number().int().positive(),
    edits: editsSchema.default({}),
  })
  .strict();

export const idSchema = z.uuid();

export function formatValue(key: FieldKey, value: FieldValue): string {
  if (value === null) return 'Not found';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return `${value.currency} ${value.amount.toLocaleString('en-US')}`;
  if (typeof value === 'number' && key === 'payment_terms') return `Net ${value}`;
  if (typeof value === 'number' && key === 'renewal_notice_days') return `${value} days`;
  return String(value);
}
