import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { z } from 'zod';
import { HttpError } from '@/lib/errors';
import { rateLimit, readJson, route } from '@/lib/http';
import { MAX_BYTES } from '@/lib/parse';
import { requireReviewer } from '@/lib/roles';

const body = z
  .object({ type: z.enum(['blob.generate-client-token', 'blob.upload-completed']), payload: z.unknown() })
  .strict();

/** Issues short-lived tokens so the browser can upload PDFs larger than the function body limit to private Blob storage. */
export const POST = route(async (request, role) => {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, 'Large uploads are not configured.');
  const parsed = body.parse(await readJson(request)) as HandleUploadBody;

  const result = await handleUpload({
    body: parsed,
    request,
    // Upload-completed callbacks come from Vercel, not the browser, and are verified by signature.
    onBeforeGenerateToken: async (pathname) => {
      requireReviewer(role);
      rateLimit(request, 'upload-token');
      z.string().regex(/^intake\/[a-zA-Z0-9_-]+\.pdf$/).parse(pathname);
      return {
        allowedContentTypes: ['application/pdf'],
        maximumSizeInBytes: MAX_BYTES,
        addRandomSuffix: false,
        validUntil: Date.now() + 10 * 60 * 1000,
      };
    },
    onUploadCompleted: async () => {},
  });
  return Response.json(result);
});
