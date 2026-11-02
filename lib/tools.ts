import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit } from './audit';
import { getDb } from './db';
import { erpVendors } from './db/schema';
import type { Role, VendorMatch } from './domain';

export const lookupInputSchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();

/** Seed record so the duplicate-vendor check has something to find in a fresh database. */
const SEED_VENDOR = { id: 'V-1042', name: 'Northwind Ltd' };

/** Read-only search of the mock finance system. This is the only tool the model can call. */
export async function lookupVendor(name: string, role: Role, contractId?: string): Promise<VendorMatch[]> {
  const input = lookupInputSchema.parse({ name });
  const db = await getDb();
  await db.insert(erpVendors).values(SEED_VENDOR).onConflictDoNothing();

  const matches = await db
    .select({ id: erpVendors.id, name: erpVendors.name })
    .from(erpVendors)
    .where(
      sql`position(lower(${erpVendors.name}) in lower(${input.name})) > 0
       or position(lower(${input.name}) in lower(${erpVendors.name})) > 0`,
    )
    .limit(10);

  await audit(role, 'vendor_lookup', { name: input.name, matches }, contractId);
  return matches;
}

export const lookupVendorTool = {
  name: 'lookup_vendor',
  description:
    'Read-only search of the finance system for existing vendor records by name. Use it once with the vendor name you found so the reviewer can spot duplicates.',
  input_schema: {
    type: 'object' as const,
    properties: { name: { type: 'string', description: 'Vendor legal name as written in the contract.' } },
    required: ['name'],
    additionalProperties: false,
  },
};
