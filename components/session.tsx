'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useState, useTransition } from 'react';
import type { Role } from '@/lib/domain';

type Session = {
  role: Role;
  demoMode: boolean;
  model: string | null;
  largeUploads: boolean;
  switching: boolean;
  setRole: (role: Role) => Promise<void>;
};

const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}

export function SessionProvider({
  initialRole,
  demoMode,
  model,
  largeUploads,
  children,
}: {
  initialRole: Role;
  demoMode: boolean;
  model: string | null;
  largeUploads: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [role, setRoleState] = useState(initialRole);
  const [switching, startTransition] = useTransition();

  async function setRole(next: Role) {
    const response = await fetch('/api/role', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: next }),
    });
    if (!response.ok) throw new Error('Could not switch role.');
    startTransition(() => {
      setRoleState(next);
      router.refresh();
    });
  }

  return (
    <SessionContext.Provider value={{ role, demoMode, model, largeUploads, switching, setRole }}>
      {children}
    </SessionContext.Provider>
  );
}
