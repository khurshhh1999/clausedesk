import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { baselineExtract } from '../lib/baseline';
import { checkCitations } from '../lib/citations';
import { OUTPUT_SCHEMA, toExtraction } from '../lib/extract';
import { extractionSchema, type CheckedFields, type Paragraph } from '../lib/domain';
import { MAX_BYTES, parsePdf } from '../lib/parse';
import { riskFlags } from '../lib/rules';
import { loadSample } from './helpers';

let clean: Paragraph[];
let risky: Paragraph[];

beforeAll(async () => {
  clean = await loadSample('acme-clean');
  risky = await loadSample('northwind-risky');
});

describe('PDF parsing', () => {
  it('numbers paragraphs uniquely and keeps page numbers', () => {
    expect(new Set(clean.map((p) => p.page))).toEqual(new Set([1, 2, 3]));
    expect(new Set(clean.map((p) => p.id)).size).toBe(clean.length);
    expect(clean[0].id).toBe('p-001');
  });

  it('rejects non-PDF and oversized input', async () => {
    await expect(parsePdf(new TextEncoder().encode('hello'))).rejects.toThrow('not a PDF');
    await expect(parsePdf(new Uint8Array(MAX_BYTES + 1))).rejects.toThrow('10 MB');
  });
});

describe('citation check', () => {
  it('keeps a verbatim quote from the cited paragraph', () => {
    expect(checkCitations(baselineExtract(clean), clean).vendor_name.status).toBe('found');
  });

  it('rejects a fabricated quote, a wrong paragraph and a change of case', () => {
    const fields = baselineExtract(clean);
    const original = fields.vendor_name.quote!;

    fields.vendor_name.quote = 'Entirely fabricated vendor clause';
    expect(checkCitations(fields, clean).vendor_name.status).toBe('unsupported');

    fields.vendor_name.quote = original;
    fields.vendor_name.paragraph_id = 'p-999';
    expect(checkCitations(fields, clean).vendor_name).toMatchObject({ status: 'unsupported', issue: 'The cited paragraph does not exist.' });

    fields.vendor_name.paragraph_id = baselineExtract(clean).vendor_name.paragraph_id;
    fields.vendor_name.quote = original.toUpperCase();
    expect(checkCitations(fields, clean).vendor_name.status).toBe('unsupported');
  });

  it('rejects a real quote attributed to the wrong paragraph', () => {
    const fields = baselineExtract(clean);
    fields.payment_terms.paragraph_id = fields.vendor_name.paragraph_id;
    expect(checkCitations(fields, clean).payment_terms.status).toBe('unsupported');
  });

  it('tolerates whitespace differences only, and never accepts an empty quote', () => {
    const fields = baselineExtract(clean);
    fields.vendor_name.quote = fields.vendor_name.quote!.replaceAll(' ', '\n  ');
    expect(checkCitations(fields, clean).vendor_name.status).toBe('found');

    fields.vendor_name.quote = '   ';
    expect(extractionSchema.safeParse(fields).success).toBe(false);
    expect(checkCitations(fields, clean).vendor_name.status).toBe('unsupported');
  });
});

describe('model output schema', () => {
  it('rejects extra keys and out-of-range values', () => {
    const output = baselineExtract(clean);
    expect(extractionSchema.safeParse({ ...output, create_vendor: {} }).success).toBe(false);
    output.payment_terms.value = -2;
    expect(extractionSchema.safeParse(output).success).toBe(false);
  });

  it('rejects a found field without a citation', () => {
    const output = baselineExtract(clean);
    output.governing_law.paragraph_id = null;
    expect(extractionSchema.safeParse(output).success).toBe(false);
  });

  it('round-trips through the all-string format sent to the model', () => {
    const output = baselineExtract(risky);
    const wire = Object.fromEntries(
      Object.entries(output).map(([key, field]) => {
        const value = field.value;
        const text =
          value === null ? '' : typeof value === 'object' ? `${value.currency} ${value.amount}` : String(value);
        return [key, { status: field.status, value: text, paragraph_id: field.paragraph_id ?? '', quote: field.quote ?? '' }];
      }),
    );
    expect(toExtraction(wire)).toEqual(output);

    const malformed = structuredClone(wire);
    malformed.payment_terms = { ...malformed.payment_terms, status: 'found', value: 'Net 90' };
    expect(() => toExtraction(malformed)).toThrow();
  });

  it('keeps the wire schema closed and free of union types', () => {
    expect(OUTPUT_SCHEMA.additionalProperties).toBe(false);
    expect(JSON.stringify(OUTPUT_SCHEMA)).not.toMatch(/anyOf|"type":\[/);
  });
});

describe('policy rules', () => {
  const flagIds = (fields: CheckedFields, edits = {}) => riskFlags(fields, edits).map((f) => f.id).sort();

  it('raises nothing on the clean contract and all five flags on the risky one', () => {
    expect(flagIds(checkCitations(baselineExtract(clean), clean))).toEqual([]);
    expect(flagIds(checkCitations(baselineExtract(risky), risky))).toEqual(['data', 'liability', 'payment', 'second_approver', 'short_renewal']);
  });

  it('treats an unsupported liability cap as missing', () => {
    const output = baselineExtract(clean);
    output.liability_cap.quote = 'Liability is capped at one dollar.';
    expect(flagIds(checkCitations(output, clean))).toContain('liability');
  });

  it('uses strict thresholds, and the second-approver rule only for USD', () => {
    const fields = checkCitations(baselineExtract(risky), risky);
    expect(flagIds(fields, { renewal_notice_days: 30, payment_terms: 60, total_contract_value: { amount: 250_000, currency: 'USD' } })).toEqual(['data', 'liability']);
    expect(flagIds(fields, { total_contract_value: { amount: 999_999, currency: 'EUR' } })).not.toContain('second_approver');
  });

  it('flags the expected risks for every demo contract, using its hand-written labels', async () => {
    const expected: Record<string, string[]> = {
      'acme-clean': [],
      'northwind-risky': ['data', 'liability', 'payment', 'second_approver', 'short_renewal'],
      'brightwell-saas': [],
      'copperfield-staffing': ['data', 'liability', 'short_renewal'],
      'harborline-logistics': ['payment', 'second_approver'],
      'meridian-facilities': ['unknown_renewal'],
    };
    const labels = JSON.parse(await readFile('evals/labels.json', 'utf8')) as { contracts: { id: string; fields: Record<string, unknown> }[] };

    for (const [id, flags] of Object.entries(expected)) {
      const label = labels.contracts.find((c) => c.id === id)!;
      const fields = Object.fromEntries(
        Object.entries(label.fields).map(([key, value]) => {
          const v = Array.isArray(value) ? value[0] : value;
          return [key, v === null ? { value: null, paragraph_id: null, quote: null, status: 'not_found' } : { value: v, paragraph_id: 'p-001', quote: 'x', status: 'found' }];
        }),
      ) as CheckedFields;
      expect(flagIds(fields), id).toEqual(flags);
    }
  });
});
