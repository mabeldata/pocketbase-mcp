/**
 * record-tools: fetch_record, list_records, create_record, update_record.
 * Comportamento esperado idêntico entre SDK 0.25 e 0.28 (nenhuma quebra de
 * assinatura — diff de .d.mts no diagnóstico).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { ClientResponseError } from 'pocketbase';
import { handleRecordToolCall } from '../../src/tools/record-tools.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';
import {
  sampleRecord, sampleRecordWithExpand, sampleListResult, notFoundError,
} from '../fixtures/pb-responses.js';

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

describe('record-tools', () => {
  let pb: MockPocketBase;

  beforeEach(() => {
    pb = createMockPocketBase();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('fetch_record', () => {
    it('retorna o record como JSON pretty-printed', async () => {
      pb.collection('posts').getOne.mockResolvedValue(sampleRecord);
      const result = await handleRecordToolCall(
        'fetch_record', { collection: 'posts', id: sampleRecord.id }, pb as any
      );
      expect(pb.collection('posts').getOne).toHaveBeenCalledWith(sampleRecord.id);
      expect(textOf(result)).toBe(JSON.stringify(sampleRecord, null, 2));
      expect(result.isError).toBeFalsy();
    });

    it('collection ausente → InvalidParams', async () => {
      await expect(
        handleRecordToolCall('fetch_record', { id: 'x' } as any, pb as any)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('id ausente → InvalidParams', async () => {
      await expect(
        handleRecordToolCall('fetch_record', { collection: 'posts' } as any, pb as any)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('404 do server propaga como ClientResponseError (SDK 0.28 preserva status)', async () => {
      pb.collection('posts').getOne.mockRejectedValue(notFoundError());
      await expect(
        handleRecordToolCall('fetch_record', { collection: 'posts', id: 'nope' }, pb as any)
      ).rejects.toBeInstanceOf(ClientResponseError);
    });
  });

  describe('list_records', () => {
    it('defaults page=1 perPage=30 e repassa filter/sort/expand como undefined', async () => {
      pb.collection('posts').getList.mockResolvedValue(sampleListResult([sampleRecord]));
      await handleRecordToolCall('list_records', { collection: 'posts' }, pb as any);
      expect(pb.collection('posts').getList).toHaveBeenCalledWith(1, 30, {
        filter: undefined, sort: undefined, expand: undefined,
      });
    });

    it('repassa page/perPage/filter/sort/expand fornecidos', async () => {
      pb.collection('posts').getList.mockResolvedValue(sampleListResult([]));
      await handleRecordToolCall('list_records', {
        collection: 'posts', page: 2, perPage: 100,
        filter: "status='active'", sort: '-created', expand: 'author',
      }, pb as any);
      expect(pb.collection('posts').getList).toHaveBeenCalledWith(2, 100, {
        filter: "status='active'", sort: '-created', expand: 'author',
      });
    });

    it('resultado com expand é serializado integralmente (pass-through)', async () => {
      pb.collection('books').getList.mockResolvedValue(sampleListResult([sampleRecordWithExpand]));
      const result = await handleRecordToolCall(
        'list_records', { collection: 'books', expand: 'author' }, pb as any
      );
      const parsed = JSON.parse(textOf(result));
      expect(parsed.items[0].expand.author.name).toBe('Ada Lovelace');
    });

    it('collection ausente → InvalidParams', async () => {
      await expect(
        handleRecordToolCall('list_records', {} as any, pb as any)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });
  });

  describe('create_record', () => {
    it('repassa data integralmente ao client', async () => {
      pb.collection('posts').create.mockResolvedValue(sampleRecord);
      const data = { title: 'Hello', status: 'active', location: { lat: -23.55, lon: -46.63 } };
      await handleRecordToolCall('create_record', { collection: 'posts', data }, pb as any);
      expect(pb.collection('posts').create).toHaveBeenCalledWith(data);
    });

    it('data ausente → InvalidParams', async () => {
      await expect(
        handleRecordToolCall('create_record', { collection: 'posts' } as any, pb as any)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('erro de validação do server (json>1MB v0.28 / id inválido v0.33) propaga', async () => {
      pb.collection('posts').create.mockRejectedValue(notFoundError());
      await expect(
        handleRecordToolCall('create_record', { collection: 'posts', data: {} }, pb as any)
      ).rejects.toBeInstanceOf(ClientResponseError);
    });
  });

  describe('update_record', () => {
    it('chama update(id, data)', async () => {
      pb.collection('posts').update.mockResolvedValue(sampleRecord);
      await handleRecordToolCall(
        'update_record', { collection: 'posts', id: 'rec1', data: { title: 'x' } }, pb as any
      );
      expect(pb.collection('posts').update).toHaveBeenCalledWith('rec1', { title: 'x' });
    });

    it('args faltantes → InvalidParams', async () => {
      await expect(
        handleRecordToolCall('update_record', { collection: 'posts', id: 'rec1' } as any, pb as any)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });
  });

  it('tool desconhecida do grupo → Error genérico', async () => {
    await expect(
      handleRecordToolCall('delete_record', {}, pb as any)
    ).rejects.toThrow(/Unknown record tool/);
  });
});
