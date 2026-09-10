/**
 * Execução de migrations (src/migrations/execution.ts).
 *
 * ARQUITETURA EM TRANSIÇÃO (decisão D1 do diagnóstico t_e266f9f8):
 *
 * - ESTADO ATUAL (main @ 4edb896): execution.ts extrai os corpos up/down do
 *   formato JSVM via regex + new Function('app', body) e executa contra o
 *   CLIENTE REST — migrations reais de servidor falham em runtime (BUG-4).
 *   A suíte "legacy" abaixo trava essa mecânica.
 *
 * - ESTADO PÓS-D1 (redesign REST): os arquivos gerados pelo MCP passam a
 *   embutir um marcador `// mcp-migration-meta: {ops:{up:[...],down:[...]}}`
 *   e apply/revert executam as operações via pb.collections.* (create/delete/
 *   getOne/update); arquivos sem marcador (JSVM de servidor) são rejeitados
 *   com erro explicativo apontando `./pocketbase migrate up`. A suíte "REST"
 *   abaixo trava esse comportamento.
 *
 * DETECÇÃO AUTOMÁTICA: este arquivo detecta em runtime se o redesign existe
 * (export `parseMigrationMeta` em helpers/template.ts) e roda apenas a suíte
 * aplicável — a transição na tarefa de integração (t_83cd2329) não exige
 * reescrita manual de testes. O formato do marcador meta É o contrato entre
 * as duas suítes.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import * as templateHelpers from '../../src/migrations/helpers/template.js';
import {
  applyMigration,
  revertMigration,
  applyAllMigrations,
  revertToMigration,
} from '../../src/migrations/execution.js';
import { generateMigrationTemplate } from '../../src/migrations/helpers/template.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';

/** O redesign D1 (execução REST via meta-marker) está presente no src? */
const HAS_REST_REDESIGN = typeof (templateHelpers as any).parseMigrationMeta === 'function';

const describeLegacy = HAS_REST_REDESIGN ? describe.skip : describe;
const describeRest = HAS_REST_REDESIGN ? describe : describe.skip;

/** Constrói o marcador meta no formato-contrato do redesign D1. */
function metaMarker(meta: Record<string, unknown>): string {
  return `// mcp-migration-meta: ${JSON.stringify(meta)}`;
}

/** Gera conteúdo de migration JSVM + marcador meta (formato do gerador pós-D1). */
function migrationWithMeta(meta: Record<string, unknown>): string {
  const js = generateMigrationTemplate('// up (JSVM p/ migrate up no host)', '// down');
  // marcador após a linha `/// <reference ...>` (como o gerador faz)
  return js.replace(/^(.*\n)/, `$1${metaMarker(meta)}\n`);
}

describe('execution.ts — seleção automática de suíte', () => {
  it('detecta o estado da implementação (legacy vs REST redesign)', () => {
    // Documenta qual suíte está ativa — em qualquer branch, exatamente uma roda.
    expect(typeof HAS_REST_REDESIGN).toBe('boolean');
  });
});

// ============================================================
// SUÍTE LEGACY — mecânica atual (pré-redesign D1), main @ 4edb896
// ============================================================

/** `app` fake: migrations de teste chamam app.marker(nome) para provar execução. */
function fakeApp() {
  const calls: string[] = [];
  return { app: { marker: (name: string) => calls.push(name) }, calls };
}

function legacyMigrationBody(markerUp: string, markerDown: string): string {
  return generateMigrationTemplate(
    `app.marker("${markerUp}");`,
    `app.marker("${markerDown}");`
  );
}

