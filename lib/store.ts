import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { getDb } from './db';
import { auditLog, contracts, erpVendors, extractions, flags, paragraphs, reviews } from './db/schema';
import {
  fieldKeys,
  reviewSchema,
  type CheckedFields,
  type ContractStatus,
  type Edits,
  type Paragraph,
  type ReviewAction,
  type Role,
  type VendorMatch,
} from './domain';
import { HttpError } from './errors';
import { requireReviewer } from './roles';
import { effectiveValue, riskFlags } from './rules';

const REVIEWABLE: ContractStatus[] = ['ready', 'sent_back'];
const STATUS_AFTER: Record<ReviewAction, ContractStatus> = {
  approve: 'approved',
  send_back: 'sent_back',
  reject: 'rejected',
};

export async function createContract(name: string, sampleId: string | null, parsed: Paragraph[], role: Role) {
  const db = await getDb();
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(contracts).values({ id, name, sampleId });
    await tx.insert(paragraphs).values(parsed.map((p) => ({ ...p, contractId: id })));
    await tx.insert(auditLog).values({
      id: crypto.randomUUID(),
      contractId: id,
      role,
      action: 'contract_parsed',
      detail: { name, paragraphs: parsed.length, pages: new Set(parsed.map((p) => p.page)).size },
    });
  });
  return id;
}

export async function listContracts() {
  const db = await getDb();
  return db.select().from(contracts).orderBy(desc(contracts.createdAt)).limit(50);
}

export async function getContract(id: string) {
  const db = await getDb();
  const [contract] = await db.select().from(contracts).where(eq(contracts.id, id));
  if (!contract) throw new HttpError(404, 'Contract not found.');

  const [paragraphRows, extractionRows, flagRows, reviewRows, vendorRows] = await Promise.all([
    db.select().from(paragraphs).where(eq(paragraphs.contractId, id)).orderBy(asc(paragraphs.page), asc(paragraphs.id)),
    db.select().from(extractions).where(eq(extractions.contractId, id)),
    db.select().from(flags).where(eq(flags.contractId, id)),
    db.select().from(reviews).where(eq(reviews.contractId, id)).orderBy(desc(reviews.createdAt)),
    db
      .select({ id: erpVendors.id, approvalId: erpVendors.approvalId })
      .from(erpVendors)
      .innerJoin(reviews, eq(erpVendors.approvalId, reviews.id))
      .where(eq(reviews.contractId, id)),
  ]);

  return {
    ...contract,
    paragraphs: paragraphRows.map(({ id, page, text }) => ({ id, page, text })),
    extraction: extractionRows[0] ?? null,
    flags: flagRows.map((f) => f.data),
    reviews: reviewRows,
    erpVendor: vendorRows[0] ?? null,
  };
}

export type ContractDetail = Awaited<ReturnType<typeof getContract>>;

/** Claims a parsed contract for extraction so two requests can't extract (and bill) it twice. */
export async function claimForExtraction(id: string) {
  const db = await getDb();
  const [claimed] = await db
    .update(contracts)
    .set({ status: 'extracting' })
    .where(and(eq(contracts.id, id), eq(contracts.status, 'parsed')))
    .returning();
  if (!claimed) throw new HttpError(409, 'This contract has already been extracted.');
}

export async function saveExtraction(
  id: string,
  role: Role,
  result: { fields: CheckedFields; vendorMatches: VendorMatch[]; model: string },
) {
  const db = await getDb();
  const flagged = riskFlags(result.fields);
  await db.transaction(async (tx) => {
    await tx.insert(extractions).values({
      id: crypto.randomUUID(),
      contractId: id,
      fields: result.fields,
      lookup: result.vendorMatches,
      mode: result.model,
    });
    if (flagged.length) {
      await tx.insert(flags).values(flagged.map((data) => ({ id: crypto.randomUUID(), contractId: id, data })));
    }
    await tx
      .update(contracts)
      .set({ status: 'ready', version: sql`${contracts.version} + 1` })
      .where(eq(contracts.id, id));
    await tx.insert(auditLog).values({
      id: crypto.randomUUID(),
      contractId: id,
      role,
      action: 'extraction_completed',
      detail: {
        model: result.model,
        found: fieldKeys.filter((k) => result.fields[k].status === 'found').length,
        unsupported: fieldKeys.filter((k) => result.fields[k].status === 'unsupported'),
        flags: flagged.map((f) => f.id),
      },
    });
  });
}

export async function releaseFailedExtraction(id: string, role: Role, message: string) {
  const db = await getDb();
  await db.update(contracts).set({ status: 'parsed' }).where(eq(contracts.id, id));
  await db.insert(auditLog).values({
    id: crypto.randomUUID(),
    contractId: id,
    role,
    action: 'extraction_failed',
    detail: { message },
  });
}

/**
 * Records a reviewer decision. Re-runs the policy rules on the edited values server-side, so the
 * client can't skip a required reason, and stores the full approved snapshot for the finance handoff.
 */
