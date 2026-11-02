import { idSchema } from '@/lib/domain';
import { readJson, route } from '@/lib/http';
import { requireReviewer } from '@/lib/roles';
import { createErpVendor, saveReview } from '@/lib/store';

type Context = { params: Promise<{ id: string }> };

export const POST = route<Context>(async (request, role, { params }) => {
  requireReviewer(role);
  const id = idSchema.parse((await params).id);
  const review = await saveReview(id, await readJson(request), role);
  if (review.status !== 'approved') return Response.json(review);

  // The finance record is created here, by the server, after the approval is committed.
  // If this fails the approval stands and the client can retry with the same key.
  try {
    const vendor = await createErpVendor(review.reviewId, erpIdempotencyKey(review.reviewId), role);
    return Response.json({ ...review, erpVendorId: vendor.id });
  } catch (error) {
    console.error('Finance handoff failed:', error instanceof Error ? error.message : error);
    return Response.json({ ...review, erpVendorId: null, handoffError: 'Approved, but the finance handoff failed. Retry it from the review screen.' });
  }
});

function erpIdempotencyKey(reviewId: string) {
  return `approval-${reviewId}`;
}
