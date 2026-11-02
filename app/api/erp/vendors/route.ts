import { z } from 'zod';
import { readJson, route } from '@/lib/http';
import { requireReviewer } from '@/lib/roles';
import { createErpVendor } from '@/lib/store';
import { lookupInputSchema, lookupVendor } from '@/lib/tools';

/** Mock finance system. GET is the read-only lookup the model can use; POST is server/reviewer only. */
export const GET = route(async (request, role) => {
  const { name } = lookupInputSchema.parse(Object.fromEntries(new URL(request.url).searchParams));
  return Response.json(await lookupVendor(name, role));
});

const idempotencyKey = z
  .string({ error: 'Idempotency-Key header is required.' })
  .min(8)
  .max(200)
  .regex(/^[\w-]+$/);

export const POST = route(async (request, role) => {
  requireReviewer(role);
  const key = idempotencyKey.parse(request.headers.get('Idempotency-Key') ?? undefined);
  const { approvalId } = z.object({ approvalId: z.uuid() }).strict().parse(await readJson(request));
  const vendor = await createErpVendor(approvalId, key, role);
  return Response.json(vendor, { status: vendor.replayed ? 200 : 201 });
});
