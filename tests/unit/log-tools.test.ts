/**
 * log-tools: list_logs, get_log, get_logs_stats.
 *
 * Inclui BUG-2 do diagnóstico: 'sort' está declarado no inputSchema de
 * list_logs mas nunca é repassado a pb.logs.getList.
 * Inclui ROB-1: list_logs/get_logs_stats com arguments undefined (schema sem
 * required) crasham com TypeError — devem aceitar e usar defaults.
 *
 * Cobertura nova versão (v0.40): Log.Data truncado com marcador
 * __pb_truncated__ é pass-through (serialização fiel), e o SDK 0.28 expõe
 * pb.logs.truncate() (oportunidade aditiva — não testada aqui por não existir
 * tool; ver TESTS.md).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { handleLogToolCall } from '../../src/tools/log-tools.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';
import {
  sampleLog, sampleLogsStats, sampleListResult, sampleTruncatedLogData, makeClientResponseError,
} from '../fixtures/pb-responses.js';
import { itBug, describeBugs, KNOWN_BUGS } from '../fixtures/known-bugs.js';

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

describe('log-tools', () => {
  let pb: MockPocketBase;

  beforeEach(() => {
    pb = createMockPocketBase();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('list_logs', () => {
    it('defaults page=1 perPage=30', async () => {
      pb.logs.getList.mockResolvedValue(sampleListResult([sampleLog]));
      await handleLogToolCall('list_logs', {}, pb as any);
      expect(pb.logs.getList).toHaveBeenCalledWith(1, 30, { filter: undefined });
    });

    it('repassa page/perPage/filter', async () => {
      pb.logs.getList.mockResolvedValue(sampleListResult([]));
      await handleLogToolCall('list_logs', {
        page: 3, perPage: 50, filter: "method='GET'",
      }, pb as any);
      expect(pb.logs.getList).toHaveBeenCalledWith(3, 50, { filter: "method='GET'" });
    });

    it('serializa Log.Data truncado (v0.40) fielmente — marcador __pb_truncated__ visível ao consumidor', async () => {
      const truncatedLog = { ...sampleLog, data: sampleTruncatedLogData };
      pb.logs.getList.mockResolvedValue(sampleListResult([truncatedLog]));
      const result = await handleLogToolCall('list_logs', {}, pb as any);
      const parsed = JSON.parse(textOf(result));
      expect(parsed.items[0].data.__pb_truncated__).toBe(true);
    });

    describeBugs('BUG-2 — sort não repassado (cenário pendente)', () => {
      itBug("list_logs deve repassar 'sort' a pb.logs.getList", async () => {
        pb.logs.getList.mockResolvedValue(sampleListResult([]));
        await handleLogToolCall('list_logs', { sort: '-created,url' }, pb as any);
        // EXPECTED (pós-correção): options inclui sort.
        // Estado atual: sort é ignorado (KNOWN_BUGS.BUG2_LOG_SORT).
        expect(pb.logs.getList).toHaveBeenCalledWith(1, 30, {
          filter: undefined, sort: '-created,url',
        });
        void KNOWN_BUGS.BUG2_LOG_SORT;
      });
    });

    describeBugs('ROB-1 — args undefined (cenário pendente)', () => {
      itBug('list_logs sem arguments não deve crashar (schema sem required)', async () => {
        pb.logs.getList.mockResolvedValue(sampleListResult([]));
        // EXPECTED (pós-correção): args undefined tratado com defaults.
        // Estado atual: destructuring de undefined lança TypeError.
        const result = await handleLogToolCall('list_logs', undefined as any, pb as any);
        expect(result.isError).toBeFalsy();
        void KNOWN_BUGS.ROB1_UNDEFINED_ARGS;
      });
    });
  });

  describe('get_log', () => {
    it('retorna o log por id', async () => {
      pb.logs.getOne.mockResolvedValue(sampleLog);
      const result = await handleLogToolCall('get_log', { id: sampleLog.id }, pb as any);
      expect(pb.logs.getOne).toHaveBeenCalledWith(sampleLog.id);
      expect(JSON.parse(textOf(result)).id).toBe(sampleLog.id);
    });

    it('id ausente → InvalidParams', async () => {
      await expect(
        handleLogToolCall('get_log', {} as any, pb as any)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });
  });

  describe('get_logs_stats', () => {
    it('repassa filter e retorna stats', async () => {
      pb.logs.getStats.mockResolvedValue(sampleLogsStats);
      const result = await handleLogToolCall('get_logs_stats', { filter: "status>=400" }, pb as any);
      expect(pb.logs.getStats).toHaveBeenCalledWith({ filter: "status>=400" });
      expect(JSON.parse(textOf(result))).toHaveLength(2);
    });

    it('erro do client → resultado isError:true com mensagem descritiva (não lança)', async () => {
      pb.logs.getStats.mockRejectedValue(makeClientResponseError(403));
      const result = await handleLogToolCall('get_logs_stats', {}, pb as any);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/Error fetching log stats/);
    });

    it('erro não-Error é relançado (comportamento atual documentado)', async () => {
      pb.logs.getStats.mockRejectedValue('string error');
      await expect(
        handleLogToolCall('get_logs_stats', {}, pb as any)
      ).rejects.toBe('string error');
    });
  });

  it('tool desconhecida do grupo → Error genérico', async () => {
    await expect(
      handleLogToolCall('truncate_logs', {}, pb as any)
    ).rejects.toThrow(/Unknown log tool/);
  });
});
