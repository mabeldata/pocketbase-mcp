/**
 * Execução de migrations (src/migrations/execution.ts).
 *
 * ATENÇÃO (BUG-4 / decisão D1 do diagnóstico): a implementação atual executa o
 * corpo JSVM de servidor (migrate(), new Collection(), app.findCollectionByNameOrId,
 * app.save) via new Function('app', body) recebendo o CLIENTE REST como `app` —
 * migrations reais FALHAM em runtime. Estes testes travam a mecânica atual
 * (extração por regex + execução up/down) para que o redesign planejado
 * (REST-based ou CLI) seja uma mudança consciente: os testes deste arquivo
 * devem ser REESCRITOS junto com o redesign, e isso está explicitamente
 * sinalizado abaixo.
 *
 * O que é testado aqui (mecânica, não semântica de servidor):
 * - extração dos corpos up/down do formato de template gerado por template.ts
 * - ciclo apply → revert com `app` fake que registra chamadas
 * - erros: arquivo inexistente, formato inválido
 * - applyAllMigrations: filtra applied, aplica pendentes em ordem
 * - revertToMigration: ordem reversa, alvo exclusivo, string vazia = todas,
 *   alvo não encontrado → Error, applied vazio → []
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import {
  applyMigration,
  revertMigration,
  applyAllMigrations,
  revertToMigration,
} from '../../src/migrations/execution.js';
import { generateMigrationTemplate } from '../../src/migrations/helpers/template.js';
import { createMockPocketBase } from '../fixtures/mock-pocketbase.js';

/** `app` fake: as migrations de teste chamam app.marker(nome) para provar execução. */
function fakeApp() {
  const calls: string[] = [];
  return { app: { marker: (name: string) => calls.push(name) }, calls };
}

function migrationBody(markerUp: string, markerDown: string): string {
  return generateMigrationTemplate(
    `app.marker("${markerUp}");`,
    `app.marker("${markerDown}");`
  );
}

