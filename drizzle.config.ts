import { loadEnvConfig } from '@next/env';
import { defineConfig } from 'drizzle-kit';

loadEnvConfig(process.cwd());

if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL to push the schema.');

export default defineConfig({
  schema: './lib/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL },
});
