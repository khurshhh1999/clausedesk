'use client';

import { Check, LoaderCircle, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExtractEvent, ExtractStage } from '@/app/api/contracts/[id]/extract/route';
import { cn } from '@/lib/utils';
import { useSession } from '../session';
import { Button } from '../ui/button';

const STAGES: ExtractStage[] = ['Parsing', 'Extracting', 'Checking citations', 'Flags ready'];

export function ExtractionProgress({ contractId, status, autoStart }: { contractId: string; status: string; autoStart: boolean }) {
  const router = useRouter();
  const { role, demoMode } = useSession();
  const [stage, setStage] = useState<ExtractStage>('Parsing');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const started = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError('');
    setStage('Extracting');
    try {
      const response = await fetch(`/api/contracts/${contractId}/extract`, { method: 'POST' });
      if (!response.ok || !response.body) throw new Error((await response.json()).error ?? 'Extraction failed.');

      const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as ExtractEvent;
          if ('error' in event) throw new Error(event.error);
          setStage(event.stage);
          if (event.stage === 'Flags ready') finished = true;
        }
      }
      if (!finished) throw new Error('The connection closed before extraction finished. Reload to check the result.');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Extraction failed.');
      setRunning(false);
    }
  }, [contractId, router]);

  useEffect(() => {
    if (autoStart && status === 'parsed' && role === 'Reviewer' && !started.current) {
      started.current = true;
      window.history.replaceState(null, '', `/contracts/${contractId}`);
      run();
    }
  }, [autoStart, status, role, contractId, run]);

  const current = STAGES.indexOf(stage);
  const inFlight = running || status === 'extracting';

  return (
    <section className="mx-auto max-w-xl rounded-xl border border-line bg-surface p-6 shadow-sm">
      <h2 className="text-base font-semibold">{inFlight ? 'Reading the contract' : 'Ready to extract'}</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {demoMode
          ? 'Demo mode: a pattern-based extractor stands in for Claude. It only knows the two original demo contracts.'
          : 'Claude reads every paragraph and returns each term with the paragraph and exact quote it relied on.'}
      </p>

      <ol className="mt-5 space-y-2.5">
        {STAGES.map((label, index) => {
          const done = index < current || (index === 0 && inFlight) || (index === current && label === 'Flags ready');
          const active = inFlight && index === current && !done;
          return (
            <li key={label} className={cn('flex items-center gap-3 text-sm', !done && !active && 'text-ink-faint')}>
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full border border-line text-[10px]',
                  done && 'border-accent bg-accent text-white',
                  active && 'border-accent text-accent',
                )}
              >
                {done ? <Check className="size-3" /> : active ? <LoaderCircle className="size-3 animate-spin" /> : index + 1}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {error && (
        <p role="alert" className="mt-5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {!inFlight && (
        <Button className="mt-6" variant="accent" disabled={role !== 'Reviewer'} onClick={run}>
          <Sparkles />
          Extract terms
        </Button>
      )}
      {status === 'extracting' && !running && (
        <p className="mt-5 text-sm text-ink-soft">Extraction is already running. Reload in a moment to see the results.</p>
      )}
      {role !== 'Reviewer' && <p className="mt-3 text-xs text-ink-faint">Switch to Reviewer to run extraction.</p>}
    </section>
  );
}
