import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/lib/db';
import { auditLog } from '@/lib/db/schema';
import { route } from '@/lib/http';

const PAGE_SIZE = 100;

const query = z
  .object({
    contractId: z.uuid().optional(),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const GET = route(async (request) => {
  const { contractId, offset } = query.parse(Object.fromEntries(new URL(request.url).searchParams));
  const db = await getDb();
  const entries = await db
    .select()
    .from(auditLog)
    .where(contractId ? eq(auditLog.contractId, contractId) : undefined)
    .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
    .limit(PAGE_SIZE)
    .offset(offset);
  return Response.json({ entries, pageSize: PAGE_SIZE });
});
