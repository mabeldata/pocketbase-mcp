/**
 * CONTRATO MCP — snapshot de tools/list.
 *
 * Trava 100% dos nomes, descrições e inputSchemas das tools registradas
 * (requisito do diagnóstico: "preservar 100% dos nomes e inputSchemas";
 * qualquer mudança exige regeneração deliberada com `-u` + justificativa).
 *
 * PR-3 (tools aditivas v0.37–v0.40): os dois snapshots HISTÓRICOS abaixo são
 * calculados sobre as 22 tools originais filtradas por nome, portanto o
 * arquivo .snap pré-PR-3 passa SEM regeneração (drift zero — restrição do
 * card). As tools novas entram em snapshots ADITIVOS separados: remover ou
 * alterar uma delas exige regeneração deliberada e fica visível no diff.
 *
 * Roda SEMPRE antes e depois de mudanças de dependência (MCP SDK 1.7→1.30)
 * e de código, provando retrocompatibilidade do contrato.
 */
import { describe, it, expect } from 'vitest';
import { registerTools } from '../../src/tools/index.js';

/** Contrato travado pré-PR-3 (22 tools — snapshot original intacto). */
const ORIGINAL_22 = [
  'add_field_migration', 'apply_all_migrations', 'apply_migration',
  'create_collection_migration', 'create_migration', 'create_record',
  'download_file', 'fetch_record', 'get_collection_schema', 'get_log',
  'get_logs_stats', 'list_collections', 'list_cron_jobs', 'list_logs',
  'list_migrations', 'list_records', 'revert_migration', 'revert_to_migration',
  'run_cron_job', 'set_migrations_directory', 'update_record', 'upload_file',
];

/** Tools PR-3 (aditivas — snapshots novos). */
const PR3_TOOLS = [
  'batch_records', 'create_backup', 'delete_record', 'dry_run_view_query',
  'get_collection_scaffolds', 'get_settings', 'list_backups', 'restore_backup',
  'run_sql', 'truncate_logs', 'update_settings',
];

describe('tools/list — snapshot do contrato', () => {
  it('lista completa de tools (nomes + descrições + inputSchemas)', () => {
    const tools = registerTools().tools
      .filter(t => ORIGINAL_22.includes(t.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    expect(tools).toHaveLength(22);
    // snapshot determinístico: ordena por nome para diffs estáveis
    expect(tools).toMatchSnapshot();
  });

  it('nomes das tools (lista plana — checagem rápida de contrato)', () => {
    const names = registerTools().tools
      .map(t => t.name)
      .filter(n => ORIGINAL_22.includes(n))
      .sort();
    expect(names).toMatchSnapshot();
  });

  it('PR-3: snapshot aditivo das 11 tools novas (nomes + descrições + inputSchemas)', () => {
    const tools = registerTools().tools
      .filter(t => PR3_TOOLS.includes(t.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    expect(tools).toHaveLength(11);
    expect(tools).toMatchSnapshot();
  });

  it('PR-3: registro total = 22 originais + 11 aditivas = 33, sem ferramentas fora do contrato', () => {
    const names = registerTools().tools.map(t => t.name).sort();
    expect(names).toHaveLength(33);
    expect(new Set(names).size).toBe(33);
    expect([...names].sort()).toEqual([...ORIGINAL_22, ...PR3_TOOLS].sort());
  });
});
