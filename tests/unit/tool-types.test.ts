/**
 * Coerência entre os inputSchemas das tools e os types de argumentos
 * (src/types/tool-types.ts) — evita drift como o de DownloadFileArgs
 * (downloadPath obrigatório no type, ausente no schema; README stale).
 */
import { describe, it, expect } from 'vitest';
import { registerTools } from '../../src/tools/index.js';
import { listRecordTools } from '../../src/tools/record-tools.js';
import { listFileTools } from '../../src/tools/file-tools.js';
import { listLogTools } from '../../src/tools/log-tools.js';
import { listCronTools } from '../../src/tools/cron-tools.js';
import { listCollectionTools } from '../../src/tools/collection-tools.js';
import { listMigrationTools } from '../../src/tools/migration-tools.js';

function findTool(name: string) {
  const tool = registerTools().tools.find(t => t.name === name);
  if (!tool) throw new Error(`tool ${name} não registrada`);
  return tool;
}

describe('schemas JSON das tools (contrato estático)', () => {
  it('todas as tools têm inputSchema type=object com properties', () => {
    for (const tool of registerTools().tools) {
      expect(tool.inputSchema.type, tool.name).toBe('object');
      expect(tool.inputSchema.properties, tool.name).toBeDefined();
      expect(typeof tool.description, tool.name).toBe('string');
      expect(tool.description.length, tool.name).toBeGreaterThan(10);
    }
  });

  it('download_file: downloadPath NÃO é required (type DownloadFileArgs está stale — limpar na tarefa de código)', () => {
    const tool = findTool('download_file');
    expect(tool.inputSchema.required).toEqual(['collection', 'recordId', 'fileField']);
    expect(tool.inputSchema.properties.downloadPath).toBeUndefined();
  });

  it('upload_file: os 5 campos são required', () => {
    const tool = findTool('upload_file');
    expect(tool.inputSchema.required).toEqual([
      'collection', 'recordId', 'fileField', 'fileContent', 'fileName',
    ]);
  });

  it('list_records: perPage maximum=500 declarado (consistência com README a corrigir)', () => {
    const tool = findTool('list_records');
    expect(tool.inputSchema.properties.perPage.maximum).toBe(500);
    expect(tool.inputSchema.properties.page.minimum).toBe(1);
  });

  it('list_logs: sort está declarado no schema (repasse é BUG-2, testado em log-tools)', () => {
    const tool = findTool('list_logs');
    expect(tool.inputSchema.properties.sort).toBeDefined();
  });

  it('create_collection_migration: collectionDefinition exige name+id no schema', () => {
    const tool = findTool('create_collection_migration');
    expect(tool.inputSchema.required).toEqual(['collectionDefinition']);
    expect(tool.inputSchema.properties.collectionDefinition.required).toEqual(['name', 'id']);
  });

  it('revert_to_migration: targetMigration required (string vazia permitida = reverter todas)', () => {
    const tool = findTool('revert_to_migration');
    expect(tool.inputSchema.required).toEqual(['targetMigration']);
    expect(tool.inputSchema.properties.targetMigration.type).toBe('string');
  });

  it('grupos de tools somam o total registrado', () => {
    const total =
      listRecordTools().length + listCollectionTools().length + listFileTools().length +
      listMigrationTools().length + listLogTools().length + listCronTools().length;
    expect(registerTools().tools).toHaveLength(total);
  });
});
