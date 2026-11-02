import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { AppHeader } from '@/components/app-header';
import { SessionProvider } from '@/components/session';
import { isDemoMode, modelProvider } from '@/lib/config';
import { getRole } from '@/lib/roles';
import './globals.css';

const sans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const mono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: { default: 'ClauseDesk', template: '%s · ClauseDesk' },
  description: 'Contract intake with cited extraction, policy flags and human approval.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const role = await getRole();

  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <SessionProvider
          initialRole={role}
          demoMode={isDemoMode()}
          model={modelProvider()?.model ?? null}
          largeUploads={Boolean(process.env.BLOB_READ_WRITE_TOKEN)}
        >
          <AppHeader />
          <main>{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}
