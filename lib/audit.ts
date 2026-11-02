import { getDb } from './db';
import { auditLog } from './db/schema';
import type { Role } from './domain';

export type AuditAction =
  | 'api_call'
  | 'contract_parsed'
  | 'extraction_completed'
  | 'extraction_failed'
  | 'vendor_lookup'
  | 'field_edited'
  | 'approve'
  | 'send_back'
  | 'reject'
  | 'erp_vendor_created';

export async function audit(role: Role, action: AuditAction, detail: unknown, contractId?: string) {
  const db = await getDb();
  await db.insert(auditLog).values({ id: crypto.randomUUID(), role, action, detail, contractId });
}
