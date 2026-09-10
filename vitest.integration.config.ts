import { defineConfig } from 'vitest/config';

// Integration suite: requires a real PocketBase server binary.
// tests/integration/setup.ts (globalSetup) downloads (or reuses from cache) the
// binary, boots an ephemeral instance on an OS-assigned port with a unique
// superuser identity, and writes tests/integration/.server.json for the tests.
//
// Run with: npm run test:integration
// Pin a version with: POCKETBASE_VERSION=v0.39.11 npm run test:integration
// Custom binary cache dir: PB_BIN_DIR=/path npm run test:integration
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 180000,
    globalSetup: ['tests/integration/setup.ts'],
    pool: 'forks', // integration tests share one server; avoid worker threads + file locks
    fileParallelism: false,
  },
});