describe('execution.ts — mecânica atual (pré-redesign D1)', () => {
  let tmpDir: string;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbmcp-exec-'));
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    errSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeMigration(filename: string, content: string) {
    await fs.writeFile(path.join(tmpDir, filename), content, 'utf-8');
  }

  it('applyMigration executa o corpo up contra o objeto passado como app', async () => {
    await writeMigration('1700000001_up.js', migrationBody('UP1', 'DOWN1'));
    const { app, calls } = fakeApp();
    const msg = await applyMigration('1700000001_up.js', app as any, tmpDir);
    expect(msg).toContain('Successfully applied migration: 1700000001_up.js');
    expect(calls).toEqual(['UP1']);
  });

  it('revertMigration executa o corpo down', async () => {
    await writeMigration('1700000001_up.js', migrationBody('UP1', 'DOWN1'));
    const { app, calls } = fakeApp();
    const msg = await revertMigration('1700000001_up.js', app as any, tmpDir);
    expect(msg).toContain('Successfully reverted migration: 1700000001_up.js');
    expect(calls).toEqual(['DOWN1']);
  });

  it('arquivo inexistente → Error "Failed to apply migration"', async () => {
    const { app } = fakeApp();
    await expect(applyMigration('9999999999_nope.js', app as any, tmpDir))
      .rejects.toThrow(/Failed to apply migration/);
  });

  it('formato inválido (sem migrate(...)) → Error "Failed to load migration file"', async () => {
    await writeMigration('1700000002_bad.js', 'console.log("não sou migration");');
    const { app } = fakeApp();
    await expect(applyMigration('1700000002_bad.js', app as any, tmpDir))
      .rejects.toThrow(/Failed to (load|apply) migration/);
  });

  it('erro dentro do corpo up é propagado embrulhado', async () => {
    await writeMigration(
      '1700000003_throws.js',
      generateMigrationTemplate('throw new Error("boom interno");', '// nada')
    );
    const { app } = fakeApp();
    await expect(applyMigration('1700000003_throws.js', app as any, tmpDir))
      .rejects.toThrow(/boom interno/);
  });

  it('applyAllMigrations aplica pendentes em ordem cronológica e pula applied', async () => {
    await writeMigration('1700000001_a.js', migrationBody('A_UP', 'A_DOWN'));
    await writeMigration('1700000002_b.js', migrationBody('B_UP', 'B_DOWN'));
    await writeMigration('1700000003_c.js', migrationBody('C_UP', 'C_DOWN'));
    const { app, calls } = fakeApp();
    // setMigrationsDirectory do módulo de execução usa o dir do helper global;
    // applyAllMigrations chama listMigrationFiles() sem dir explícito — apontar
    // o diretório global para tmpDir antes.
    const { setMigrationsDirectory } = await import('../../src/migrations/helpers/file-system.js');
    setMigrationsDirectory(tmpDir);

    const applied = await applyAllMigrations(app as any, tmpDir, ['1700000002_b.js']);
    expect(applied).toEqual(['1700000001_a.js', '1700000003_c.js']);
    expect(calls).toEqual(['A_UP', 'C_UP']);
  });

  it('applyAllMigrations sem pendentes → []', async () => {
    const { setMigrationsDirectory } = await import('../../src/migrations/helpers/file-system.js');
    setMigrationsDirectory(tmpDir);
    const { app } = fakeApp();
    expect(await applyAllMigrations(app as any, tmpDir, [])).toEqual([]);
  });

  it('revertToMigration reverte em ordem reversa até o alvo (exclusivo)', async () => {
    await writeMigration('1700000001_a.js', migrationBody('A_UP', 'A_DOWN'));
    await writeMigration('1700000002_b.js', migrationBody('B_UP', 'B_DOWN'));
    await writeMigration('1700000003_c.js', migrationBody('C_UP', 'C_DOWN'));
    const { app, calls } = fakeApp();
    const reverted = await revertToMigration(
      '1700000001_a.js', app as any, tmpDir,
      ['1700000001_a.js', '1700000002_b.js', '1700000003_c.js']
    );
    expect(reverted).toEqual(['1700000003_c.js', '1700000002_b.js']);
    expect(calls).toEqual(['C_DOWN', 'B_DOWN']);
  });

  it('revertToMigration com alvo vazio reverte todas as applied', async () => {
    await writeMigration('1700000001_a.js', migrationBody('A_UP', 'A_DOWN'));
    await writeMigration('1700000002_b.js', migrationBody('B_UP', 'B_DOWN'));
    const { app, calls } = fakeApp();
    const reverted = await revertToMigration('', app as any, tmpDir, [
      '1700000001_a.js', '1700000002_b.js',
    ]);
    expect(reverted).toEqual(['1700000002_b.js', '1700000001_a.js']);
    expect(calls).toEqual(['B_DOWN', 'A_DOWN']);
  });

  it('revertToMigration com applied vazio → []', async () => {
    const { app } = fakeApp();
    expect(await revertToMigration('', app as any, tmpDir, [])).toEqual([]);
  });

  it('revertToMigration alvo não encontrado → Error', async () => {
    await writeMigration('1700000001_a.js', migrationBody('A_UP', 'A_DOWN'));
    const { app } = fakeApp();
    await expect(
      revertToMigration('9999999999_z.js', app as any, tmpDir, ['1700000001_a.js'])
    ).rejects.toThrow(/Target migration not found/);
  });

  it('client REST real passado como app NÃO tem a API JSVM — documenta a falha arquitetural (BUG-4)', async () => {
    // Uma migration REAL de servidor (new Collection + app.save) falha contra o
    // client REST: este teste PROVA a falha atual e deve ser reescrito quando
    // o redesign D1 (execução via REST/CLI) for implementado.
    const realClientLike = createMockPocketBase(); // stand-in do client REST
    await writeMigration(
      '1700000004_real.js',
      generateMigrationTemplate(
        'const collection = new Collection({ id: "pbc_1", name: "posts" });\n  return app.save(collection);',
        'const collection = app.findCollectionByNameOrId("posts");\n  return app.delete(collection);'
      )
    );
    await expect(applyMigration('1700000004_real.js', realClientLike as any, tmpDir))
      .rejects.toThrow(/Failed to apply migration/);
    // causa raiz: `new Collection` (global JSVM do servidor) não existe aqui
    expect(errSpy.mock.calls.flat().join(' ')).toMatch(/Collection is not defined|Failed to load/);
  });
});
