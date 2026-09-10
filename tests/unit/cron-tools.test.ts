/**
 * cron-tools: list_cron_jobs, run_cron_job.
 * Assinaturas idênticas no SDK 0.28.1 (verificado no diff de .d.mts do
 * diagnóstico); crons exigem PocketBase >= v0.24.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { handleCronToolCall } from '../../src/tools/cron-tools.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';
import { sampleCronJob, makeClientResponseError } from '../fixtures/pb-responses.js';

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

describe('cron-tools', () => {
  let pb: MockPocketBase;

  beforeEach(() => {
    pb = createMockPocketBase();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('list_cron_jobs', () => {
    it('repassa fields e retorna a lista', async () => {
      pb.crons.getFullList.mockResolvedValue([sampleCronJob]);
      const result = await handleCronToolCall('list_cron_jobs', { fields: '*,expand.x' }, pb as any);
      expect(pb.crons.getFullList).toHaveBeenCalledWith({ fields: '*,expand.x' });
      expect(JSON.parse(textOf(result))[0].id).toBe('deleteOldLogs');
    });

    it('sem fields → getFullList com fields undefined', async () => {
      pb.crons.getFullList.mockResolvedValue([]);
      await handleCronToolCall('list_cron_jobs', {}, pb as any);
      expect(pb.crons.getFullList).toHaveBeenCalledWith({ fields: undefined });
    });

    it('erro do client (ex.: server < v0.24 sem /api/crons → 404) → isError:true', async () => {
      pb.crons.getFullList.mockRejectedValue(makeClientResponseError(404));
      const result = await handleCronToolCall('list_cron_jobs', {}, pb as any);
      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/Error fetching cron list/);
    });
  });

  describe('run_cron_job', () => {
    it('chama crons.run(jobId) e serializa o resultado', async () => {
      pb.crons.run.mockResolvedValue(true);
      const result = await handleCronToolCall('run_cron_job', { jobId: 'deleteOldLogs' }, pb as any);
      expect(pb.crons.run).toHaveBeenCalledWith('deleteOldLogs');
      expect(textOf(result)).toBe('true');
    });

    it('jobId ausente → InvalidParams', async () => {
      await expect(
        handleCronToolCall('run_cron_job', {} as any, pb as any)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('erro do client propaga (run não tem catch interno)', async () => {
      pb.crons.run.mockRejectedValue(makeClientResponseError(400));
      await expect(
        handleCronToolCall('run_cron_job', { jobId: 'nope' }, pb as any)
      ).rejects.toThrow();
    });
  });

  it('tool desconhecida do grupo → Error genérico', async () => {
    await expect(
      handleCronToolCall('stop_cron_job', {}, pb as any)
    ).rejects.toThrow(/Unknown cron tool/);
  });
});
