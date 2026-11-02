import { checkCitations } from '@/lib/citations';
import { idSchema } from '@/lib/domain';
import { HttpError } from '@/lib/errors';
import { extractFields } from '@/lib/extract';
import { rateLimit, route } from '@/lib/http';
import { requireReviewer } from '@/lib/roles';
import { claimForExtraction, getContract, releaseFailedExtraction, saveExtraction } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Context = { params: Promise<{ id: string }> };

export type ExtractStage = 'Parsing' | 'Extracting' | 'Checking citations' | 'Flags ready';
export type ExtractEvent = { stage: ExtractStage } | { error: string };

/** Streams progress as newline-delimited JSON while extraction runs. */
export const POST = route<Context>(async (request, role, { params }) => {
  requireReviewer(role);
  const id = idSchema.parse((await params).id);
  const contract = await getContract(id);
  rateLimit(request, 'extract');
  await claimForExtraction(id);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ExtractEvent) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // Client disconnected; keep going so the result is still saved.
        }
      };

      try {
        send({ stage: 'Extracting' });
        const result = await extractFields(contract.paragraphs, role, id);
        send({ stage: 'Checking citations' });
        const fields = checkCitations(result.fields, contract.paragraphs);
        await saveExtraction(id, role, { ...result, fields });
        send({ stage: 'Flags ready' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Extraction failed:', message);
        await releaseFailedExtraction(id, role, message);
        send({ error: error instanceof HttpError ? error.message : 'Extraction failed. Please try again.' });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  });
});
