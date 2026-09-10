/**
 * INTEGRAÇÃO — PR-3: tools aditivas v0.37–v0.40 via handleToolCall contra
 * PocketBase REAL (matriz CI: v0.39.11 e v0.40.3).
 *
 * Cobre:
 * - delete_record          (CRUD completo com 404 pós-delete)
 * - truncate_logs          (server >= v0.40; em v0.39 o 404 do endpoint
 *                           inexistente deve propagar como erro)
 * - run_sql                (gate POCKETBASE_ENABLE_SQL: bloqueado sem env;
 *                           com env, executa SELECT real no v0.39+)
 * - get_collection_scaffolds / dry_run_view_query (v0.37+)
 * - list_backups / create_backup / restore_backup (restauração real no
 *                           instance ephemeral + sanity pós-restore)
 * - get_settings / update_settings (round-trip de meta.appName)
 * - batch_records          (create+update+delete transacional + rollback)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import PocketBase from 'pocketbase';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { handleToolCall } from '../../src/tools/index.js';
import { integrationSkipReason, createIntegrationClient, integrationVersion, integrationUrl } from './helpers.js';

const skipReason = integrationSkipReason();
const describeI = skipReason ? describe.skip : describe;

const TEST_COLLECTION = 'it_pr3_posts';

function toolText(result: any): string {
  return result.content[0].text;
}

async function call(name: string, args: Record<string, unknown>, pb: PocketBase) {
  return handleToolCall({ name, arguments: args } as any, pb);
}

/** true se a versão do server é >= min (ex.: gte(minor 40)). */
function serverAtLeast(minMinor: number): boolean {
  const m = integrationVersion().match(/v?0\.(\d+)/);
  return m ? Number(m[1]) >= minMinor : true; // versão desconhecida: assume latest
}

