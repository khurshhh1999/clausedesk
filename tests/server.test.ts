import { eq } from 'drizzle-orm';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Paragraph, Role } from '../lib/domain';

const session = vi.hoisted(() => ({ role: 'Reviewer' as Role }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: () => ({ value: session.role }),
    set: (_name: string, value: Role) => {
      session.role = value;
    },
  }),
}));

const { getDb } = await import('../lib/db');
const { auditLog, erpVendors } = await import('../lib/db/schema');
const { assertSameOrigin } = await import('../lib/roles');
const { createContract, createErpVendor, getContract, saveReview } = await import('../lib/store');
const { lookupVendor } = await import('../lib/tools');
const { POST: uploadRoute } = await import('../app/api/contracts/route');
const { POST: extractRoute } = await import('../app/api/contracts/[id]/extract/route');
const { POST: reviewRoute } = await import('../app/api/contracts/[id]/review/route');
const { POST: erpRoute } = await import('../app/api/erp/vendors/route');
const { loadSample, params, post, readyContract } = await import('./helpers');

let clean: Paragraph[];
let risky: Paragraph[];

beforeAll(async () => {
  clean = await loadSample('acme-clean');
  risky = await loadSample('northwind-risky');
});

beforeEach(() => {
  session.role = 'Reviewer';
});

describe('roles are enforced on the server', () => {
  it('returns 403 to a Viewer at every write endpoint', async () => {
    session.role = 'Viewer';
    const id = crypto.randomUUID();
    const responses = [
      await uploadRoute(post('/api/contracts', { sampleId: 'acme-clean' }), {}),
      await extractRoute(post(`/api/contracts/${id}/extract`, {}), params(id)),
      await reviewRoute(post(`/api/contracts/${id}/review`, {}), params(id)),
      await erpRoute(post('/api/erp/vendors', {}, { 'Idempotency-Key': 'viewer-attempt-1' }), {}),
    ];
    expect(responses.map((r) => r.status)).toEqual([403, 403, 403, 403]);
  });

  it('rejects cross-origin writes and malformed IDs', async () => {
    const crossOrigin = await uploadRoute(post('/api/contracts', { sampleId: 'acme-clean' }, { Origin: 'https://evil.example' }), {});
    expect(crossOrigin.status).toBe(403);
    expect((await reviewRoute(post('/api/contracts/bad/review', {}), params('bad'))).status).toBe(400);
  });

  it('accepts an Origin that matches the Host header', () => {
    expect(() => assertSameOrigin(post('/api/role', {}, { Host: '127.0.0.1:3000', Origin: 'http://127.0.0.1:3000' }))).not.toThrow();
  });
});

describe('review decisions', () => {
  it('requires a reason for every decision when flags are open', async () => {
    const id = await readyContract(risky);
    for (const action of ['approve', 'send_back', 'reject']) {
      await expect(saveReview(id, { action, version: 1, reason: '', edits: {} }, 'Reviewer')).rejects.toThrow('reason');
    }
  });

  it('stores edited values, logs old and new, and hands the edited snapshot to finance', async () => {
    const id = await readyContract(risky);
    const { reviewId } = await saveReview(id, { action: 'approve', version: 1, reason: 'Negotiated net 45.', edits: { payment_terms: 45 } }, 'Reviewer');
    const vendor = await createErpVendor(reviewId, 'edit-test-key', 'Reviewer');

    expect(vendor.snapshot.payment_terms).toBe(45);
    expect((await getContract(id)).extraction!.edits.payment_terms).toBe(45);
    const events = await (await getDb()).select().from(auditLog).where(eq(auditLog.contractId, id));
    expect(events.find((e) => e.action === 'field_edited')?.detail).toEqual({ field: 'payment_terms', old: 90, new: 45 });
  });

  it('rejects a decision made against a stale version', async () => {
    const id = await readyContract(clean);
    await saveReview(id, { action: 'approve', version: 1, edits: {} }, 'Reviewer');
    await expect(saveReview(id, { action: 'reject', version: 1, edits: {} }, 'Reviewer')).rejects.toThrow('changed');
  });

  it('blocks approval of an unsupported field until the reviewer corrects it', async () => {
    const id = await readyContract(clean);
    const db = await getDb();
    const { extractions } = await import('../lib/db/schema');
    const fields = (await getContract(id)).extraction!.fields;
    fields.vendor_name.status = 'unsupported';
    await db.update(extractions).set({ fields }).where(eq(extractions.contractId, id));

    await expect(saveReview(id, { action: 'approve', version: 1, reason: 'Checked', edits: {} }, 'Reviewer')).rejects.toThrow('unsupported');
    await expect(
      saveReview(id, { action: 'approve', version: 1, reason: 'Name checked against the signature page.', edits: { vendor_name: 'Acme Services Ltd' } }, 'Reviewer'),
    ).resolves.toHaveProperty('status', 'approved');
  });

  it('allows send back followed by approval', async () => {
    const id = await readyContract(risky);
    await saveReview(id, { action: 'send_back', version: 1, reason: 'Ask for net 60.', edits: {} }, 'Reviewer');
    expect((await getContract(id)).status).toBe('sent_back');
    await saveReview(id, { action: 'approve', version: 2, reason: 'Accepted as is.', edits: {} }, 'Reviewer');
    expect((await getContract(id)).status).toBe('approved');
  });

  it('creates the finance record on approval through the review endpoint', async () => {
    const id = await readyContract(clean);
    const response = await reviewRoute(post(`/api/contracts/${id}/review`, { action: 'approve', version: 1, edits: {} }), params(id));
    const body = await response.json();
    expect(body.erpVendorId).toMatch(/^V-/);
    expect((await getContract(id)).erpVendor?.id).toBe(body.erpVendorId);
  });
});

