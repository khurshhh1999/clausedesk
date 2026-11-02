import { z } from 'zod';
import { audit } from './audit';
import type { Role } from './domain';
import { HttpError } from './errors';
import { assertSameOrigin, getRole } from './roles';

type Handler<Ctx> = (request: Request, role: Role, context: Ctx) => Promise<Response>;

/**
 * Wraps a route handler with the checks every endpoint shares: resolve the role server-side,
 * block cross-origin writes, turn errors into JSON responses, and record the call in the audit log.
 */
export function route<Ctx = unknown>(handler: Handler<Ctx>) {
  return async (request: Request, context: Ctx) => {
    const role = await getRole();
    let response: Response;

    try {
      if (request.method !== 'GET' && request.method !== 'HEAD') assertSameOrigin(request);
      response = await handler(request, role, context);
    } catch (error) {
      response = errorResponse(error);
    }

    const path = new URL(request.url).pathname;
    if (request.method !== 'GET' || path.startsWith('/api/erp/')) {
      try {
        await audit(role, 'api_call', { method: request.method, path, status: response.status });
      } catch {
        console.error('Could not write API call to the audit log');
      }
    }
    return response;
  };
}

function errorResponse(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError) {
    const message = error.issues.map((issue) => [issue.path.join('.'), issue.message].filter(Boolean).join(': ')).join('; ');
    return Response.json({ error: message }, { status: 400 });
  }
  console.error('Request failed:', error instanceof Error ? error.message : error);
  return Response.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
}

export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 100_000) throw new HttpError(413, 'Request body is too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

const buckets = new Map<string, { count: number; resetAt: number }>();
const HOUR = 60 * 60 * 1000;

/**
 * Per-instance hourly limit on endpoints that spend model credits. Good enough to stop a public
 * demo link from being drained; a shared store (e.g. Upstash) would be needed for a hard cap.
 */
export function rateLimit(request: Request, kind: string, { perClient = 10, global = 60 } = {}) {
  const now = Date.now();
  for (const [key, bucket] of buckets) if (bucket.resetAt < now) buckets.delete(key);

  const client = request.headers.get('x-vercel-forwarded-for') ?? request.headers.get('x-forwarded-for') ?? 'local';
  const limits: [string, number][] = [
    [`${kind}:global`, global],
    [`${kind}:${client.split(',')[0].trim()}`, perClient],
  ];

  for (const [key, max] of limits) {
    const bucket = buckets.get(key) ?? { count: 0, resetAt: now + HOUR };
    if (bucket.count >= max) throw new HttpError(429, 'Hourly limit reached for this demo. Try again later.');
    bucket.count++;
    buckets.set(key, bucket);
  }
}
