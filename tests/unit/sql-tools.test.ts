/**
 * sql-tools: run_sql (PocketBase server >= v0.39, endpoint POST /api/sql).
 *
 * SEGURANÇA (decisão do mantenedor 2026-09-10): a tool é gated pela env
 * POCKETBASE_ENABLE_SQL=true. Bloqueada por padrão: deve retornar isError
 * EXPLICATIVO sem tocar na rede (pb.sql.run nunca chamado).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { handleSqlToolCall, isSqlEnabled } from '../../src/tools/sql-tools.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';
import { makeClientResponseError } from '../fixtures/pb-responses.js';

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

const sampleSqlResult = {
  rows: [['1', 'active']],
  columns: [{ name: 'n', type: 'int4', nullable: false }],
  indexes: [],
  isResult: true,
  execTime: 1234567,
  affectedRows: 0,
};

describe('sql-tools (run_sql — gated)', () => {
  let pb: MockPocketBase;
  let originalEnv: string | undefined;

  beforeEach(() => {
    pb = createMockPocketBase();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    originalEnv = process.env.POCKETBASE_ENABLE_SQL;
    delete process.env.POCKETBASE_ENABLE_SQL;
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.POCKETBASE_ENABLE_SQL;
    else process.env.POCKETBASE_ENABLE_SQL = originalEnv;
  });

  describe('gate de segurança (default bloqueado)', () => {
    it('sem POCKETBASE_ENABLE_SQL → isError explicativo e NENHUMA chamada de rede', async () => {
      expect(isSqlEnabled()).toBe(false);
      const result = await handleSqlToolCall('run_sql', { query: 'SELECT 1' }, pb as any);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/disabled/);
      expect(textOf(result)).toMatch(/POCKETBASE_ENABLE_SQL=true/);
      expect(pb.sql.run).not.toHaveBeenCalled();
    });

    it('POCKETBASE_ENABLE_SQL="1" (não-"true") continua bloqueado — só "true" habilita', async () => {
      process.env.POCKETBASE_ENABLE_SQL = '1';
      const result = await handleSqlToolCall('run_sql', { query: 'SELECT 1' }, pb as any);
      expect(result.isError).toBe(true);
      expect(pb.sql.run).not.toHaveBeenCalled();
    });

    it('POCKETBASE_ENABLE_SQL=true habilita e repassa a query a pb.sql.run', async () => {
      process.env.POCKETBASE_ENABLE_SQL = 'true';
      pb.sql.run.mockResolvedValue(sampleSqlResult);
      const result = await handleSqlToolCall('run_sql', { query: 'SELECT 1' }, pb as any);
      expect(pb.sql.run).toHaveBeenCalledWith('SELECT 1');
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(textOf(result))).toEqual(sampleSqlResult);
    });
  });

  describe('validação (com gate aberto)', () => {
    beforeEach(() => { process.env.POCKETBASE_ENABLE_SQL = 'true'; });

    it('query ausente → InvalidParams', async () => {
      await expect(handleSqlToolCall('run_sql', {}, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      expect(pb.sql.run).not.toHaveBeenCalled();
    });

    it('query não-string → InvalidParams', async () => {
      await expect(handleSqlToolCall('run_sql', { query: 42 }, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('erro do server (ex.: SQL inválido → 400) propaga ClientResponseError', async () => {
      pb.sql.run.mockRejectedValue(makeClientResponseError(400));
      await expect(handleSqlToolCall('run_sql', { query: 'DROP TABLE nope' }, pb as any))
        .rejects.toMatchObject({ status: 400 });
    });
  });

  it('tool desconhecida do grupo → Error genérico', async () => {
    await expect(handleSqlToolCall('sql_exotica', {}, pb as any))
      .rejects.toThrow(/Unknown sql tool/);
  });
});
