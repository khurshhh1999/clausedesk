'use client';

import { upload } from '@vercel/blob/client';
import { ArrowRight, FileUp, LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import type { Sample } from '@/lib/samples';
import { cn } from '@/lib/utils';
import { useSession } from './session';
import { Button } from './ui/button';

const MAX_BYTES = 10 * 1024 * 1024;
/** Vercel functions accept ~4.5 MB request bodies; larger files go through Blob storage. */
const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024;

export function useStartContract() {
  const router = useRouter();
  const { largeUploads } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function start(source: { file: File } | { sampleId: string }) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/contracts', await buildRequest(source, largeUploads));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      router.push(`/contracts/${data.id}?extract=1`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
      setBusy(false);
    }
  }

  return { start, busy, error };
}

async function buildRequest(source: { file: File } | { sampleId: string }, largeUploads: boolean): Promise<RequestInit> {
  if ('sampleId' in source) {
    return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(source) };
  }

  const { file } = source;
  if (file.type && file.type !== 'application/pdf') throw new Error('Choose a PDF file.');
  if (file.size > MAX_BYTES) throw new Error('Choose a PDF under 10 MB.');

  if (file.size > DIRECT_UPLOAD_LIMIT) {
    if (!largeUploads) throw new Error('PDFs over 4 MB need Blob storage, which is not configured here.');
    const blob = await upload(`intake/${crypto.randomUUID()}.pdf`, file, { access: 'private', handleUploadUrl: '/api/upload' });
    return {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blobPath: blob.pathname, name: file.name }),
    };
  }

  const form = new FormData();
  form.set('file', file);
  return { method: 'POST', body: form };
}

export function Intake({ samples }: { samples: Sample[] }) {
  const { role } = useSession();
  const { start, busy, error } = useStartContract();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [sampleId, setSampleId] = useState(samples[1]?.id ?? samples[0].id);
  const canUpload = role === 'Reviewer' && !busy;
  const groups = Object.groupBy(samples, (s) => s.group);
  const selected = samples.find((s) => s.id === sampleId);

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (canUpload) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (canUpload && file) start({ file });
        }}
        className={cn(
          'flex flex-col items-center px-6 py-14 text-center transition-colors',
          dragging && 'bg-accent-soft',
        )}
      >
        <div className="mb-5 grid size-12 place-items-center rounded-xl border border-line bg-canvas text-ink-soft">
          {busy ? <LoaderCircle className="size-5 animate-spin" /> : <FileUp className="size-5" />}
        </div>
        <h2 className="text-base font-medium">{busy ? 'Parsing contract…' : 'Drop a vendor contract here'}</h2>
        <p className="mt-1.5 text-sm text-ink-soft">PDF with selectable text, up to 10 MB.</p>
        <Button className="mt-5" disabled={!canUpload} onClick={() => input.current?.click()}>
          Choose PDF
        </Button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-label="Upload contract PDF"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) start({ file });
            e.target.value = '';
          }}
        />
      </div>

      <div className="flex flex-col gap-3 border-t border-line bg-canvas/60 px-5 py-4 sm:flex-row sm:items-center">
        <label htmlFor="sample" className="shrink-0 text-sm font-medium">
          Or try a sample
        </label>
        <div className="min-w-0 flex-1">
          <select
            id="sample"
            value={sampleId}
            disabled={busy}
            onChange={(e) => setSampleId(e.target.value)}
            className="h-9 w-full rounded-md border border-line bg-surface px-2.5 text-sm"
          >
            {Object.entries(groups).map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items!.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <Button variant="outline" disabled={!canUpload} onClick={() => start({ sampleId })}>
          Open sample
          <ArrowRight />
        </Button>
      </div>
      {selected && <p className="border-t border-line px-5 py-2.5 text-xs text-ink-faint">{selected.description}</p>}

      {(error || role === 'Viewer') && (
        <p role={error ? 'alert' : undefined} className={cn('border-t px-5 py-3 text-sm', error ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-line text-ink-soft')}>
          {error || 'You are viewing as a Viewer. Switch to Reviewer in the header to add contracts.'}
        </p>
      )}
    </section>
  );
}

export function TrySampleButton({ sampleId, label }: { sampleId: string; label: string }) {
  const { role } = useSession();
  const { start, busy, error } = useStartContract();
  return (
    <div className="flex flex-col items-center gap-2">
      <Button variant="accent" disabled={busy || role !== 'Reviewer'} onClick={() => start({ sampleId })}>
        {busy && <LoaderCircle className="animate-spin" />}
        {label}
      </Button>
      {error && <p className="text-sm text-rose-700">{error}</p>}
    </div>
  );
}