describeLegacy('execution.ts — mecânica legacy (eval JSVM contra o objeto passado)', () => {
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
    await writeMigration('1700000001_up.js', legacyMigrationBody('UP1', 'DOWN1'));
    const { app, calls } = fakeApp();
    const msg = await applyMigration('1700000001_up.js', app as any, tmpDir);
    expect(msg).toContain('Successfully applied migration: 1700000001_up.js');
    expect(calls).toEqual(['UP1']);
  });

  it('revertMigration executa o corpo down', async () => {
    await writeMigration('1700000001_up.js', legacyMigrationBody('UP1', 'DOWN1'));
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
    await writeMigration('1700000001_a.js', legacyMigrationBody('A_UP', 'A_DOWN'));
    await writeMigration('1700000002_b.js', legacyMigrationBody('B_UP', 'B_DOWN'));
    await writeMigration('1700000003_c.js', legacyMigrationBody('C_UP', 'C_DOWN'));
    const { app, calls } = fakeApp();
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
    await writeMigration('1700000001_a.js', legacyMigrationBody('A_UP', 'A_DOWN'));
    await writeMigration('1700000002_b.js', legacyMigrationBody('B_UP', 'B_DOWN'));
    await writeMigration('1700000003_c.js', legacyMigrationBody('C_UP', 'C_DOWN'));
    const { app, calls } = fakeApp();
    const reverted = await revertToMigration(
      '1700000001_a.js', app as any, tmpDir,
      ['1700000001_a.js', '1700000002_b.js', '1700000003_c.js']
    );
    expect(reverted).toEqual(['1700000003_c.js', '1700000002_b.js']);
    expect(calls).toEqual(['C_DOWN', 'B_DOWN']);
  });

  it('revertToMigration com alvo vazio reverte todas as applied', async () => {
    await writeMigration('1700000001_a.js', legacyMigrationBody('A_UP', 'A_DOWN'));
    await writeMigration('1700000002_b.js', legacyMigrationBody('B_UP', 'B_DOWN'));
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
    await writeMigration('1700000001_a.js', legacyMigrationBody('A_UP', 'A_DOWN'));
    const { app } = fakeApp();
    await expect(
      revertToMigration('9999999999_z.js', app as any, tmpDir, ['1700000001_a.js'])
    ).rejects.toThrow(/Target migration not found/);
  });

  it('BUG-4 documentado: migration JSVM real falha contra client REST (motivo do redesign D1)', async () => {
    const realClientLike = createMockPocketBase();
    await writeMigration(
      '1700000004_real.js',
      generateMigrationTemplate(
        'const collection = new Collection({ id: "pbc_1", name: "posts" });\n  return app.save(collection);',
        'const collection = app.findCollectionByNameOrId("posts");\n  return app.delete(collection);'
      )
    );
    await expect(applyMigration('1700000004_real.js', realClientLike as any, tmpDir))
      .rejects.toThrow(/Failed to apply migration/);
    expect(errSpy.mock.calls.flat().join(' ')).toMatch(/Collection is not defined|Failed to load/);
  });
});

// ============================================================
// SUÍTE REST — redesign D1 (execução via pb.collections.*)
// ============================================================

const TEST_COLLECTION_DEF = {
  id: 'pbc_rest000001',
  name: 'rest_posts',
  type: 'base',
  fields: [{ name: 'title', type: 'text', required: true, max: 200 }],
  indexes: [],
  listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
};

