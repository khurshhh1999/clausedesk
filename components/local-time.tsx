'use client';

export function LocalTime({ value, className }: { value: string | Date; className?: string }) {
  const date = new Date(value);
  return (
    <time dateTime={date.toISOString()} className={className} suppressHydrationWarning>
      {date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
    </time>
  );
}
