import { getDocumentProxy } from 'unpdf';
import type { Paragraph } from './domain';

export const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PAGES = 150;
const MIN_TEXT_CHARS = 80;
const MAX_TEXT_CHARS = 450_000;

export class ParseError extends Error {}

/**
 * Extracts text from a PDF and splits it into numbered paragraphs (p-001, p-002, ...),
 * keeping the page number of each. A vertical gap larger than ~1.5 lines starts a new paragraph.
 */
export async function parsePdf(data: Uint8Array): Promise<Paragraph[]> {
  if (data.length > MAX_BYTES) throw new ParseError('PDF exceeds 10 MB.');
  if (new TextDecoder().decode(data.slice(0, 5)) !== '%PDF-') throw new ParseError('File is not a PDF.');

  const pdf = await getDocumentProxy(data);
  try {
    if (pdf.numPages > MAX_PAGES) throw new ParseError(`PDFs are limited to ${MAX_PAGES} pages.`);

    const paragraphs: Paragraph[] = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      let buffer = '';
      let lastY: number | undefined;
      let lastHeight = 10;

      const flush = () => {
        const text = buffer.replace(/\s+/g, ' ').trim();
        if (text) paragraphs.push({ id: `p-${String(paragraphs.length + 1).padStart(3, '0')}`, page, text });
        buffer = '';
      };

      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y = item.transform[5];
        if (lastY !== undefined && Math.abs(y - lastY) > Math.max(lastHeight * 1.55, 16)) flush();
        buffer += `${item.str} `;
        lastY = y;
        lastHeight = item.height || 10;
      }
      flush();
    }

    const totalChars = paragraphs.reduce((sum, p) => sum + p.text.length, 0);
    if (totalChars < MIN_TEXT_CHARS) throw new ParseError('No readable text found. Scanned PDFs need OCR first.');
    if (totalChars > MAX_TEXT_CHARS) throw new ParseError('Contract is too long for single-pass extraction.');
    return paragraphs;
  } finally {
    await pdf.cleanup();
  }
}
