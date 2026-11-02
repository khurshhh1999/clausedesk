import { integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { CheckedFields, ContractStatus, Edits, Flag, ReviewAction, Role, VendorMatch } from '../domain';

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

export const contracts = pgTable('contracts', {
  id: text().primaryKey(),
  name: text().notNull(),
  sampleId: text('sample_id'),
  status: text().$type<ContractStatus>().notNull().default('parsed'),
  /** Incremented on every state change; reviews must quote the version they were made against. */
  version: integer().notNull().default(1),
  createdAt: createdAt(),
});

export const paragraphs = pgTable(
  'paragraphs',
  {
    id: text().notNull(),
    contractId: text('contract_id')
      .notNull()
      .references(() => contracts.id, { onDelete: 'cascade' }),
    page: integer().notNull(),
    text: text().notNull(),
  },
  (t) => [uniqueIndex('paragraph_identity').on(t.contractId, t.id)],
);

export const extractions = pgTable(
  'extractions',
  {
    id: text().primaryKey(),
    contractId: text('contract_id')
      .notNull()
      .references(() => contracts.id),
    fields: jsonb().$type<CheckedFields>().notNull(),
    edits: jsonb().$type<Edits>().notNull().default({}),
    lookup: jsonb().$type<VendorMatch[]>().notNull().default([]),
    mode: text().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('extraction_contract').on(t.contractId)],
);

export const flags = pgTable('flags', {
  id: text().primaryKey(),
  contractId: text('contract_id')
    .notNull()
    .references(() => contracts.id),
  data: jsonb().$type<Flag>().notNull(),
});

export const reviews = pgTable('reviews', {
  id: text().primaryKey(),
  contractId: text('contract_id')
    .notNull()
    .references(() => contracts.id),
  action: text().$type<ReviewAction>().notNull(),
  reason: text().notNull(),
  role: text().$type<Role>().notNull(),
  /** Every field value as approved, including reviewer edits. This is what the finance system receives. */
  snapshot: jsonb().$type<Edits>().notNull(),
  version: integer().notNull(),
  createdAt: createdAt(),
});

export const erpVendors = pgTable(
  'erp_vendors',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    approvalId: text('approval_id').references(() => reviews.id),
    idempotencyKey: text('idempotency_key'),
    snapshot: jsonb().$type<Edits>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('vendor_approval').on(t.approvalId), uniqueIndex('vendor_idempotency').on(t.idempotencyKey)],
);

export const auditLog = pgTable('audit_log', {
  id: text().primaryKey(),
  contractId: text('contract_id'),
  role: text().$type<Role>().notNull(),
  action: text().notNull(),
  detail: jsonb().notNull(),
  createdAt: createdAt(),
});
