'use client';

import { useEffect, useRef } from 'react';
import { normalizeWhitespace } from '@/lib/citations';
import type { Paragraph } from '@/lib/domain';
import { cn } from '@/lib/utils';

export type Focus = { paragraphId: string; quote: string | null } | null;

export function DocumentPane({ name, paragraphs, focus }: { name: string; paragraphs: Paragraph[]; focus: Focus }) {
  const pane = useRef<HTMLElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pages = new Set(paragraphs.map((p) => p.page)).size;

  useEffect(() => {
    const container = scroller.current;
    if (!focus || !container) return;
    const element = container.querySelector<HTMLElement>(`[data-paragraph="${focus.paragraphId}"]`);
    if (!element) return;
    const top = element.offsetTop - container.clientHeight / 2 + element.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });

    // On narrow screens the pane sits above the terms, so bring it into view too.
    const rect = pane.current?.getBoundingClientRect();
    if (rect && (rect.top < 0 || rect.bottom > window.innerHeight)) {
      pane.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [focus]);

  return (
    <section ref={pane} className="flex h-full min-h-0 scroll-mt-20 flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <span className="truncate text-sm font-medium">{name}</span>
        <span className="shrink-0 font-mono text-[11px] text-ink-faint">
          {pages} {pages === 1 ? 'page' : 'pages'} · {paragraphs.length} paragraphs
        </span>
      </div>

      <div ref={scroller} className="scrollbar-thin relative min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-4">
        {paragraphs.map((paragraph, index) => {
          const active = focus?.paragraphId === paragraph.id;
          return (
            <div key={paragraph.id}>
              {(index === 0 || paragraphs[index - 1].page !== paragraph.page) && (
                <div className="my-3 flex items-center gap-3 font-mono text-[10px] tracking-widest text-ink-faint uppercase">
                  <span className="h-px flex-1 bg-line" />
                  Page {paragraph.page}
                  <span className="h-px flex-1 bg-line" />
                </div>
              )}
              <div
                data-paragraph={paragraph.id}
                className={cn(
                  'flex gap-3 rounded-md border-l-2 border-transparent px-3 py-2 transition-colors duration-300',
                  active && 'border-accent bg-accent-soft',
                )}
              >
                <span className={cn('w-10 shrink-0 pt-0.5 font-mono text-[10px] text-ink-faint', active && 'text-accent')}>
                  {paragraph.id}
                </span>
                <p className="font-serif text-[14.5px] leading-[1.7] text-ink/90">
                  {active && focus.quote ? <Highlighted text={paragraph.text} quote={focus.quote} /> : paragraph.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Highlighted({ text, quote }: { text: string; quote: string }) {
  const needle = normalizeWhitespace(quote);
  const start = text.indexOf(needle);
  if (!needle || start === -1) return text;
  return (
    <>
      {text.slice(0, start)}
      <mark className="rounded-sm bg-amber-200/70 px-0.5 text-ink">{text.slice(start, start + needle.length)}</mark>
      {text.slice(start + needle.length)}
    </>
  );
}
