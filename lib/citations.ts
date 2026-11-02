import { fieldKeys, type CheckedField, type CheckedFields, type Extraction, type Paragraph } from './domain';

/** Collapses runs of whitespace. Deliberately nothing else: case, punctuation and wording must match exactly. */
export function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Verifies every "found" field against the source document. A field is only kept as found
 * when its quote appears verbatim in the paragraph it cites; otherwise it becomes "unsupported".
 */
export function checkCitations(fields: Extraction, paragraphs: Paragraph[]): CheckedFields {
  const paragraphsById = new Map(paragraphs.map((p) => [p.id, p]));

  const checked = fieldKeys.map((key): [string, CheckedField] => {
    const field = fields[key];
    if (field.status === 'not_found') return [key, { ...field }];

    const paragraph = field.paragraph_id ? paragraphsById.get(field.paragraph_id) : undefined;
    if (!paragraph) {
      return [key, { ...field, status: 'unsupported', issue: 'The cited paragraph does not exist.' }];
    }

    const quote = normalizeWhitespace(field.quote ?? '');
    if (!quote || !normalizeWhitespace(paragraph.text).includes(quote)) {
      return [key, { ...field, status: 'unsupported', issue: `The quote does not appear verbatim in ${paragraph.id}.` }];
    }

    return [key, { ...field }];
  });

  return Object.fromEntries(checked) as CheckedFields;
}
