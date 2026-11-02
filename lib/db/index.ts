import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { clauseDeskDb?: Promise<Db> };

/**
 * Postgres via DATABASE_URL (Neon in production). Without it, local development falls back to an
 * embedded PGlite database in .local/db so the app runs with no setup.
 */
export function getDb(): Promise<Db> {
  globalForDb.clauseDeskDb ??= connect().catch((error) => {
    globalForDb.clauseDeskDb = undefined;
    throw error;
  });
  return globalForDb.clauseDeskDb;
}

async function connect(): Promise<Db> {
  if (process.env.DATABASE_URL) {
    return drizzle(new Pool({ connectionString: process.env.DATABASE_URL, max: 3 }), { schema });
  }
  if (process.env.VERCEL) throw new Error('DATABASE_URL must be set in deployed environments.');

  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const inMemory = process.env.TEST_DB === 'true';
  if (!inMemory) await mkdir(path.join(process.cwd(), '.local'), { recursive: true });

  const client = new PGlite(inMemory ? undefined : path.join(process.cwd(), '.local/db'));
  await client.exec(await readFile(path.join(process.cwd(), 'lib/db/bootstrap.sql'), 'utf8'));
  return drizzlePglite(client, { schema }) as unknown as Db;
}
