import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: { TEST_DB: 'true', DEMO_MODE: 'true', DATABASE_URL: '' },
  },
});
