import type { NextConfig } from 'next';

const securityHeaders = [
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
];

const config: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // Sample PDFs are read from disk at request time, so they must ship with the API functions.
  outputFileTracingIncludes: { '/api/**/*': ['./samples/**/*', './lib/db/bootstrap.sql'] },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default config;
