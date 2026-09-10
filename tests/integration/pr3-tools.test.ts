/**
 * INTEGRAÇÃO — PR-3: tools aditivas v0.37–v0.40 via handleToolCall contra
 * PocketBase REAL (matriz CI: v0.39.11 e v0.40.3).
 *
 * INSTÂNCIA DEDICADA: este arquivo sobe o SEU próprio PocketBase ephemero
 * (tests/integration/dedicated-server.ts) em vez de usar o server
 * compartilhado da suíte. Fato observado (não totalmente elucidado): com o
 * server compartilhado, a carga do PR-3 (DELETE /api/logs, POST /api/sql,
 * /api/batch transacional, backups em fila, PATCH /api/settings) deixava o
 * server inteiro sem responder em CI Node 18.x/20.x (health + reads +
 * writes todos travando; migrations-rest/files/auth-health estouravam
 * timeouts em cascata) — reproduzido localmente sob Node 20, nunca sob
 * Node ≥22, e NUNCA com instância dedicada (padrão do scripts/smoke.mjs,
 * verde em todas as versões). O mecanismo exato não foi isolado (exclusões
 * de um único grupo não evitavam o hang — parece ser efeito cumulativo da
 * carga/sessão sobre o boot compartilhado), então a correção é estrutural:
 * isolar o boot contém qualquer interferência neste arquivo.
 *
 * Cobre:
 * - delete_record          (CRUD completo com 404 pós-delete)
 * - truncate_logs          (server >= v0.40; em v0.39 o 404 do endpoint
 *                           inexistente deve propagar como erro)
 * - run_sql                (gate POCKETBASE_ENABLE_SQL: bloqueado sem env;
 *                           com env, executa SELECT real no v0.39+)
 * - get_collection_scaffolds / dry_run_view_query (v0.37+)
 * - list_backups / create_backup / restore_backup (incl. o ciclo real
 *                           create→list→restore→sanity — agora seguro: o
 *                           server é deste arquivo e o restore roda no fim)
 * - get_settings / update_settings (round-trip de meta.appName; habilita
 *                           batch no server antes dos cenários de lote)
 * - batch_records          (create+update+delete transacional + rollback)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import PocketBase from 'pocketbase';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { handleToolCall } from '../../src/tools/index.js';
import { integrationSkipReason } from './helpers.js';
import { startDedicatedPocketBase, DedicatedServer } from './dedicated-server.js';

const skipReason = integrationSkipReason();
const describeI = skipReason ? describe.skip : describe;

const TEST_COLLECTION = 'it_pr3_posts';

function toolText(result: any): string {
  return result.content[0].text;
}

async function call(name: string, args: Record<string, unknown>, pb: PocketBase) {
  return handleToolCall({ name, arguments: args } as any, pb);
}

describeI('integração — PR-3 tools aditivas via MCP (instância dedicada)', () => {
  let srv: DedicatedServer;
  let pb: PocketBase;

  /** true se a versão do server é >= min (ex.: gte(minor 40)). */
  function serverAtLeast(minMinor: number): boolean {
    const m = srv.version.match(/v?0\.(\d+)/);
    return m ? Number(m[1]) >= minMinor : true; // versão desconhecida: assume latest
  }

  beforeAll(async () => {
    const started = await startDedicatedPocketBase();
    if (!started) throw new Error('binário PocketBase indisponível para a instância dedicada');
    srv = started;
    pb = srv.client;
    await pb.collections.create({
      name: TEST_COLLECTION,
      type: 'base',
      fields: [
        { name: 'title', type: 'text', required: true },
        { name: 'status', type: 'text', required: false },
      ],
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    });
  }, 180_000);

  afterAll(async () => {
    await srv?.stop();
  }, 60_000);

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
      await fetch(`${srv.url}/api/health`).catch(() => {});

      if (serverAtLeast(40)) {
        const result = await call('truncate_logs', { confirm: true }, pb);
        expect(result.isError).toBeFalsy();
        expect(JSON.parse(toolText(result)).truncated).toBe(true);
      } else {
        // v0.39: endpoint DELETE /api/logs não existe → erro 404 propaga
        await expect(
          call('truncate_logs', { confirm: true }, pb)
        ).rejects.toMatchObject({ status: 404 });
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
    // .enabled=false → 403 "Batch requests are not allowed"). Habilita na
    // instância dedicada antes dos cenários.
    beforeAll(async () => {
      const settings = JSON.parse(toolText(await call('get_settings', {}, pb)));
      const enabled = await call('update_settings', {
        data: { batch: { ...settings.batch, enabled: true } },
      }, pb);
      expect(enabled.isError).toBeFalsy();
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

  // --------------------------------------------------------------- backups
  // POR ÚLTIMO: restore_backup troca o data.db da instância dedicada (o
  // server é só deste arquivo — irmãos não são afetados).
  describe('list_backups / create_backup / restore_backup (ciclo real)', () => {
    it('create_backup enfileira, list_backups mostra, restore confirma e a instância segue saudável', async () => {
      const created = await call('create_backup', { name: 'it_pr3_cycle.zip' }, pb);
      expect(created.isError).toBeFalsy();
      expect(JSON.parse(toolText(created)).queued).toBe(true);

      let key: string | null = null;
      const start = Date.now();
      while (Date.now() - start < 30_000 && !key) {
        const listed = JSON.parse(toolText(await call('list_backups', {}, pb)));
        key = listed.find((b: any) => b.key === 'it_pr3_cycle.zip')?.key || null;
        if (!key) await new Promise(r => setTimeout(r, 1000));
      }
      expect(key, 'backup não apareceu em list_backups').toBe('it_pr3_cycle.zip');

      // travas de confirmação
      await expect(
        call('restore_backup', { key: key!, confirm: false }, pb)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      await expect(
        call('restore_backup', { key: 'nao_existe.zip', confirm: true }, pb)
      ).rejects.toMatchObject({ status: 400 });

      // restore real
      const restored = await call('restore_backup', { key: key!, confirm: true }, pb);
      expect(restored.isError).toBeFalsy();
      expect(JSON.parse(toolText(restored))).toMatchObject({ restored: true, key: key });

      // sanity pós-restore no server dedicado: coleção de teste ainda existe
      const cols = JSON.parse(toolText(await call('list_collections', {}, pb)));
      expect(cols.map((c: any) => c.name)).toContain(TEST_COLLECTION);
    }, 120_000);

    it('create_backup com nome inválido (sem .zip) → 400 de validação, nada enfileira', async () => {
      await expect(
        call('create_backup', { name: 'invalid name' }, pb)
      ).rejects.toMatchObject({ status: 400 });
    });
  });
});