describeRest('execution.ts — redesign D1 (REST via meta-marker)', () => {
  let tmpDir: string;
  let pb: MockPocketBase;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbmcp-rest-'));
    pb = createMockPocketBase();
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    errSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeMigration(filename: string, content: string) {
    await fs.writeFile(path.join(tmpDir, filename), content, 'utf-8');
  }

  it('applyMigration createCollection → pb.collections.create com a definição', async () => {
    await writeMigration('1700000001_create.js', migrationWithMeta({
      ops: {
        up: [{ action: 'createCollection', collection: TEST_COLLECTION_DEF }],
        down: [{ action: 'deleteCollection', collectionIdOrName: TEST_COLLECTION_DEF.id }],
      },
    }));
    pb.collections.create.mockResolvedValue(TEST_COLLECTION_DEF);

    const msg = await applyMigration('1700000001_create.js', pb as any, tmpDir);
    expect(msg).toContain('Successfully applied migration: 1700000001_create.js');
    expect(pb.collections.create).toHaveBeenCalledWith(TEST_COLLECTION_DEF);
    // down NÃO executado no apply
    expect(pb.collections.delete).not.toHaveBeenCalled();
  });

  it('revertMigration deleteCollection → getOne + delete (idempotente se 404)', async () => {
    await writeMigration('1700000001_create.js', migrationWithMeta({
      ops: {
        up: [{ action: 'createCollection', collection: TEST_COLLECTION_DEF }],
        down: [{ action: 'deleteCollection', collectionIdOrName: TEST_COLLECTION_DEF.id }],
      },
    }));
    pb.collections.getOne.mockResolvedValue(TEST_COLLECTION_DEF);
    pb.collections.delete.mockResolvedValue(true);

    const msg = await revertMigration('1700000001_create.js', pb as any, tmpDir);
    expect(msg).toContain('Successfully reverted');
    expect(pb.collections.getOne).toHaveBeenCalledWith(TEST_COLLECTION_DEF.id);
    expect(pb.collections.delete).toHaveBeenCalledWith(TEST_COLLECTION_DEF.id);
  });

  it('revertMigration deleteCollection com collection já ausente (404) → skip idempotente', async () => {
    await writeMigration('1700000001_create.js', migrationWithMeta({
      ops: {
        up: [{ action: 'createCollection', collection: TEST_COLLECTION_DEF }],
        down: [{ action: 'deleteCollection', collectionIdOrName: TEST_COLLECTION_DEF.id }],
      },
    }));
    pb.collections.getOne.mockRejectedValue({ status: 404 });

    const msg = await revertMigration('1700000001_create.js', pb as any, tmpDir);
    expect(msg).toContain('Successfully reverted');
    expect(pb.collections.delete).not.toHaveBeenCalled();
  });

  it('applyMigration addField → getOne + update com fields acrescido', async () => {
    const field = { name: 'subtitle', type: 'text', max: 100 };
    await writeMigration('1700000002_addfield.js', migrationWithMeta({
      ops: {
        up: [{ action: 'addField', collectionIdOrName: 'rest_posts', field }],
        down: [{ action: 'removeField', collectionIdOrName: 'rest_posts', fieldName: 'subtitle' }],
      },
    }));
    pb.collections.getOne.mockResolvedValue({ ...TEST_COLLECTION_DEF });
    pb.collections.update.mockResolvedValue({ ...TEST_COLLECTION_DEF });

    await applyMigration('1700000002_addfield.js', pb as any, tmpDir);
    expect(pb.collections.update).toHaveBeenCalledTimes(1);
    const [id, body] = pb.collections.update.mock.calls[0];
    expect(id).toBe(TEST_COLLECTION_DEF.id);
    expect(body.fields).toHaveLength(2);
    expect(body.fields[1]).toEqual(field);
  });

  it('applyMigration addField com campo duplicado → erro claro', async () => {
    const field = { name: 'title', type: 'text' }; // já existe na definição
    await writeMigration('1700000003_dup.js', migrationWithMeta({
      ops: { up: [{ action: 'addField', collectionIdOrName: 'rest_posts', field }], down: [] },
    }));
    pb.collections.getOne.mockResolvedValue({ ...TEST_COLLECTION_DEF });

    await expect(applyMigration('1700000003_dup.js', pb as any, tmpDir))
      .rejects.toThrow(/already exists/);
    expect(pb.collections.update).not.toHaveBeenCalled();
  });

  it('revertMigration removeField → update sem o campo; ausente → skip idempotente', async () => {
    await writeMigration('1700000004_rmfield.js', migrationWithMeta({
      ops: {
        up: [],
        down: [{ action: 'removeField', collectionIdOrName: 'rest_posts', fieldName: 'subtitle' }],
      },
    }));
    // caso 1: campo presente
    pb.collections.getOne.mockResolvedValue({
      ...TEST_COLLECTION_DEF,
      fields: [...TEST_COLLECTION_DEF.fields, { name: 'subtitle', type: 'text' }],
    });
    pb.collections.update.mockResolvedValue({});
    await revertMigration('1700000004_rmfield.js', pb as any, tmpDir);
    const [, body] = pb.collections.update.mock.calls[0];
    expect(body.fields.some((f: any) => f.name === 'subtitle')).toBe(false);

    // caso 2: campo já removido → update não chamado de novo
    pb.collections.update.mockClear();
    pb.collections.getOne.mockResolvedValue({ ...TEST_COLLECTION_DEF });
    const msg = await revertMigration('1700000004_rmfield.js', pb as any, tmpDir);
    expect(msg).toContain('Successfully reverted');
    expect(pb.collections.update).not.toHaveBeenCalled();
  });

  it('arquivo SEM meta-marker (JSVM de servidor) → erro explicativo apontando migrate up', async () => {
    await writeMigration('1700000005_jsvm.js', generateMigrationTemplate(
      'const c = new Collection({});\n  return app.save(c);', '// down'
    ));
    await expect(applyMigration('1700000005_jsvm.js', pb as any, tmpDir))
      .rejects.toThrow(/pocketbase migrate up/);
  });

  it('applyMigration NÃO executa mais código do arquivo (new Function abandonado)', async () => {
    // Prova de segurança do redesign: um corpo JSVM malicioso/quebrado com
    // meta-marker válido não é executado — só as ops do meta rodam via REST.
    await writeMigration('1700000006_safe.js', migrationWithMeta({
      ops: { up: [{ action: 'createCollection', collection: TEST_COLLECTION_DEF }], down: [] },
    }).replace('// up (JSVM p/ migrate up no host)', 'throw new Error("NAO DEVERIA EXECUTAR");'));
    pb.collections.create.mockResolvedValue(TEST_COLLECTION_DEF);

    const msg = await applyMigration('1700000006_safe.js', pb as any, tmpDir);
    expect(msg).toContain('Successfully applied');
    expect(pb.collections.create).toHaveBeenCalledTimes(1);
  });

  it('applyAllMigrations aplica só os pendentes, em ordem, via REST', async () => {
    await writeMigration('1700000001_a.js', migrationWithMeta({
      ops: { up: [{ action: 'createCollection', collection: { ...TEST_COLLECTION_DEF, name: 'a' } }], down: [] },
    }));
    await writeMigration('1700000002_b.js', migrationWithMeta({
      ops: { up: [{ action: 'createCollection', collection: { ...TEST_COLLECTION_DEF, name: 'b' } }], down: [] },
    }));
    const { setMigrationsDirectory } = await import('../../src/migrations/helpers/file-system.js');
    setMigrationsDirectory(tmpDir);
    pb.collections.create.mockResolvedValue({});

    const applied = await applyAllMigrations(pb as any, tmpDir, ['1700000001_a.js']);
    expect(applied).toEqual(['1700000002_b.js']);
    expect(pb.collections.create).toHaveBeenCalledTimes(1);
    expect(pb.collections.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'b' }));
  });

  it('revertToMigration mantém semântica de ordem (reversa, alvo exclusivo)', async () => {
    for (const [file, name] of [['1700000001_a.js', 'a'], ['1700000002_b.js', 'b']] as const) {
      await writeMigration(file, migrationWithMeta({
        ops: {
          up: [{ action: 'createCollection', collection: { ...TEST_COLLECTION_DEF, name } }],
          down: [{ action: 'deleteCollection', collectionIdOrName: TEST_COLLECTION_DEF.id }],
        },
      }));
    }
    pb.collections.getOne.mockResolvedValue({ ...TEST_COLLECTION_DEF });
    pb.collections.delete.mockResolvedValue(true);

    const reverted = await revertToMigration(
      '1700000001_a.js', pb as any, tmpDir, ['1700000001_a.js', '1700000002_b.js']
    );
    expect(reverted).toEqual(['1700000002_b.js']);
    expect(pb.collections.delete).toHaveBeenCalledTimes(1);
  });
});