describeI('integração — PR-3 tools aditivas via MCP', () => {
  let pb: PocketBase;

  beforeAll(async () => {
    pb = createIntegrationClient();
    const existing = await pb.collections.getFullList({ filter: `name="${TEST_COLLECTION}"` });
    if (existing.length === 0) {
      await pb.collections.create({
        name: TEST_COLLECTION,
        type: 'base',
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'status', type: 'text', required: false },
        ],
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      });
    }
  });

  afterAll(async () => {
    await pb.collections.delete(TEST_COLLECTION).catch(() => {});
  });

  // ---------------------------------------------------------------- records
  describe('delete_record', () => {
    it('cria, deleta e o registro some (fetch → 404)', async () => {
      const created = JSON.parse(toolText(await call('create_record', {
        collection: TEST_COLLECTION, data: { title: 'para deletar' },
      }, pb)));
      expect(created.id).toBeTruthy();

      const deleted = await call('delete_record', { collection: TEST_COLLECTION, id: created.id }, pb);
      expect(deleted.isError).toBeFalsy();
      expect(JSON.parse(toolText(deleted))).toMatchObject({ deleted: true, id: created.id });

      await expect(
        call('fetch_record', { collection: TEST_COLLECTION, id: created.id }, pb)
      ).rejects.toMatchObject({ status: 404 });
    });

    it('id inexistente → 404 propagado', async () => {
      await expect(
        call('delete_record', { collection: TEST_COLLECTION, id: 'naoexistenaobc' }, pb)
      ).rejects.toMatchObject({ status: 404 });
    });

    it('sem id → InvalidParams no routing (antes de tocar a rede)', async () => {
      await expect(
        call('delete_record', { collection: TEST_COLLECTION }, pb)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });
  });

  // ------------------------------------------------------------------ logs
  describe('truncate_logs', () => {
    it('sem confirm → InvalidParams; com confirm → executa conforme a versão do server', async () => {
      await expect(
        call('truncate_logs', { confirm: false }, pb)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });

      // gera pelo menos um request log
      await fetch(`${integrationUrl()}/api/health`).catch(() => {});

      if (serverAtLeast(40)) {
        const result = await call('truncate_logs', { confirm: true }, pb);
        expect(result.isError).toBeFalsy();
        expect(JSON.parse(toolText(result)).truncated).toBe(true);
      } else {
        // v0.39: endpoint DELETE /api/logs não existe → erro 404/405 propaga
        await expect(
          call('truncate_logs', { confirm: true }, pb)
        ).rejects.toMatchObject({ status: expect.any(Number) });
      }
    });
  });

  // ------------------------------------------------------------------- sql
  describe('run_sql (gated)', () => {
    const saved = process.env.POCKETBASE_ENABLE_SQL;
    beforeAll(() => { delete process.env.POCKETBASE_ENABLE_SQL; });
    afterAll(() => {
      if (saved !== undefined) process.env.POCKETBASE_ENABLE_SQL = saved;
    });

    it('gate fechado → isError explicativo mesmo contra server real', async () => {
      const result = await call('run_sql', { query: 'SELECT 1' }, pb);
      expect(result.isError).toBe(true);
      expect(toolText(result)).toMatch(/POCKETBASE_ENABLE_SQL/);
    });

    it('gate aberto → SELECT real devolve rows/columns (server >= v0.39)', async () => {
      process.env.POCKETBASE_ENABLE_SQL = 'true';
      if (!serverAtLeast(39)) return; // endpoint não existe antes do v0.39
      const result = await call(
        'run_sql', { query: `SELECT COUNT(*) AS n FROM ${TEST_COLLECTION}` }, pb
      );
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(toolText(result));
      expect(Array.isArray(parsed.columns)).toBe(true);
      expect(parsed.columns.map((c: any) => c.name)).toContain('n');
      expect(Number(parsed.rows[0][0])).toBeGreaterThanOrEqual(0);
    });

    it('gate aberto + SQL inválida → erro do server propaga', async () => {
      process.env.POCKETBASE_ENABLE_SQL = 'true';
      if (!serverAtLeast(39)) return;
      await expect(
        call('run_sql', { query: 'SELECT * FROM tabela_que_nao_existe_xyz' }, pb)
      ).rejects.toBeTruthy();
    });
  });

  // ----------------------------------------------------- collections meta
  describe('get_collection_scaffolds / dry_run_view_query (v0.37+)', () => {
    it('scaffolds devolve um objeto com templates por tipo de coleção', async () => {
      if (!serverAtLeast(37)) return;
      const result = await call('get_collection_scaffolds', {}, pb);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(toolText(result));
      // shape real (probe v0.39.11 + v0.40.3): { base: {...}, auth: {...}, view: {...} }
      expect(typeof parsed).toBe('object');
      expect(parsed).toHaveProperty('base');
      expect(parsed.base).toHaveProperty('type', 'base');
      expect(parsed).toHaveProperty('auth');
    });

    it('dry-run de SELECT válido devolve fields+sample; SELECT inválido → erro', async () => {
      if (!serverAtLeast(37)) return;
      const ok = await call(
        'dry_run_view_query', { query: `SELECT id, title FROM ${TEST_COLLECTION}` }, pb
      );
      expect(ok.isError).toBeFalsy();
      // shape real: { fields: [field defs], indexes, sample: [linhas] }
      const parsed = JSON.parse(toolText(ok));
      expect(Array.isArray(parsed.fields)).toBe(true);
      const names = parsed.fields.map((f: any) => f.name);
      expect(names).toContain('id');
      expect(names).toContain('title');

      await expect(
        call('dry_run_view_query', { query: 'SELECT nope FROM nada' }, pb)
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  // --------------------------------------------------------------- backups
  describe('list_backups / create_backup (restore e2e fica no smoke, fim de suíte)', () => {
    // Restore REAL substitui o db do server compartilhado da suíte e
    // interfere com arquivos-irmãos que rodam antes/depois no mesmo boot
    // (ordem de discovery do vitest não é travada) — a happy-path de
    // restore_backup é coberta como ÚLTIMO check do scripts/smoke.mjs, que
    // usa instância dedicada. Aqui: criação + visibilidade + travas.
    it('create_backup fila o backup; list_backups o vê', async () => {
      const created = await call('create_backup', {}, pb);
      expect(created.isError).toBeFalsy();
      expect(JSON.parse(toolText(created)).queued).toBe(true);

      // server processa a fila de backup de forma assíncrona
      let keys: string[] = [];
      const start = Date.now();
      while (Date.now() - start < 30_000) {
        const listed = await call('list_backups', {}, pb);
        expect(listed.isError).toBeFalsy();
        keys = JSON.parse(toolText(listed)).map((b: any) => b.key);
        if (keys.length > 0) break;
        await new Promise(r => setTimeout(r, 1000));
      }
      expect(keys.length, 'nenhum backup apareceu em list_backups').toBeGreaterThan(0);
    }, 90_000);

    it('restore sem confirm → InvalidParams (trava destrutiva, antes da rede)', async () => {
      await expect(
        call('restore_backup', { key: 'qualquer.zip', confirm: false }, pb)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('restore de key inexistente → erro do server (404/400) propagado', async () => {
      await expect(
        call('restore_backup', { key: 'nao_existe.zip', confirm: true }, pb)
      ).rejects.toBeTruthy();
    });
  });

  // -------------------------------------------------------------- settings
  describe('get_settings / update_settings', () => {
    it('get_settings devolve payload com seções meta/logs; update round-trip de appName', async () => {
      const got = await call('get_settings', {}, pb);
      expect(got.isError).toBeFalsy();
      const settings = JSON.parse(toolText(got));
      expect(settings.meta).toBeDefined();
      expect(settings.logs).toBeDefined();

      const originalAppName = settings.meta.appName;
      const updated = await call('update_settings', {
        data: { meta: { ...settings.meta, appName: 'it-pr3-renamed' } },
      }, pb);
      expect(updated.isError).toBeFalsy();
      expect(JSON.parse(toolText(updated)).meta.appName).toBe('it-pr3-renamed');

      // restaura
      await call('update_settings', {
        data: { meta: { ...settings.meta, appName: originalAppName } },
      }, pb);
    });

    it('update_settings com payload inválido → erro do server propaga', async () => {
      await expect(
        call('update_settings', { data: { logs: { maxDays: -5 } } }, pb)
      ).rejects.toBeTruthy();
    });
  });

  // ----------------------------------------------------------------- batch
  describe('batch_records (transacional)', () => {
    // PocketBase >= v0.39 desabilita /api/batch por padrão (settings.batch
    // .enabled=false → 403 "Batch requests are not allowed"). Habilita no
    // server efêmero antes dos cenários (restaura no final do describe).
    let previousBatch: any;
    beforeAll(async () => {
      const settings = JSON.parse(toolText(await call('get_settings', {}, pb)));
      previousBatch = settings.batch;
      const enabled = await call('update_settings', {
        data: { batch: { ...settings.batch, enabled: true } },
      }, pb);
      expect(enabled.isError).toBeFalsy();
    });
    afterAll(async () => {
      if (previousBatch) {
        await call('update_settings', { data: { batch: previousBatch } }, pb).catch(() => {});
      }
    });

    it('create+update em um lote; resultados na ordem', async () => {
      const created = JSON.parse(toolText(await call('create_record', {
        collection: TEST_COLLECTION, data: { title: 'lote-me', status: 'a' },
      }, pb)));

      const result = await call('batch_records', {
        requests: [
          { collection: TEST_COLLECTION, action: 'create', data: { title: 'b1' } },
          { collection: TEST_COLLECTION, action: 'update', id: created.id, data: { status: 'b' } },
        ],
      }, pb);
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(toolText(result));
      expect(parsed.executed).toBe(2);
      expect(parsed.results[1].status).toBe(200);

      // o update transacional valeu
      const fetched = JSON.parse(toolText(await call('fetch_record', {
        collection: TEST_COLLECTION, id: created.id,
      }, pb)));
      expect(fetched.status).toBe('b');
    });

    it('lote com operação inválida → rollback: nada do lote persiste', async () => {
      const before = JSON.parse(toolText(await call('list_records', {
        collection: TEST_COLLECTION, perPage: 500,
      }, pb))).totalItems;

      await expect(
        call('batch_records', {
          requests: [
            { collection: TEST_COLLECTION, action: 'create', data: { title: 'deve-desaparecer' } },
            { collection: TEST_COLLECTION, action: 'update', id: 'naoexistenaobc', data: { title: 'boom' } },
          ],
        }, pb)
      ).rejects.toBeTruthy();

      const after = JSON.parse(toolText(await call('list_records', {
        collection: TEST_COLLECTION, perPage: 500,
      }, pb))).totalItems;
      expect(after).toBe(before); // create do lote falhou junto (transação)
    });

    it('requests vazio → InvalidParams', async () => {
      await expect(call('batch_records', { requests: [] }, pb))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });
  });
});
