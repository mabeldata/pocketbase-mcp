/**
 * Routing de tools (src/tools/index.ts) — contrato das 19 tools registradas.
 *
 * Inclui BUG-1 do diagnóstico: 5 das 9 migration tools NÃO são roteadas hoje
 * (caem em methodNotFoundError). Os cenários BUG-* ficam vermelhos até a
 * tarefa de código aplicar a correção.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { registerTools, handleToolCall } from '../../src/tools/index.js';
import { setMigrationsDirectory } from '../../src/migrations/helpers/file-system.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';
import { sampleCollectionV40, sampleRecord } from '../fixtures/pb-responses.js';
import { describeBugs, itBug, KNOWN_BUGS } from '../fixtures/known-bugs.js';

const ALL_TOOL_NAMES = [
  // records
  'fetch_record', 'list_records', 'create_record', 'update_record', 'delete_record',
  // collections
  'get_collection_schema', 'list_collections',
  // files
  'upload_file', 'download_file',
  // migrations (9)
  'set_migrations_directory', 'create_migration', 'create_collection_migration',
  'add_field_migration', 'list_migrations', 'apply_migration', 'revert_migration',
  'apply_all_migrations', 'revert_to_migration',
  // logs
  'list_logs', 'get_log', 'get_logs_stats', 'truncate_logs',
  // crons
  'list_cron_jobs', 'run_cron_job',
  // PR-3: sql (gated), backups, settings, meta/batch
  'run_sql',
  'list_backups', 'create_backup', 'restore_backup',
  'get_settings', 'update_settings',
  'get_collection_scaffolds', 'dry_run_view_query', 'batch_records',
];

describe('registerTools', () => {
  it('registra todas as 33 tools declaradas (5 record + 2 collection + 2 file + 9 migration + 4 log + 2 cron + 1 sql + 3 backup + 2 settings + 3 admin)', () => {
    // O snapshot de contrato (tests/contract/tools-list.snapshot.test.ts) é a
    // fonte da verdade para a forma exata. Aqui garantimos que TODO nome
    // roteável está registrado e não há duplicatas.
    const { tools } = registerTools();
    const names = tools.map(t => t.name);
    expect(names).toHaveLength(ALL_TOOL_NAMES.length);
    for (const expected of ALL_TOOL_NAMES) {
      expect(names, `tool '${expected}' deveria estar registrada`).toContain(expected);
    }
    expect(new Set(names).size).toBe(names.length); // sem duplicatas
  });
});

describe('handleToolCall — routing', () => {
  let pb: MockPocketBase;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let tmpMigDir: string;

  beforeEach(async () => {
    pb = createMockPocketBase();
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    // create_migration/create_collection_migration escrevem arquivos reais:
    // isolar em tmpdir para não poluir o repositório.
    tmpMigDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbmcp-routing-'));
    setMigrationsDirectory(tmpMigDir);
  });

  afterEach(async () => {
    consoleSpy.mockRestore();
    logSpy.mockRestore();
    await fs.rm(tmpMigDir, { recursive: true, force: true }).catch(() => {});
  });

  it('tool desconhecida → McpError MethodNotFound', async () => {
    await expect(
      handleToolCall({ name: 'nao_existe', arguments: {} }, pb as any)
    ).rejects.toMatchObject({ code: ErrorCode.MethodNotFound });
  });

  it('name ausente → McpError InvalidParams', async () => {
    await expect(
      handleToolCall({ name: '' as any, arguments: {} }, pb as any)
    ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
  });

  it('fetch_record roteia para record handler', async () => {
    pb.collection('posts').getOne.mockResolvedValue(sampleRecord);
    const result = await handleToolCall(
      { name: 'fetch_record', arguments: { collection: 'posts', id: sampleRecord.id } },
      pb as any
    );
    expect(pb.collection('posts').getOne).toHaveBeenCalledWith(sampleRecord.id);
    expect(result.isError).toBeFalsy();
  });

  it('list_collections aceita arguments undefined (schema sem required)', async () => {
    pb.collections.getFullList.mockResolvedValue([sampleCollectionV40]);
    const result = await handleToolCall(
      { name: 'list_collections' } as any,
      pb as any
    );
    expect(result.isError).toBeFalsy();
    expect(pb.collections.getFullList).toHaveBeenCalled();
  });

  // ---- Tools roteadas hoje (devem continuar roteando após o refactor) ----
  const ROUTED_TODAY: Array<[string, Record<string, unknown>]> = [
    ['fetch_record', { collection: 'posts', id: 'x' }],
    ['list_records', { collection: 'posts' }],
    ['create_record', { collection: 'posts', data: { a: 1 } }],
    ['update_record', { collection: 'posts', id: 'x', data: { a: 1 } }],
    ['get_collection_schema', { collection: 'posts' }],
    ['list_collections', {}],
    ['upload_file', { collection: 'posts', recordId: 'x', fileField: 'f', fileContent: 'c', fileName: 'n.txt' }],
    ['download_file', { collection: 'posts', recordId: 'x', fileField: 'f' }],
    ['create_migration', { description: 'teste' }],
    ['create_collection_migration', { collectionDefinition: { name: 'c', id: 'pbc_1' } }],
    ['add_field_migration', { collectionNameOrId: 'c', fieldDefinition: { name: 'f', type: 'text' } }],
    ['list_migrations', {}],
    ['list_logs', {}],
    ['get_log', { id: 'l1' }],
    ['get_logs_stats', {}],
    ['list_cron_jobs', {}],
    ['run_cron_job', { jobId: 'j1' }],
    // PR-3: novas tools — o ponto é o routing (qualquer resultado que não
    // seja MethodNotFound prova que rotearam para o handler certo).
    ['delete_record', { collection: 'posts', id: 'x' }],
    ['truncate_logs', { confirm: true }],
    ['run_sql', { query: 'SELECT 1' }],
    ['list_backups', {}],
    ['create_backup', {}],
    ['restore_backup', { key: 'a.zip', confirm: true }],
    ['get_settings', {}],
    ['update_settings', { data: { logs: { maxDays: 7 } } }],
    ['get_collection_scaffolds', {}],
    ['dry_run_view_query', { query: 'SELECT id FROM posts' }],
    ['batch_records', { requests: [{ collection: 'posts', action: 'create', data: {} }] }],
  ];

  it.each(ROUTED_TODAY)('%s não cai em MethodNotFound', async (name, args) => {
    // Configura mocks para não depender de rede; o ponto do teste é o routing:
    // qualquer resultado/erro que NÃO seja MethodNotFound prova que roteou.
    pb.collection('posts').getOne.mockResolvedValue({ ...sampleRecord, f: 'file.txt' });
    pb.collection('posts').getList.mockResolvedValue({ items: [] });
    pb.collection('posts').create.mockResolvedValue(sampleRecord);
    pb.collection('posts').update.mockResolvedValue(sampleRecord);
    pb.collection('posts').delete.mockResolvedValue(true);
    pb.collections.getOne.mockResolvedValue(sampleCollectionV40);
    pb.collections.getFullList.mockResolvedValue([]);
    pb.collections.getScaffolds.mockResolvedValue([]);
    pb.collections.dryRunViewQuery.mockResolvedValue({ columns: [] });
    pb.files.getUrl.mockReturnValue('http://x/f');
    pb.files.getURL.mockReturnValue('http://x/f');
    pb.logs.getList.mockResolvedValue({ items: [] });
    pb.logs.getOne.mockResolvedValue({ id: 'l1' });
    pb.logs.getStats.mockResolvedValue([]);
    pb.logs.truncate.mockResolvedValue(true);
    pb.crons.getFullList.mockResolvedValue([]);
    pb.crons.run.mockResolvedValue(true);
    pb.sql.run.mockResolvedValue({ rows: [], columns: [] });
    pb.backups.getFullList.mockResolvedValue([]);
    pb.backups.create.mockResolvedValue(true);
    pb.backups.restore.mockResolvedValue(true);
    pb.settings.getAll.mockResolvedValue({});
    pb.settings.update.mockResolvedValue({});
    pb.createBatch.mockReturnValue({
      collection: () => ({
        create: () => {}, update: () => {}, upsert: () => {}, delete: () => {},
      }),
      send: async () => [{ status: 200, body: {} }],
    });

    let methodNotFound = false;
    try {
      await handleToolCall({ name, arguments: args } as any, pb as any);
    } catch (e) {
      if (e instanceof McpError && e.code === ErrorCode.MethodNotFound) {
        methodNotFound = true;
      }
      // outros erros (ex.: fs em create_migration fora de tmpdir) não invalidam o routing
    }
    expect(methodNotFound, `${name} deveria ser roteada`).toBe(false);
  });

  describeBugs('BUG-1 — migration tools não roteadas (cenário pendente)', () => {
    const NOT_ROUTED_TODAY: Array<[string, Record<string, unknown> | undefined]> = [
      ['set_migrations_directory', { customPath: undefined }],
      ['apply_migration', { migrationFile: '123_x.js' }],
      ['revert_migration', { migrationFile: '123_x.js' }],
      ['apply_all_migrations', {}],
      ['revert_to_migration', { targetMigration: '' }],
    ];

    itBug.each(NOT_ROUTED_TODAY)(
      '%s deveria ser roteada (hoje cai em MethodNotFound)',
      async (name, args) => {
        // EXPECTED (pós-correção): NÃO lançar MethodNotFound.
        // Estado atual: lança — teste vermelho documenta o bug (KNOWN_BUGS.BUG1_ROUTING).
        let methodNotFound = false;
        try {
          await handleToolCall({ name, arguments: args } as any, pb as any);
        } catch (e) {
          if (e instanceof McpError && e.code === ErrorCode.MethodNotFound) {
            methodNotFound = true;
          }
        }
        expect(methodNotFound, KNOWN_BUGS.BUG1_ROUTING).toBe(false);
      }
    );
  });
});
