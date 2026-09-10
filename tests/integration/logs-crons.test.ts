/**
 * INTEGRAÇÃO — logs (list_logs / get_log / get_logs_stats) e crons
 * (list_cron_jobs / run_cron_job) contra PocketBase REAL v0.40.x.
 *
 * Comportamentos validados empiricamente no binário v0.40.3 (probe 2026-09-10):
 * - logs de request têm flush ASSÍNCRONO (~2-4s após o request)
 * - shape do log: { id, created, level, message, data: { method, url, status,
 *   execTime, remoteIP, type: 'request', ... } }
 * - filters válidos em logs: level>=N, data.status>=N, message~'...'
 *   (filtro em "method" puro → 400; o campo vive em data.method)
 * - stats: [{ date, total }]
 * - crons v0.40: [{ id, expression }] com jobs __pbDBOptimize__, __pbMFACleanup__,
 *   __pbOTPCleanup__, __pbLogsCleanup__ (deleteOldLogs NÃO existe mais)
 *
 * Cobre também a regressão do BUG-2 (sort ignorado) contra server real.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import PocketBase from 'pocketbase';
import { handleToolCall } from '../../src/tools/index.js';
import { integrationSkipReason, createIntegrationClient, integrationUrl } from './helpers.js';
import { itBug, describeBugs, KNOWN_BUGS } from '../fixtures/known-bugs.js';

const skipReason = integrationSkipReason();
const describeI = skipReason ? describe.skip : describe;

function toolText(result: any): string {
  return result.content[0].text;
}

async function call(name: string, args: Record<string, unknown>, pb: PocketBase) {
  return handleToolCall({ name, arguments: args } as any, pb);
}

/** Espera os logs de request fazerem flush (assíncrono no v0.40: ~2-4s). */
async function waitForLogs(pb: PocketBase, minItems = 1, timeoutMs = 20_000): Promise<any> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const parsed = JSON.parse(toolText(await call('list_logs', { perPage: 100 }, pb)));
    if (parsed.totalItems >= minItems) return parsed;
    await new Promise(r => setTimeout(r, 500));
  }
  return JSON.parse(toolText(await call('list_logs', { perPage: 100 }, pb)));
}

describeI('integração — logs via tools MCP', () => {
  let pb: PocketBase;

  beforeAll(async () => {
    pb = createIntegrationClient();
    // gera requests variados (200 + 404) para popular /api/logs
    for (let i = 0; i < 4; i++) {
      await fetch(`${integrationUrl()}/api/health`).catch(() => {});
      await pb.collections.getList(1, 1).catch(() => {});
    }
    await fetch(`${integrationUrl()}/api/collections/naoexiste_xyz`).catch(() => {}); // 404
    await waitForLogs(pb, 1);
  });

  it('list_logs retorna página de logs reais (formato v0.40: data.method/data.status)', async () => {
    const parsed = await waitForLogs(pb, 1);
    expect(parsed.page).toBe(1);
    expect(Array.isArray(parsed.items)).toBe(true);
    expect(parsed.totalItems).toBeGreaterThan(0);
    const item = parsed.items[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('level');
    expect(item).toHaveProperty('message');
    expect(item.data).toHaveProperty('method');
    expect(item.data).toHaveProperty('status');
    expect(item.data.type).toBe('request');
  });

  it('list_logs com filter real válido (data.status>=400 pega o 404 gerado)', async () => {
    const result = await call('list_logs', { filter: 'data.status>=400', perPage: 50 }, pb);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(toolText(result));
    expect(parsed.totalItems).toBeGreaterThan(0);
    for (const item of parsed.items) {
      expect(item.data.status).toBeGreaterThanOrEqual(400);
    }
  });

  it('list_logs com filter INVÁLIDO (campo inexistente "method") → ClientResponseError 400 propaga', async () => {
    // comportamento real do v0.40.3: filtro em campo não-indexado/inexistente
    // devolve 400 — a tool propaga (sem catch interno em listLogs)
    await expect(
      call('list_logs', { filter: "method='GET'" }, pb)
    ).rejects.toMatchObject({ status: 400 });
  });

  it('get_log retorna um log específico por id', async () => {
    const parsed = await waitForLogs(pb, 1);
    const id = parsed.items[0].id;
    const result = await call('get_log', { id }, pb);
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(toolText(result)).id).toBe(id);
  });

  it('get_logs_stats retorna [{date,total}] (shape real v0.40)', async () => {
    const result = await call('get_logs_stats', {}, pb);
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(toolText(result));
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty('total');
      expect(parsed[0]).toHaveProperty('date');
    }
  });

  describeBugs('BUG-2 (regressão contra server real)', () => {
    itBug("sort de list_logs deve ordenar de verdade (hoje é ignorado)", async () => {
      await waitForLogs(pb, 2);
      const asc = JSON.parse(toolText(await call('list_logs', { sort: 'created', perPage: 50 }, pb)));
      const desc = JSON.parse(toolText(await call('list_logs', { sort: '-created', perPage: 50 }, pb)));
      expect(asc.totalItems).toBeGreaterThanOrEqual(2);
      // EXPECTED (pós-correção): ordens opostas → primeiro id difere.
      // Estado atual: sort ignorado → mesmas ordens (KNOWN_BUGS.BUG2_LOG_SORT).
      expect(asc.items[0].id, KNOWN_BUGS.BUG2_LOG_SORT).not.toBe(desc.items[0].id);
    });
  });
});

describeI('integração — crons via tools MCP', () => {
  let pb: PocketBase;

  beforeAll(() => {
    pb = createIntegrationClient();
  });

  it('list_cron_jobs retorna os jobs built-in do server v0.40 ([{id,expression}])', async () => {
    const result = await call('list_cron_jobs', {}, pb);
    expect(result.isError).toBeFalsy();
    const jobs = JSON.parse(toolText(result));
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
    const ids = jobs.map((j: any) => j.id);
    // jobs internos do v0.40 (deleteOldLogs foi renomeado/removido; o cleanup
    // de logs agora é __pbLogsCleanup__)
    expect(ids).toContain('__pbLogsCleanup__');
    for (const j of jobs) {
      expect(j).toHaveProperty('id');
      expect(j).toHaveProperty('expression');
    }
  });

  it('run_cron_job dispara __pbLogsCleanup__ sem erro', async () => {
    const result = await call('run_cron_job', { jobId: '__pbLogsCleanup__' }, pb);
    expect(result.isError).toBeFalsy();
    expect(toolText(result)).toBe('true');
  });

  it('run_cron_job com jobId inexistente → erro propagado (404)', async () => {
    await expect(
      call('run_cron_job', { jobId: 'job_nao_existe_xyz' }, pb)
    ).rejects.toMatchObject({ status: 404 });
  });
});
