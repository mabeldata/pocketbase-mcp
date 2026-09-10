/**
 * collection-tools: get_collection_schema, list_collections.
 * Fixtures no formato do server v0.40 (fields, indexes normalizados v0.38.1+,
 * geoPoint v0.27+) — pass-through JSON, sem mudança de código necessária.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { handleCollectionToolCall } from '../../src/tools/collection-tools.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';
import { sampleCollectionV40 } from '../fixtures/pb-responses.js';

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

describe('collection-tools', () => {
  let pb: MockPocketBase;

  beforeEach(() => {
    pb = createMockPocketBase();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('get_collection_schema', () => {
    it('retorna o schema v0.40 integralmente (fields + indexes + geoPoint)', async () => {
      pb.collections.getOne.mockResolvedValue(sampleCollectionV40);
      const result = await handleCollectionToolCall(
        'get_collection_schema', { collection: 'posts' }, pb as any
      );
      expect(pb.collections.getOne).toHaveBeenCalledWith('posts');
      const parsed = JSON.parse(textOf(result));
      expect(parsed.fields.some((f: any) => f.type === 'geoPoint')).toBe(true);
      expect(Array.isArray(parsed.indexes)).toBe(true);
      expect(parsed.indexes[0]).toMatch(/^CREATE INDEX/);
    });

    it('collection ausente → InvalidParams', async () => {
      await expect(
        handleCollectionToolCall('get_collection_schema', {} as any, pb as any)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });
  });

  describe('list_collections', () => {
    it('usa getFullList com sort -created e ignora args', async () => {
      pb.collections.getFullList.mockResolvedValue([sampleCollectionV40]);
      const result = await handleCollectionToolCall(
        'list_collections', { qualquer: 'coisa' } as any, pb as any
      );
      expect(pb.collections.getFullList).toHaveBeenCalledWith({ sort: '-created' });
      expect(JSON.parse(textOf(result))).toHaveLength(1);
    });

    it('aceita args undefined (schema sem propriedades)', async () => {
      pb.collections.getFullList.mockResolvedValue([]);
      const result = await handleCollectionToolCall('list_collections', undefined as any, pb as any);
      expect(result.isError).toBeFalsy();
      expect(JSON.parse(textOf(result))).toEqual([]);
    });
  });

  it('tool desconhecida do grupo → Error genérico', async () => {
    await expect(
      handleCollectionToolCall('delete_collection', {}, pb as any)
    ).rejects.toThrow(/Unknown collection tool/);
  });
});