describe('mock finance system', () => {
  it('requires an Idempotency-Key header and a valid approval', async () => {
    const id = await readyContract(risky);
    const { reviewId } = await saveReview(id, { action: 'reject', version: 1, reason: 'Missing protections.', edits: {} }, 'Reviewer');

    expect((await erpRoute(post('/api/erp/vendors', { approvalId: reviewId }), {})).status).toBe(400);
    await expect(createErpVendor(reviewId, 'rejected-review-key', 'Reviewer')).rejects.toThrow('valid reviewer approval');
    await expect(createErpVendor(crypto.randomUUID(), 'unknown-approval-key', 'Reviewer')).rejects.toThrow('valid reviewer approval');
  });

  it('returns the same record for concurrent and repeated requests', async () => {
    const id = await readyContract(clean);
    const { reviewId } = await saveReview(id, { action: 'approve', version: 1, edits: {} }, 'Reviewer');
    const [a, b] = await Promise.all([
      createErpVendor(reviewId, 'concurrent-key', 'Reviewer'),
      createErpVendor(reviewId, 'concurrent-key', 'Reviewer'),
    ]);
    expect(a.id).toBe(b.id);
    expect([a, b].filter((v) => v.replayed)).toHaveLength(1);
    expect((await createErpVendor(reviewId, 'another-key-same-approval', 'Reviewer')).id).toBe(a.id);

    const rows = await (await getDb()).select().from(erpVendors).where(eq(erpVendors.approvalId, reviewId));
    expect(rows).toHaveLength(1);
  });

  it('refuses to reuse an Idempotency-Key for a different approval', async () => {
    const first = await saveReview(await readyContract(clean), { action: 'approve', version: 1, edits: {} }, 'Reviewer');
    const second = await saveReview(await readyContract(clean), { action: 'approve', version: 1, edits: {} }, 'Reviewer');
    await createErpVendor(first.reviewId, 'shared-key', 'Reviewer');
    await expect(createErpVendor(second.reviewId, 'shared-key', 'Reviewer')).rejects.toThrow('different approval');
  });

  it('finds the seeded duplicate vendor through the read-only lookup', async () => {
    expect(await lookupVendor('Northwind Ltd', 'Viewer')).toContainEqual({ id: 'V-1042', name: 'Northwind Ltd' });
  });
});

describe('extraction endpoint', () => {
  it('streams each stage, saves the result, and refuses a second run', async () => {
    const id = await createContract('acme-clean.pdf', 'acme-clean', clean, 'Reviewer');
    const response = await extractRoute(post(`/api/contracts/${id}/extract`, {}), params(id));
    expect(response.status).toBe(200);

    const stages = (await response.text()).trim().split('\n').map((line) => JSON.parse(line).stage);
    expect(stages).toEqual(['Extracting', 'Checking citations', 'Flags ready']);
    expect((await getContract(id)).extraction?.mode).toBe('demo-patterns');
    expect((await extractRoute(post(`/api/contracts/${id}/extract`, {}), params(id))).status).toBe(409);
  });
});
