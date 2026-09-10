/**
 * Helper para cenários que documentam bugs conhecidos / comportamento esperado
 * da nova versão do PocketBase que a implementação ATUAL ainda não satisfaz.
 * (mapeados no diagnóstico t_e266f9f8 — DIAGNOSTICO-pocketbase-mcp.md)
 *
 * Por padrão esses testes RODAM e FALHAM (red): eles são a worklist da tarefa
 * de código (t_8510e55a) e ficam verdes SEM alteração do teste quando as
 * correções são aplicadas.
 *
 * Para validar a infra com baseline verde antes do refactor:
 *   SKIP_KNOWN_BUG_TESTS=1 npm test
 */
import { describe as vitestDescribe, it as vitestIt } from 'vitest';

export const KNOWN_BUGS_SKIPPED = process.env.SKIP_KNOWN_BUG_TESTS === '1';

export const itBug = KNOWN_BUGS_SKIPPED ? vitestIt.skip : vitestIt;
export const describeBugs = KNOWN_BUGS_SKIPPED ? vitestDescribe.skip : vitestDescribe;

/** Ids estáveis dos cenários pendentes (para citar em relatórios/PRs). */
export const KNOWN_BUGS = {
  BUG1_ROUTING:
    'BUG-1 (src/tools/index.ts): 5 das 9 migration tools não são roteadas e caem em MethodNotFound (set_migrations_directory, apply_migration, revert_migration, apply_all_migrations, revert_to_migration)',
  BUG2_LOG_SORT:
    "BUG-2 (src/tools/log-tools.ts): 'sort' é declarado no inputSchema de list_logs mas nunca é repassado a pb.logs.getList",
  BUG3_GETURL:
    'BUG-3 (src/tools/file-tools.ts): pb.files.getUrl() está deprecated no SDK 0.28 e emite console.warn — em transporte stdio isso polui/corrói o canal JSON-RPC; deve usar pb.files.getURL()',
  BUG4_EXECUTION:
    'BUG-4 (src/migrations/execution.ts): corpo JSVM de servidor é executado contra o client REST — redesign pendente (decisão D1 do diagnóstico)',
  BUG5_FIELD_ADD:
    'BUG-5 (src/migrations/helpers/template.ts): generateAddFieldQuery gera collection.fields.add({objeto puro}) — o runner JSVM real do PocketBase v0.40.3 rejeita (could not convert [object Object] to core.Field); forma correta validada: new TextField({...})/new Field({...}) + fields.add',
  ROB1_UNDEFINED_ARGS:
    'ROB-1: tools invocadas sem `arguments` (permitido pelo MCP quando não há required) crasham com TypeError em vez de usar defaults/InvalidParams',
  ROB2_STDOUT_SHUTDOWN:
    'ROB-2 (src/server/pocketbase-server.ts): mensagens de SIGINT/SIGTERM usam console.log → vão para STDOUT e corrompem o canal JSON-RPC do transporte stdio durante shutdown; devem usar console.error (stderr)',
  ERR1_ENRICH:
    'ERR-1 (src/server/error-handler.ts): ClientResponseError deveria expor status + erros por campo (response.data) no texto devolvido ao LLM',
  ID1_VALIDATION:
    'ID-1 (src/migrations): ids de collection não são validados contra as regras de caracteres de id introduzidas no PocketBase v0.33',
} as const;

export type KnownBugId = keyof typeof KNOWN_BUGS;
