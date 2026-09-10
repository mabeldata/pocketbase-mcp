/**
 * backup-tools: list_backups / create_backup / restore_backup (pb.backups.*).
 * restore_backup é destrutiva (substitui TODOS os dados) → exige confirm=true.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { handleBackupToolCall } from '../../src/tools/backup-tools.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';
import { makeClientResponseError } from '../fixtures/pb-responses.js';

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

const sampleBackups = [
  { key: 'pb_data_20260909_101112.zip', size: 1048576, modified: '2026-09-09 10:11:12.000Z' },
  { key: 'pb_data_20260910_080000.zip', size: 2097152, modified: '2026-09-10 08:00:00.000Z' },
];

describe('backup-tools', () => {
  let pb: MockPocketBase;

  beforeEach(() => {
    pb = createMockPocketBase();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('list_backups', () => {
    it('retorna a lista de backups do server', async () => {
      pb.backups.getFullList.mockResolvedValue(sampleBackups);
      const result = await handleBackupToolCall('list_backups', {}, pb as any);
      expect(pb.backups.getFullList).toHaveBeenCalled();
      expect(JSON.parse(textOf(result))).toHaveLength(2);
    });

    it('arguments undefined não crasha (ROB-1)', async () => {
      pb.backups.getFullList.mockResolvedValue([]);
      const result = await handleBackupToolCall('list_backups', undefined as any, pb as any);
      expect(result.isError).toBeFalsy();
    });
  });

  describe('create_backup', () => {
    it('name omitido → basename vazio (server autogera timestamp)', async () => {
      pb.backups.create.mockResolvedValue(true);
      const result = await handleBackupToolCall('create_backup', {}, pb as any);
      expect(pb.backups.create).toHaveBeenCalledWith('');
      expect(JSON.parse(textOf(result)).queued).toBe(true);
    });

    it('name fornecido é repassado', async () => {
      pb.backups.create.mockResolvedValue(true);
      await handleBackupToolCall('create_backup', { name: 'pre_deploy' }, pb as any);
      expect(pb.backups.create).toHaveBeenCalledWith('pre_deploy');
    });
  });

  describe('restore_backup', () => {
    it('sem confirm=true → InvalidParams e NENHUMA chamada de rede', async () => {
      await expect(handleBackupToolCall('restore_backup', { key: 'a.zip' }, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      expect(pb.backups.restore).not.toHaveBeenCalled();
    });

    it('confirm=false explícito também bloqueia', async () => {
      await expect(handleBackupToolCall('restore_backup', { key: 'a.zip', confirm: false }, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      expect(pb.backups.restore).not.toHaveBeenCalled();
    });

    it('key ausente → InvalidParams', async () => {
      await expect(handleBackupToolCall('restore_backup', { confirm: true }, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('confirm=true executa o restore e reporta a key', async () => {
      pb.backups.restore.mockResolvedValue(true);
      const result = await handleBackupToolCall(
        'restore_backup', { key: 'pb_data_x.zip', confirm: true }, pb as any
      );
      expect(pb.backups.restore).toHaveBeenCalledWith('pb_data_x.zip');
      expect(JSON.parse(textOf(result))).toEqual({ restored: true, key: 'pb_data_x.zip' });
    });

    it('erro do server (backup inexistente → 404) propaga', async () => {
      pb.backups.restore.mockRejectedValue(makeClientResponseError(404));
      await expect(handleBackupToolCall(
        'restore_backup', { key: 'nope.zip', confirm: true }, pb as any
      )).rejects.toMatchObject({ status: 404 });
    });
  });

  it('tool desconhecida do grupo → Error genérico', async () => {
    await expect(handleBackupToolCall('delete_backup', {}, pb as any))
      .rejects.toThrow(/Unknown backup tool/);
  });
});
