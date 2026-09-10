/**
 * admin-tools: get_collection_scaffolds / dry_run_view_query (v0.37+) e
 * batch_records (POST /api/batch via pb.createBatch, transacional).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { handleAdminToolCall } from '../../src/tools/admin-tools.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';
import { makeClientResponseError } from '../fixtures/pb-responses.js';
import { sampleCollectionV40 } from '../fixtures/pb-responses.js';

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

describe('admin-tools', () => {
  let pb: MockPocketBase;

  beforeEach(() => {
    pb = createMockPocketBase();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('get_collection_scaffolds', () => {
    it('scaffolds devolve o objeto template por tipo (shape real v0.37+)', async () => {
      pb.collections.getScaffolds.mockResolvedValue({ base: sampleCollectionV40 });
      const result = await handleAdminToolCall('get_collection_scaffolds', {}, pb as any);
      expect(pb.collections.getScaffolds).toHaveBeenCalled();
      expect(JSON.parse(textOf(result)).base.name).toBe('posts');
    });

    it('arguments undefined não crasha (ROB-1)', async () => {
      pb.collections.getScaffolds.mockResolvedValue([]);
      const result = await handleAdminToolCall('get_collection_scaffolds', undefined as any, pb as any);
      expect(result.isError).toBeFalsy();
    });
  });

  describe('dry_run_view_query', () => {
    it('repassa a query e devolve fields+sample validados (shape real v0.37+)', async () => {
      const viewResult = { fields: [{ name: 'id', type: 'text' }], indexes: [], sample: [{ id: 'r1' }] };
      pb.collections.dryRunViewQuery.mockResolvedValue(viewResult);
      const result = await handleAdminToolCall(
        'dry_run_view_query', { query: 'SELECT id FROM posts' }, pb as any
      );
      expect(pb.collections.dryRunViewQuery).toHaveBeenCalledWith('SELECT id FROM posts');
      expect(JSON.parse(textOf(result)).fields[0].name).toBe('id');
    });

    it('query ausente → InvalidParams', async () => {
      await expect(handleAdminToolCall('dry_run_view_query', {}, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('query inválida → ClientResponseError 400 do server propaga', async () => {
      pb.collections.dryRunViewQuery.mockRejectedValue(makeClientResponseError(400));
      await expect(handleAdminToolCall('dry_run_view_query', { query: 'SELECT nope' }, pb as any))
        .rejects.toMatchObject({ status: 400 });
    });
  });

  describe('batch_records', () => {
    it('empilha create/update/delete por collection e reporta os resultados na ordem', async () => {
      const result = await handleAdminToolCall('batch_records', {
        requests: [
          { collection: 'posts', action: 'create', data: { title: 'a' } },
          { collection: 'posts', action: 'update', id: 'rec1', data: { title: 'b' } },
          { collection: 'tags', action: 'delete', id: 'tag1' },
        ],
      }, pb as any);
      expect(pb.createBatch).toHaveBeenCalledTimes(1);
      // ordem + verbos corretos na fila do batch
      expect(pb.__batchRequests).toEqual([
        { collection: 'posts', method: 'POST', data: { title: 'a' } },
        { collection: 'posts', method: 'PATCH', id: 'rec1', data: { title: 'b' } },
        { collection: 'tags', method: 'DELETE', id: 'tag1' },
      ]);
      const parsed = JSON.parse(textOf(result));
      expect(parsed.executed).toBe(3);
      expect(parsed.results[2].status).toBe(204);
    });

    it('upsert com id injeta id no body (semântica do SDK: bodyParams.id decide update-vs-create)', async () => {
      await handleAdminToolCall('batch_records', {
        requests: [{ collection: 'posts', action: 'upsert', id: 'rec1', data: { title: 'c' } }],
      }, pb as any);
      expect(pb.__batchRequests[0].method).toBe('PUT');
      expect(pb.__batchRequests[0].data).toEqual({ title: 'c', id: 'rec1' });
    });

    it('requests ausente/vazio → InvalidParams', async () => {
      await expect(handleAdminToolCall('batch_records', {}, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      await expect(handleAdminToolCall('batch_records', { requests: [] }, pb as any))
        .rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      expect(pb.createBatch).not.toHaveBeenCalled();
    });

    it('action desconhecida → InvalidParams com índice do item', async () => {
      await expect(handleAdminToolCall('batch_records', {
        requests: [{ collection: 'posts', action: 'merge' }],
      }, pb as any)).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('update/delete sem id → InvalidParams', async () => {
      await expect(handleAdminToolCall('batch_records', {
        requests: [{ collection: 'posts', action: 'update', data: {} }],
      }, pb as any)).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      await expect(handleAdminToolCall('batch_records', {
        requests: [{ collection: 'posts', action: 'delete' }],
      }, pb as any)).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('falha do server no batch (400 → rollback) propaga', async () => {
      pb.collection('posts').create.mockImplementation(() => {});
      const err = makeClientResponseError(400);
      pb.createBatch.mockImplementation(() => ({
        collection: () => ({ create: () => {}, update: () => {}, upsert: () => {}, delete: () => {} }),
        send: () => Promise.reject(err),
      }));
      await expect(handleAdminToolCall('batch_records', {
        requests: [{ collection: 'posts', action: 'create', data: {} }],
      }, pb as any)).rejects.toBe(err);
    });
  });

  it('tool desconhecida do grupo → Error genérico', async () => {
    await expect(handleAdminToolCall('magic_tool', {}, pb as any))
      .rejects.toThrow(/Unknown admin tool/);
  });
});
