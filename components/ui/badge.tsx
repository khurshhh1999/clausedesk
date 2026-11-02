import { cva, type VariantProps } from 'class-variance-authority';
import type * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-line bg-canvas text-ink-soft',
        found: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        missing: 'border-stone-200 bg-stone-100 text-stone-600',
        unsupported: 'border-amber-300 bg-amber-50 text-amber-800',
        edited: 'border-sky-200 bg-sky-50 text-sky-800',
        risk: 'border-rose-200 bg-rose-50 text-rose-700',
        info: 'border-indigo-200 bg-indigo-50 text-indigo-700',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export function Badge({ className, tone, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
