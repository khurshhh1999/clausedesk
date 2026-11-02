import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { get } from '@vercel/blob';
import { z } from 'zod';
import { HttpError } from '@/lib/errors';
import { rateLimit, readJson, route } from '@/lib/http';
import { MAX_BYTES, ParseError, parsePdf } from '@/lib/parse';
import { requireReviewer } from '@/lib/roles';
import { sampleIds, samples } from '@/lib/samples';
import { createContract, listContracts } from '@/lib/store';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BLOB_PATH = /^intake\/[a-zA-Z0-9_-]+\.pdf$/;

const jsonSource = z.union([
  z.object({ sampleId: z.enum(sampleIds) }).strict(),
  z.object({ blobPath: z.string().regex(BLOB_PATH), name: z.string().trim().min(1).max(200) }).strict(),
]);

export const GET = route(async () => Response.json(await listContracts()));

/** Accepts a PDF (multipart, or a private Blob path for files over the function body limit) or a sample ID. */
export const POST = route(async (request, role) => {
  requireReviewer(role);
  rateLimit(request, 'upload');

  const { bytes, name, sampleId } = request.headers.get('content-type')?.includes('multipart/form-data')
    ? await readMultipart(request)
    : await readJsonSource(request);

  let parsed;
  try {
    parsed = await parsePdf(bytes);
  } catch (error) {
    throw new HttpError(422, error instanceof ParseError ? error.message : 'This PDF could not be read.');
  }

  const id = await createContract(name, sampleId, parsed, role);
  return Response.json({ id, paragraphs: parsed.length }, { status: 201 });
});

async function readMultipart(request: Request) {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BYTES + 10_000) throw new HttpError(413, 'PDF exceeds 10 MB.');
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || [...form.keys()].some((key) => key !== 'file')) {
    throw new HttpError(400, 'Send exactly one PDF in the "file" field.');
  }
  z.object({ size: z.number().min(1).max(MAX_BYTES, 'PDF exceeds 10 MB.'), name: z.string().min(1).max(200) }).parse(file);
  return { bytes: new Uint8Array(await file.arrayBuffer()), name: file.name, sampleId: null };
}

async function readJsonSource(request: Request) {
  const source = jsonSource.parse(await readJson(request));

  if ('sampleId' in source) {
    const sample = samples.find((s) => s.id === source.sampleId)!;
    const bytes = new Uint8Array(await readFile(path.join(process.cwd(), 'samples', sample.file)));
    return { bytes, name: sample.file, sampleId: sample.id };
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new HttpError(503, 'Large uploads are not configured.');
  const blob = await get(source.blobPath, { access: 'private' });
  if (!blob || blob.statusCode !== 200) throw new HttpError(404, 'Uploaded PDF not found.');
  const body = await new Response(blob.stream).arrayBuffer();
  if (body.byteLength > MAX_BYTES) throw new HttpError(413, 'PDF exceeds 10 MB.');
  return { bytes: new Uint8Array(body), name: source.name, sampleId: null };
}
