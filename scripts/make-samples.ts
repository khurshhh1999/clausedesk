/**
 * Renders the fictional demo contracts in scripts/contracts/*.json to PDFs in /samples,
 * writes samples/demo-manifest.json, and syncs their hand-written labels into evals/labels.json.
 *
 *   npm run samples
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { z } from 'zod';

const root = path.resolve(import.meta.dirname, '..');

const contractSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  title: z.string(),
  parties: z.string(),
  summary: z.string(),
  pages: z.array(z.array(z.object({ heading: z.string(), body: z.string() }))).min(1),
  labels: z.record(z.string(), z.unknown()),
  notes: z.record(z.string(), z.string()),
});
type Contract = z.infer<typeof contractSchema>;

const PAGE = { width: 612, height: 792, margin: 56 };
const ink = rgb(0.13, 0.17, 0.24);
const muted = rgb(0.42, 0.47, 0.55);
const accent = rgb(0.12, 0.36, 0.33);

function wrap(text: string, font: PDFFont, size: number, maxWidth: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

async function render(contract: Contract) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`${contract.title} - ${contract.parties}`);
  pdf.setCreator('ClauseDesk sample generator');
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const width = PAGE.width - PAGE.margin * 2;

  contract.pages.forEach((clauses, index) => {
    const page: PDFPage = pdf.addPage([PAGE.width, PAGE.height]);
    let y = PAGE.height - PAGE.margin;

    if (index === 0) {
      page.drawText(contract.title, { x: PAGE.margin, y, size: 15, font: bold, color: ink });
      y -= 20;
      page.drawText(contract.parties, { x: PAGE.margin, y, size: 10, font: regular, color: muted });
      y -= 40;
    }

    for (const clause of clauses) {
      page.drawText(clause.heading.toUpperCase(), { x: PAGE.margin, y, size: 8.5, font: bold, color: accent });
      y -= 14;
      for (const line of wrap(clause.body, regular, 10, width)) {
        page.drawText(line, { x: PAGE.margin, y, size: 10, font: regular, color: ink });
        y -= 14;
      }
      y -= 14;
      if (y < PAGE.margin + 40) throw new Error(`${contract.id}: page ${index + 1} overflows; move a clause to another page.`);
    }

    page.drawText('FICTIONAL DEMONSTRATION CONTRACT', { x: PAGE.margin, y: 32, size: 7.5, font: regular, color: muted });
    const folio = `${index + 1} / ${contract.pages.length}`;
    page.drawText(folio, { x: PAGE.width - PAGE.margin - regular.widthOfTextAtSize(folio, 7.5), y: 32, size: 7.5, font: regular, color: muted });
  });

  return pdf.save();
}

const files = (await readdir(path.join(root, 'scripts/contracts'))).filter((f) => f.endsWith('.json')).sort();
const contracts = await Promise.all(
  files.map(async (file) => contractSchema.parse(JSON.parse(await readFile(path.join(root, 'scripts/contracts', file), 'utf8')))),
);

const order = ['acme-clean', 'northwind-risky'];
contracts.sort((a, b) => {
  const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
  return rank(a.id) - rank(b.id) || a.id.localeCompare(b.id);
});

for (const contract of contracts) {
  await writeFile(path.join(root, 'samples', `${contract.id}.pdf`), await render(contract));
  console.log(`samples/${contract.id}.pdf`);
}

const manifest = contracts.map((c) => ({ id: c.id, file: `${c.id}.pdf`, name: c.parties.split(' / ')[0], summary: c.summary }));
await writeFile(path.join(root, 'samples/demo-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const labelsPath = path.join(root, 'evals/labels.json');
const labels = JSON.parse(await readFile(labelsPath, 'utf8'));
const demoIds = new Set(contracts.map((c) => c.id));
labels.contracts = [
  ...labels.contracts.filter((c: { id: string }) => !demoIds.has(c.id)),
  ...contracts.map((c) => ({ id: c.id, source: 'demo', fields: c.labels, notes: c.notes })),
];
await writeFile(labelsPath, `${JSON.stringify(labels, null, 2)}\n`);
console.log(`Updated ${path.relative(root, labelsPath)} with ${contracts.length} demo contracts`);
