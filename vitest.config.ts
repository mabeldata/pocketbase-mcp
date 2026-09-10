import { defineConfig } from 'vitest/config';

// Full suite: unit + contract + integration.
//
// A suíte de integração usa o globalSetup (tests/integration/setup.ts), que
// baixa/reaproveita o binário do PocketBase (padrão v0.40.3 — matriz de compat
// via POCKETBASE_VERSION), sobe instância ephemera em porta asignada pelo SO e
// grava tests/integration/.server.json. Se a infra não estiver disponível
// (sem rede, OS não suportado), os testes de integração PULAM com mensagem
// clara — unit/contract continuam rodando normalmente.
//
// fileParallelism=false + pool=forks: os testes de integração compartilham um
// único server; execução serial evita corrida nas fixtures.
export default defineConfig({
  test: {
    include: [
      'tests/unit/**/*.test.ts',
      'tests/contract/**/*.test.ts',
      'tests/integration/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 180000,
    globalSetup: ['tests/integration/setup.ts'],
    pool: 'forks',
    fileParallelism: false,
  },
});
