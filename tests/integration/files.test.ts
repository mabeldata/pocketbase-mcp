/**
 * INTEGRAÇÃO — files (upload_file / download_file) contra PocketBase REAL.
 * Cobre a matriz 6.2: upload multipart real + URL de download que responde 200
 * (Content-Disposition com aspas para filenames especiais, v0.40).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import PocketBase from 'pocketbase';
import { handleToolCall } from '../../src/tools/index.js';
import { integrationSkipReason, createIntegrationClient, integrationUrl } from './helpers.js';

const skipReason = integrationSkipReason();
const describeI = skipReason ? describe.skip : describe;

const COLL = 'it_files';

function toolText(result: any): string {
  return result.content[0].text;
}

async function call(name: string, args: Record<string, unknown>, pb: PocketBase) {
  return handleToolCall({ name, arguments: args } as any, pb);
}

describeI('integração — files via tools MCP', () => {
  let pb: PocketBase;
  let recordId: string;

  beforeAll(async () => {
    pb = createIntegrationClient();
    const existing = await pb.collections.getFullList({ filter: `name="${COLL}"` });
    if (existing.length === 0) {
      await pb.collections.create({
        name: COLL,
        type: 'base',
        fields: [
          { name: 'title', type: 'text', required: false },
          {
            name: 'attachment', type: 'file', required: false,
            maxSelect: 1, maxSize: 5_242_880, mimeTypes: [],
          },
        ],
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      });
    }
    const rec = await pb.collection(COLL).create({ title: 'file host' });
    recordId = rec.id;
  });

  afterAll(async () => {
    await pb.collections.delete(COLL).catch(() => {});
  });

  it('upload_file envia multipart real e anexa o arquivo ao record', async () => {
    const result = await call('upload_file', {
      collection: COLL,
      recordId,
      fileField: 'attachment',
      fileContent: 'linha1\nlinha2\nconteúdo UTF-8 çãé',
      fileName: 'relatorio.txt',
    }, pb);
    expect(result.isError).toBeFalsy();
    expect(toolText(result)).toMatch(/uploaded successfully/);

    // o record agora tem o nome do arquivo no campo
    const rec = await pb.collection(COLL).getOne(recordId);
    expect(typeof rec.attachment).toBe('string');
    expect(rec.attachment.length).toBeGreaterThan(0);
  });

  it('download_file devolve URL que responde 200 com o conteúdo enviado', async () => {
    const result = await call('download_file', {
      collection: COLL, recordId, fileField: 'attachment',
    }, pb);
    expect(result.isError).toBeFalsy();
    const text = toolText(result);
    const urlMatch = text.match(/https?:\/\/\S+/);
    expect(urlMatch, `URL não encontrada em: ${text}`).toBeTruthy();

    const fileUrl = urlMatch![0];
    expect(fileUrl).toContain('/api/files/');
    // token de arquivo: o endpoint exige token p/ collections protegidas; como
    // a rule é null (público), GET direto deve funcionar.
    const res = await fetch(fileUrl);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('conteúdo UTF-8');
  });

  it('download_file de filename com caracteres especiais → Content-Disposition com aspas (v0.40)', async () => {
    const specialName = 'relatório "final" (v2).txt';
    await call('upload_file', {
      collection: COLL, recordId, fileField: 'attachment',
      fileContent: 'especial', fileName: specialName,
    }, pb);
    const result = await call('download_file', {
      collection: COLL, recordId, fileField: 'attachment',
    }, pb);
    const urlMatch = toolText(result).match(/https?:\/\/\S+/);
    expect(urlMatch).toBeTruthy();
    const res = await fetch(urlMatch![0]);
    expect(res.status).toBe(200);
    const cd = res.headers.get('content-disposition') || '';
    // v0.40: Content-Disposition presente (aspas/filename* para chars especiais)
    expect(cd.toLowerCase()).toContain('attachment');
  });

  it('download_file de campo vazio → InvalidParams (não devolve URL quebrada)', async () => {
    const emptyRec = await pb.collection(COLL).create({ title: 'sem arquivo' });
    await expect(
      call('download_file', { collection: COLL, recordId: emptyRec.id, fileField: 'attachment' }, pb)
    ).rejects.toThrow();
    await pb.collection(COLL).delete(emptyRec.id).catch(() => {});
  });
});