export async function saveReview(id: string, input: unknown, role: Role) {
  requireReviewer(role);
  const data = reviewSchema.parse(input);
  const db = await getDb();

  return db.transaction(async (tx) => {
    const [contract] = await tx.select().from(contracts).where(eq(contracts.id, id)).for('update');
    if (!contract) throw new HttpError(404, 'Contract not found.');
    if (contract.version !== data.version) throw new HttpError(409, 'This contract changed since you opened it. Reload and try again.');
    if (!REVIEWABLE.includes(contract.status)) throw new HttpError(409, 'This contract is not awaiting review.');

    const [extraction] = await tx.select().from(extractions).where(eq(extractions.contractId, id));
    if (!extraction) throw new HttpError(409, 'Extract the contract before reviewing it.');

    const edits: Edits = { ...extraction.edits, ...data.edits };
    const openFlags = riskFlags(extraction.fields, edits);
    const originalFlags = riskFlags(extraction.fields);
    const unsupported = fieldKeys.filter((k) => extraction.fields[k].status === 'unsupported' && !Object.hasOwn(edits, k));
    const changedFields = fieldKeys.filter(
      (k) =>
        Object.hasOwn(data.edits, k) &&
        JSON.stringify(effectiveValue(extraction.fields, extraction.edits, k)) !== JSON.stringify(data.edits[k]),
    );

    const needsReason = openFlags.length > 0 || originalFlags.length > 0 || unsupported.length > 0 || changedFields.length > 0;
    if (needsReason && !data.reason) {
      throw new HttpError(400, 'A reason is required when flags are open, citations are unsupported, or fields were edited.');
    }
    if (data.action === 'approve' && unsupported.length) {
      throw new HttpError(400, 'Correct or clear the unsupported fields before approving.');
    }

    const snapshot = Object.fromEntries(fieldKeys.map((k) => [k, effectiveValue(extraction.fields, edits, k)])) as Edits;
    if (data.action === 'approve' && !snapshot.vendor_name) throw new HttpError(400, 'A vendor name is required to approve.');

    for (const field of changedFields) {
      await tx.insert(auditLog).values({
        id: crypto.randomUUID(),
        contractId: id,
        role,
        action: 'field_edited',
        detail: { field, old: effectiveValue(extraction.fields, extraction.edits, field), new: data.edits[field] ?? null },
      });
    }

    await tx.update(extractions).set({ edits }).where(eq(extractions.contractId, id));
    await tx.delete(flags).where(eq(flags.contractId, id));
    if (openFlags.length) {
      await tx.insert(flags).values(openFlags.map((f) => ({ id: crypto.randomUUID(), contractId: id, data: f })));
    }

    const reviewId = crypto.randomUUID();
    const status = STATUS_AFTER[data.action];
    await tx.insert(reviews).values({ id: reviewId, contractId: id, role, reason: data.reason, action: data.action, snapshot, version: data.version });
    await tx
      .update(contracts)
      .set({ status, version: sql`${contracts.version} + 1` })
      .where(and(eq(contracts.id, id), eq(contracts.version, data.version)));
    await tx.insert(auditLog).values({
      id: crypto.randomUUID(),
      contractId: id,
      role,
      action: data.action,
      detail: { reviewId, reason: data.reason, editedFields: changedFields, snapshot, openFlags: openFlags.map((f) => f.id) },
    });

    return { reviewId, status };
  });
}

/**
 * Creates the vendor record in the mock finance system. Only the server calls this, only for a
 * current approval, and an Idempotency-Key makes retries return the original record.
 */
export async function createErpVendor(approvalId: string, idempotencyKey: string, role: Role) {
  requireReviewer(role);
  const db = await getDb();

  return db.transaction(async (tx) => {
    const [review] = await tx.select().from(reviews).where(eq(reviews.id, approvalId)).for('update');
    if (!review || review.action !== 'approve' || review.role !== 'Reviewer') {
      throw new HttpError(403, 'A valid reviewer approval is required.');
    }

    const [contract] = await tx.select().from(contracts).where(eq(contracts.id, review.contractId));
    if (!contract || contract.status !== 'approved' || contract.version !== review.version + 1) {
      throw new HttpError(409, 'This approval is no longer current.');
    }

    const [keyOwner] = await tx.select().from(erpVendors).where(eq(erpVendors.idempotencyKey, idempotencyKey));
    if (keyOwner && keyOwner.approvalId !== approvalId) {
      throw new HttpError(409, 'This Idempotency-Key was already used for a different approval.');
    }

    const [existing] = await tx.select().from(erpVendors).where(eq(erpVendors.approvalId, approvalId));
    if (existing) return { ...existing, replayed: true };

    if (!review.snapshot.vendor_name) throw new HttpError(400, 'The approved values have no vendor name.');

    const [vendor] = await tx
      .insert(erpVendors)
      .values({
        id: `V-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        name: review.snapshot.vendor_name,
        approvalId,
        idempotencyKey,
        snapshot: review.snapshot,
      })
      .onConflictDoNothing()
      .returning();
    if (!vendor) throw new HttpError(409, 'This Idempotency-Key is already in use.');

    await tx.insert(auditLog).values({
      id: crypto.randomUUID(),
      contractId: review.contractId,
      role,
      action: 'erp_vendor_created',
      detail: { vendorId: vendor.id, name: vendor.name, approvalId, idempotencyKey },
    });
    return { ...vendor, replayed: false };
  });
}
