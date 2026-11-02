import type { NextConfig } from 'next';

const config: NextConfig = {
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // Sample PDFs are read from disk at request time, so they must ship with the API functions.
  outputFileTracingIncludes: { '/api/**/*': ['./samples/**/*', './lib/db/bootstrap.sql'] },
};

export default config;
