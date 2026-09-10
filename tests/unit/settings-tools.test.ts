/**
 * settings-tools: get_settings / update_settings (pb.settings.*).
 * Payloads no formato v0.40 (keys por seção: meta, logs, smtp, ...).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { handleSettingsToolCall } from '../../src/tools/settings-tools.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';
import { makeClientResponseError } from '../fixtures/pb-responses.js';

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

const sampleSettings = {
  meta: { appName: 'PocketBase', appUrl: 'http://127.0.0.1:8090', senderName: 'PocketBase', senderAddress: 'test@example.io' },
  logs: { maxDays: 7 },
  smtp: { enabled: false, host: '', port: 587, secret: '******' },
};

describe('settings-tools', () => {
  let pb: MockPocketBase;

  beforeEach(() => {
    pb = createMockPocketBase();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('get_settings', () => {
    it('retorna o payload completo com segredos mascarados (******) pass-through', async () => {
      pb.settings.getAll.mockResolvedValue(sampleSettings);
      const result = await handleSettingsToolCall('get_settings', {}, pb as any);
      const parsed = JSON.parse(textOf(result));
      expect(parsed.meta.appName).toBe('PocketBase');
      expect(parsed.smtp.secret).toBe('******');
    });

    it('arguments undefined não crasha (ROB-1)', async () => {
      pb.settings.getAll.mockResolvedValue({});
      const result = await handleSettingsToolCall('get_settings', undefined as any, pb as any);
      expect(result.isError).toBeFalsy();
    });
  });

  describe('update_settings', () => {
    it('repassa o payload parcial (PATCH semantics) e devolve o resultado', async () => {
      const data = { logs: { maxDays: 14 } };
      pb.settings.update.mockResolvedValue({ ...sampleSettings, logs: { maxDays: 14 } });
      const result = await handleSettingsToolCall('update_settings', { data }, pb as any);
      expect(pb.settings.update).toHaveBeenCalledWith(data);
      expect(JSON.parse(textOf(result)).logs.maxDays).toBe(14);
    });

    it('data ausente → InvalidParams', async () => {
      await expect(handleSettingsToolCall('update_settings', {}, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      expect(pb.settings.update).not.toHaveBeenCalled();
    });

    it('data não-objeto / array → InvalidParams', async () => {
      await expect(handleSettingsToolCall('update_settings', { data: 'x' }, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      await expect(handleSettingsToolCall('update_settings', { data: [] }, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('erro do server (payload inválido → 400) propaga', async () => {
      pb.settings.update.mockRejectedValue(makeClientResponseError(400));
      await expect(handleSettingsToolCall('update_settings', { data: { logs: { maxDays: -1 } } }, pb as any))
        .rejects.toMatchObject({ status: 400 });
    });
  });

  it('tool desconhecida do grupo → Error genérico', async () => {
    await expect(handleSettingsToolCall('delete_settings', {}, pb as any))
      .rejects.toThrow(/Unknown settings tool/);
  });
});
