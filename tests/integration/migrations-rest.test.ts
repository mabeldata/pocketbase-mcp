/**
 * INTEGRAÇÃO — ciclo completo de migration APLICADA via REST (redesign D1)
 * contra PocketBase REAL, exercitando as TOOLS apply_migration/revert_migration.
 *
 * Só roda quando o redesign D1 está presente no src (execution.ts REST +
 * `parseMigrationMeta` em template.ts). No código legacy (eval JSVM) as tools
 * apply/revert nem são roteadas (BUG-1) e o caminho REST não existe — a suíte
 * pula com mensagem. Assim, quando a tarefa de integração (t_83cd2329) unir o
 * src refatorado, este teste end-to-end já valida:
 *   create_collection_migration → apply_migration (REST) → collection visível
 *   pela API → add_field_migration → apply → campo presente → revert (todas) →
 *   collection removida.
 *
 * Usa o MESMO server de integração (pb_data compartilhado com os outros testes
 * de integração); cria collections com nomes únicos por run e limpa no final.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import PocketBase from 'pocketbase';
import { handleToolCall } from '../../src/tools/index.js';
import { setMigrationsDirectory } from '../../src/migrations/index.js';
import * as templateHelpers from '../../src/migrations/helpers/template.js';
import { integrationSkipReason, createIntegrationClient } from './helpers.js';

const skipReason = integrationSkipReason();
const HAS_REST_REDESIGN = typeof (templateHelpers as any).parseMigrationMeta === 'function';
const describeI = (skipReason || !HAS_REST_REDESIGN) ? describe.skip : describe;

function toolText(result: any): string {
  return result.content[0].text;
}

async function call(name: string, args: Record<string, unknown>, pb: PocketBase) {
  return handleToolCall({ name, arguments: args } as any, pb);
}

describeI('integração — ciclo de migration aplicada via REST (D1, tools reais)', () => {
  let pb: PocketBase;
  let migDir: string;
  const runSuffix = Math.random().toString(36).slice(2, 8);
  const COLL_NAME = `it_rest_${runSuffix}`;
  const COLL_ID = `pbc_${runSuffix.slice(0, 10).padEnd(10, '0')}`;

  beforeAll(async () => {
    pb = createIntegrationClient();
    migDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbmcp-restd1-'));
    setMigrationsDirectory(migDir);
  });

  afterAll(async () => {
    await pb.collections.delete(COLL_NAME).catch(() => {});
    await fs.rm(migDir, { recursive: true, force: true }).catch(() => {});
  });

  it('create → apply (REST) → collection visível pela API', async () => {
    const created = await call('create_collection_migration', {
      collectionDefinition: {
        id: COLL_ID,
        name: COLL_NAME,
        type: 'base',
        fields: [
          { name: 'title', type: 'text', required: true, max: 200, min: 0, hidden: false, presentable: true, system: false },
        ],
        indexes: [],
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      },
      description: `rest create ${runSuffix}`,
    }, pb);
    expect(created.isError).toBeFalsy();

    const filename = path.basename(
      toolText(created).replace('Created collection migration file: ', '').trim()
    );

    const applied = await call('apply_migration', { migrationFile: filename }, pb);
    expect(applied.isError, `apply deveria suceder: ${toolText(applied)}`).toBeFalsy();
    expect(toolText(applied)).toMatch(/Successfully applied/);

    // a collection existe de verdade no server
    const schema = await pb.collections.getOne(COLL_NAME);
    expect(schema.name).toBe(COLL_NAME);
  });

  it('add_field → apply (REST) → campo presente no schema real', async () => {
    const created = await call('add_field_migration', {
      collectionNameOrId: COLL_NAME,
      fieldDefinition: { name: 'subtitle', type: 'text', max: 100, min: 0, hidden: false, presentable: false, required: false, system: false },
      description: `rest add subtitle ${runSuffix}`,
    }, pb);
    expect(created.isError).toBeFalsy();
    const filename = path.basename(
      toolText(created).replace('Created field migration file: ', '').trim()
    );

    const applied = await call('apply_migration', { migrationFile: filename }, pb);
    expect(applied.isError, toolText(applied)).toBeFalsy();

    const schema: any = await pb.collections.getOne(COLL_NAME);
    expect(schema.fields.some((f: any) => f.name === 'subtitle')).toBe(true);
  });

  it('record CRUD na collection criada por migration REST', async () => {
    const rec = await call('create_record', { collection: COLL_NAME, data: { title: 'via REST D1', subtitle: 'sub' } }, pb);
    expect(rec.isError).toBeFalsy();
    const parsed = JSON.parse(toolText(rec));
    expect(parsed.title).toBe('via REST D1');
    expect(parsed.subtitle).toBe('sub');
  });

  it('revert_to_migration (todas) via REST → collection removida do server', async () => {
    const listResult = await call('list_migrations', {}, pb);
    const files = toolText(listResult)
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.endsWith('.js'));
    expect(files.length).toBeGreaterThanOrEqual(2);

    // revert all (target vazio) considerando todas como applied
    const reverted = await call('revert_to_migration', { targetMigration: '', appliedMigrations: files }, pb);
    expect(reverted.isError, toolText(reverted)).toBeFalsy();

    // collection não existe mais
    await expect(pb.collections.getOne(COLL_NAME)).rejects.toMatchObject({ status: 404 });
  });
});
