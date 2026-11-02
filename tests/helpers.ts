import { readFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { baselineExtract } from '../lib/baseline';
import { checkCitations } from '../lib/citations';
import { getDb } from '../lib/db';
import { contracts, extractions } from '../lib/db/schema';
import type { Paragraph } from '../lib/domain';
import { parsePdf } from '../lib/parse';
import { createContract } from '../lib/store';

export async function loadSample(id: string) {
  return parsePdf(new Uint8Array(await readFile(`samples/${id}.pdf`)));
}

/** Creates a contract that has been extracted with the offline baseline and is awaiting review. */
export async function readyContract(paragraphs: Paragraph[]) {
  const id = await createContract('test.pdf', null, paragraphs, 'Reviewer');
  const db = await getDb();
  await db.insert(extractions).values({
    id: crypto.randomUUID(),
    contractId: id,
    fields: checkCitations(baselineExtract(paragraphs), paragraphs),
    mode: 'test',
  });
  await db.update(contracts).set({ status: 'ready' }).where(eq(contracts.id, id));
  return id;
}

export function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

export const params = (id: string) => ({ params: Promise.resolve({ id }) });
