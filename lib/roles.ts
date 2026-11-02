import { cookies } from 'next/headers';
import { z } from 'zod';
import { roles, type Role } from './domain';
import { HttpError } from './errors';

export const ROLE_COOKIE = 'clausedesk-role';

/**
 * Demo stand-in for real auth: the role lives in an httpOnly cookie set by /api/role and is
 * re-read on every request. New visitors start as Reviewer so they can try the workflow.
 */
export async function getRole(): Promise<Role> {
  const value = (await cookies()).get(ROLE_COOKIE)?.value;
  return z.enum(roles).catch('Reviewer').parse(value);
}

export function requireReviewer(role: Role) {
  if (role !== 'Reviewer') throw new HttpError(403, 'Viewers have read-only access. Switch to Reviewer to make changes.');
}

/** Rejects writes whose Origin header doesn't match the host serving the request. */
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return;
  const url = new URL(request.url);
  const expected = `${url.protocol}//${request.headers.get('host') ?? url.host}`;
  if (origin !== expected) throw new HttpError(403, 'Cross-origin requests are not allowed.');
}
