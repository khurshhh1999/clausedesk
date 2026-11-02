'use client';

import { Eye, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { roles, type Role } from '@/lib/domain';
import { cn } from '@/lib/utils';
import { useSession } from './session';

const NAV = [
  { href: '/', label: 'Contracts', match: (path: string) => path === '/' || path.startsWith('/contracts') },
  { href: '/audit', label: 'Audit log', match: (path: string) => path.startsWith('/audit') },
];

export function AppHeader() {
  const pathname = usePathname();
  const { role, setRole, switching, demoMode, model } = useSession();

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-5 px-4 sm:gap-8 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Logo />
          ClauseDesk
        </Link>

        <nav className="flex h-full items-stretch gap-6 text-sm">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center whitespace-nowrap border-b-2 border-transparent text-ink-soft transition-colors hover:text-ink',
                item.match(pathname) && 'border-ink text-ink',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <span className="hidden items-center gap-1.5 text-xs text-ink-faint sm:flex" title={model ?? undefined}>
            <span className={cn('size-1.5 rounded-full', demoMode ? 'bg-amber-500' : 'bg-emerald-500')} />
            {demoMode ? 'Demo extractor' : 'Claude connected'}
          </span>

          <div role="radiogroup" aria-label="Role" className="flex rounded-lg border border-line bg-canvas p-0.5 text-xs">
            {roles.map((option: Role) => (
              <button
                key={option}
                role="radio"
                aria-checked={role === option}
                disabled={switching}
                onClick={() => role !== option && setRole(option)}
                className={cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1 font-medium text-ink-soft transition-colors',
                  role === option && 'bg-surface text-ink shadow-sm',
                )}
              >
                {option === 'Reviewer' ? <ShieldCheck className="size-3.5" /> : <Eye className="size-3.5" />}
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" className="fill-accent" />
      <path d="M8 8h8M8 12h5M8 16h8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
