import { defineConfig } from 'vitest/config';

// Unit + contract suite ONLY — sem globalSetup, não baixa/sobe PocketBase.
// Rápida e hermetic: roda em qualquer máquina com Node >= 18.
// Uso: npm run test:unit
export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/contract/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
