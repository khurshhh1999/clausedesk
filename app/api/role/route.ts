import { cookies } from 'next/headers';
import { z } from 'zod';
import { isDemoMode, modelProvider } from '@/lib/config';
import { roles } from '@/lib/domain';
import { readJson, route } from '@/lib/http';
import { ROLE_COOKIE } from '@/lib/roles';

export const GET = route(async (_request, role) =>
  Response.json({
    role,
    demoMode: isDemoMode(),
    model: modelProvider()?.model ?? null,
    largeUploads: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  }),
);

export const POST = route(async (request) => {
  const { role } = z.object({ role: z.enum(roles) }).strict().parse(await readJson(request));
  (await cookies()).set(ROLE_COOKIE, role, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return Response.json({ role });
});
