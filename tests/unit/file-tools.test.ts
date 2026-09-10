/**
 * file-tools: upload_file, download_file.
 *
 * Inclui BUG-3 do diagnóstico: downloadFile usa pb.files.getUrl() (deprecated
 * no SDK 0.28 — emite console.warn). Em transporte stdio o warn vai para o
 * console do processo e pode corromper o canal JSON-RPC; o comportamento
 * esperado da nova versão é usar pb.files.getURL().
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { handleFileToolCall } from '../../src/tools/file-tools.js';
import { createMockPocketBase, MockPocketBase } from '../fixtures/mock-pocketbase.js';
import { sampleRecord } from '../fixtures/pb-responses.js';
import { itBug, describeBugs, KNOWN_BUGS } from '../fixtures/known-bugs.js';

function textOf(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0].text;
}

describe('file-tools', () => {
  let pb: MockPocketBase;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    pb = createMockPocketBase();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  describe('upload_file', () => {
    it('monta FormData com o campo do schema e o arquivo nomeado, e chama update', async () => {
      const updated = { ...sampleRecord, attachment: 'uploaded.txt' };
      pb.collection('posts').update.mockResolvedValue(updated);

      const result = await handleFileToolCall('upload_file', {
        collection: 'posts',
        recordId: sampleRecord.id,
        fileField: 'attachment',
        fileContent: 'conteúdo do arquivo',
        fileName: 'uploaded.txt',
      }, pb as any);

      expect(pb.collection('posts').update).toHaveBeenCalledTimes(1);
      const [recordId, formData] = pb.collection('posts').update.mock.calls[0];
      expect(recordId).toBe(sampleRecord.id);
      expect(formData).toBeInstanceOf(FormData);

      // FormData nativo do Node >= 18: entradas [nome, valor]
      const entries = Array.from((formData as FormData).entries());
      expect(entries).toHaveLength(1);
      const [fieldName, value] = entries[0];
      expect(fieldName).toBe('attachment');
      expect(value).toBeInstanceOf(Blob);
      expect((value as Blob & { name?: string }).name).toBe('uploaded.txt');
      expect(await (value as Blob).text()).toBe('conteúdo do arquivo');
      expect(textOf(result)).toContain('uploaded successfully');
    });

    it('args faltantes → InvalidParams (todos os 5 são required)', async () => {
      const base = {
        collection: 'posts', recordId: 'r1', fileField: 'f',
        fileContent: 'c', fileName: 'n.txt',
      };
      for (const missing of Object.keys(base)) {
        const args: any = { ...base };
        delete args[missing];
        await expect(
          handleFileToolCall('upload_file', args, pb as any)
        ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
      }
    });
  });

  describe('download_file', () => {
    const recordWithFile = { ...sampleRecord, attachment: 'relatório final.txt' };

    it('busca o record e devolve a URL do arquivo no texto', async () => {
      pb.collection('posts').getOne.mockResolvedValue(recordWithFile);
      pb.files.getUrl.mockReturnValue('http://pb/api/files/posts/rec/relat%C3%B3rio%20final.txt');
      pb.files.getURL.mockReturnValue('http://pb/api/files/posts/rec/relat%C3%B3rio%20final.txt');

      const result = await handleFileToolCall('download_file', {
        collection: 'posts', recordId: sampleRecord.id, fileField: 'attachment',
      }, pb as any);

      expect(pb.collection('posts').getOne).toHaveBeenCalledWith(sampleRecord.id, {});
      expect(textOf(result)).toContain('http://pb/api/files/posts/rec/');
    });

    it('campo de arquivo ausente/vazio no record → InvalidParams', async () => {
      pb.collection('posts').getOne.mockResolvedValue({ ...sampleRecord, attachment: '' });
      await expect(
        handleFileToolCall('download_file', {
          collection: 'posts', recordId: sampleRecord.id, fileField: 'attachment',
        }, pb as any)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    it('args faltantes → InvalidParams (downloadPath NÃO é required — schema atual)', async () => {
      await expect(
        handleFileToolCall('download_file', { collection: 'posts', recordId: 'r1' } as any, pb as any)
      ).rejects.toMatchObject({ code: ErrorCode.InvalidParams });
    });

    describeBugs('BUG-3 — getUrl deprecated (cenário pendente)', () => {
      itBug('download_file deve usar pb.files.getURL (sem console.warn)', async () => {
        pb.collection('posts').getOne.mockResolvedValue(recordWithFile);
        pb.files.getUrl.mockReturnValue('http://pb/x');
        pb.files.getURL.mockReturnValue('http://pb/x');

        await handleFileToolCall('download_file', {
          collection: 'posts', recordId: sampleRecord.id, fileField: 'attachment',
        }, pb as any);

        // EXPECTED (pós-correção): getURL chamado, getUrl NÃO chamado.
        // Estado atual: getUrl é chamado (deprecated, console.warn no SDK real).
        expect(pb.files.getURL, KNOWN_BUGS.BUG3_GETURL).toHaveBeenCalled();
        expect(pb.files.getUrl).not.toHaveBeenCalled();
      });
    });
  });

  it('tool desconhecida do grupo → Error genérico', async () => {
    await expect(
      handleFileToolCall('delete_file', {}, pb as any)
    ).rejects.toThrow(/Unknown file tool/);
  });
});
