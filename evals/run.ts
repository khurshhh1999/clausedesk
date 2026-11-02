/**
 * Scores extraction against hand-written labels in evals/labels.json.
 *
 *   npm run eval              uses the configured model (OPENROUTER_API_KEY or ANTHROPIC_API_KEY)
 *   npm run eval -- --baseline  uses the offline pattern extractor instead
 *
 * A present field is correct only if the value matches the label AND its citation passed the
 * verbatim check. A missing field is correct only if the extractor said not_found.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import nextEnv from '@next/env';
import { z } from 'zod';

nextEnv.loadEnvConfig(process.cwd());
process.env.TEST_DB = 'true';
process.env.DATABASE_URL = '';

const { parsePdf } = await import('../lib/parse');
const { baselineExtract } = await import('../lib/baseline');
const { checkCitations, normalizeWhitespace } = await import('../lib/citations');
const { extractFields } = await import('../lib/extract');
const { modelProvider } = await import('../lib/config');
const { fieldKeys } = await import('../lib/domain');
type FieldValue = import('../lib/domain').FieldValue;
type FieldKey = import('../lib/domain').FieldKey;

const useBaseline = process.argv.includes('--baseline');
const provider = modelProvider();
if (!useBaseline && !provider) {
  console.error('No model key configured. Set OPENROUTER_API_KEY or ANTHROPIC_API_KEY, or run with --baseline.');
  process.exit(1);
}
const mode = useBaseline ? 'baseline' : provider!.model;

const labelValue = z.union([
  z.string(),
  z.array(z.string()).min(1),
  z.number(),
  z.boolean(),
  z.object({ amount: z.number(), currency: z.string() }),
  z.null(),
]);
const labelsFile = z.object({
  description: z.string(),
  contracts: z.array(
    z.object({
      id: z.string(),
      source: z.enum(['cuad', 'demo']),
      fields: z.record(z.enum(fieldKeys), labelValue),
      notes: z.record(z.string(), z.string()),
    }),
  ),
});
type Label = z.infer<typeof labelValue>;

const labels = labelsFile.parse(JSON.parse(await readFile('evals/labels.json', 'utf8')));

const simplify = (text: string) =>
  normalizeWhitespace(text)
    .toLowerCase()
    .replace(/[.,;:'"’()]/g, '')
    .replace(/^the /, '');

/** Text labels list accepted phrasings; a match in either direction counts ("USD 48,000" vs "USD 48,000 aggregate"). */
function matches(actual: FieldValue, expected: Exclude<Label, null>) {
  if (Array.isArray(expected) || typeof expected === 'string') {
    if (typeof actual !== 'string') return false;
    const a = simplify(actual);
    return [expected].flat().some((option) => {
      const e = simplify(option);
      return a === e || a.includes(e) || e.includes(a);
    });
  }
  if (typeof expected === 'object') {
    return typeof actual === 'object' && actual !== null && actual.amount === expected.amount && actual.currency === expected.currency;
  }
  return actual === expected;
}

type Tally = { correct: number; total: number };
const tally = (): Tally => ({ correct: 0, total: 0 });
const present = tally();
const missing = tally();
const byField = Object.fromEntries(fieldKeys.map((k) => [k, tally()])) as Record<FieldKey, Tally>;
let citationsRejected = 0;
let citationsChecked = 0;
const results = [];

for (const label of labels.contracts) {
  const pdf = new Uint8Array(await readFile(`samples/${label.id}.pdf`));
  const paragraphs = await parsePdf(pdf);
  const started = Date.now();
  const raw = useBaseline ? baselineExtract(paragraphs) : (await extractFields(paragraphs, 'Reviewer')).fields;
  const checked = checkCitations(raw, paragraphs);

  const fields = fieldKeys.map((key) => {
    const expected = label.fields[key] ?? null;
    const actual = checked[key];
    if (raw[key].status === 'found') citationsChecked++;
    if (actual.status === 'unsupported') citationsRejected++;

    const correct = expected === null ? actual.status === 'not_found' : actual.status === 'found' && matches(actual.value, expected);
    const bucket = expected === null ? missing : present;
    bucket.total++;
    bucket.correct += Number(correct);
    byField[key].total++;
    byField[key].correct += Number(correct);
    return { key, expected, actual, correct };
  });

  const score = fields.filter((f) => f.correct).length;
  console.log(`${label.id.padEnd(24)} ${score}/${fieldKeys.length}  ${((Date.now() - started) / 1000).toFixed(1)}s`);
  for (const f of fields.filter((f) => !f.correct)) {
    console.log(`    ✗ ${f.key}: expected ${JSON.stringify(f.expected)}, got ${f.actual.status} ${JSON.stringify(f.actual.value)}`);
  }
  results.push({ id: label.id, source: label.source, sha256: createHash('sha256').update(pdf).digest('hex'), fields });
}

/** Truncated, never rounded up. */
const pct = ({ correct, total }: Tally) => (total ? Math.floor((correct / total) * 1000) / 10 : null);
const overall = { correct: present.correct + missing.correct, total: present.total + missing.total };

const metrics = {
  contracts: labels.contracts.length,
  fieldAccuracy: { ...overall, pct: pct(overall) },
  presentFieldAccuracy: { ...present, pct: pct(present) },
  notFoundRate: { ...missing, pct: pct(missing) },
  citationsRejected: { rejected: citationsRejected, of: citationsChecked },
};

const report = {
  mode,
  runAt: new Date().toISOString(),
  metrics,
  byField: Object.fromEntries(fieldKeys.map((k) => [k, { ...byField[k], pct: pct(byField[k]) }])),
  results,
};

await mkdir('evals/results', { recursive: true });
const outFile = `evals/results/${mode.replace(/[^a-z0-9.-]+/gi, '_')}.json`;
await writeFile(outFile, `${JSON.stringify(report, null, 2)}\n`);

console.log(`\n${mode}`);
console.log(`  Field accuracy         ${metrics.fieldAccuracy.correct}/${metrics.fieldAccuracy.total} (${metrics.fieldAccuracy.pct}%)`);
console.log(`  Present fields correct ${present.correct}/${present.total} (${metrics.presentFieldAccuracy.pct}%)`);
console.log(`  Missing -> not_found   ${missing.correct}/${missing.total} (${metrics.notFoundRate.pct}%)`);
console.log(`  Citations rejected     ${citationsRejected} of ${citationsChecked} found fields`);
console.log(`  Saved ${outFile}`);
process.exit(0);
