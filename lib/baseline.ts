import { extractionSchema, fieldKeys, type Extraction, type FieldKey, type FieldValue, type Paragraph } from './domain';

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';

type Pattern = { key: FieldKey; regex: RegExp; value: (match: RegExpMatchArray) => FieldValue };

/**
 * Pattern rules written for the two fictional demo contracts. They let the app run without a
 * model key and give the eval a floor to compare against. They are never presented as model output.
 */
const patterns: Pattern[] = [
  { key: 'vendor_name', regex: /(?:and )([^.;]+?) \(Supplier\)/, value: (m) => m[1].trim() },
  {
    key: 'effective_date',
    regex: new RegExp(`Effective Date is (${MONTHS}) (\\d{1,2}), (\\d{4})`),
    value: (m) => new Date(`${m[1]} ${m[2]}, ${m[3]} UTC`).toISOString().slice(0, 10),
  },
  { key: 'initial_term', regex: /initial term is (\d+ months)/i, value: (m) => m[1] },
  { key: 'auto_renewal', regex: /does not automatically renew/i, value: () => false },
  { key: 'auto_renewal', regex: /automatically renews/i, value: () => true },
  { key: 'renewal_notice_days', regex: /notice at least (\d+) days before/i, value: (m) => Number(m[1]) },
  { key: 'payment_terms', regex: /\(net (\d+)\)/i, value: (m) => Number(m[1]) },
  {
    key: 'total_contract_value',
    regex: /total contract value for the initial term is ([A-Z]{3}) ([\d,]+(?:\.\d+)?)/,
    value: (m) => ({ currency: m[1], amount: Number(m[2].replaceAll(',', '')) }),
  },
  {
    key: 'termination_for_convenience',
    regex: /Either party may terminate this agreement for convenience on 30 days' written notice/,
    value: () => true,
  },
  {
    key: 'liability_cap',
    regex: /aggregate liability under this agreement is capped at USD ([\d,]+), except for fraud or willful misconduct/,
    value: (m) => `USD ${m[1]}; except fraud or willful misconduct`,
  },
  { key: 'governing_law', regex: /governed by the laws of the State of ([^,.]+)/, value: (m) => m[1] },
  {
    key: 'data_protection',
    regex: /This clause constitutes the parties' data processing agreement \(DPA\)/,
    value: () => true,
  },
];

export function baselineExtract(paragraphs: Paragraph[]): Extraction {
  const result = Object.fromEntries(
    fieldKeys.map((key) => [key, { value: null, paragraph_id: null, quote: null, status: 'not_found' }]),
  ) as Extraction;

  for (const paragraph of paragraphs) {
    for (const { key, regex, value } of patterns) {
      if (result[key].status === 'found') continue;
      const match = paragraph.text.match(regex);
      if (match) {
        Object.assign(result[key], { value: value(match), paragraph_id: paragraph.id, quote: match[0], status: 'found' });
      }
    }
  }

  return extractionSchema.parse(result);
}
