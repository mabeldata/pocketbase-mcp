# PocketBase MCP — Guia da Suíte de Testes

Suíte criada pela tarefa kanban t_a8b64e5e com base no diagnóstico t_e266f9f8
(DIAGNOSTICO-pocketbase-mcp.md). Alvo: PocketBase v0.40.3 (matriz inclui
v0.39.11) + JS SDK 0.28.1 + MCP SDK 1.30.0. Framework: vitest 3.x (dev-only).

TODOS os comportamentos "reais" citados aqui foram validados empiricamente
contra binários v0.40.3 e v0.39.11 nesta máquina (2026-09-10).

## Estrutura

```
tests/
  unit/          -> unitários com client PocketBase mockado
  contract/      -> contrato MCP: snapshot tools/list, handshake InMemory, stdio smoke
  integration/   -> contra binário REAL do PocketBase (download automático)
  fixtures/      -> mocks, payloads v0.40 e registry de bugs conhecidos
vitest.unit.config.ts          -> unit + contract (hermetic; `npm test`)
vitest.integration.config.ts   -> só integração (`npm run test:integration`)
vitest.config.ts               -> tudo (`npm run test:all`)
tsconfig.test.json             -> typecheck dos testes (`npm run typecheck`)
```

## Comandos

| Comando | O que roda | PocketBase necessário? |
|---|---|---|
| `npm test` | unit + contract (141 testes) | não |
| `npm run test:integration` | integração (35 testes) | sim (auto-download) |
| `npm run test:all` | tudo | sim |
| `npm run typecheck` | tsc src + testes | não |
| `SKIP_KNOWN_BUG_TESTS=1 npm test` | baseline verde (bugs conhecidos viram skip) | não |
| `POCKETBASE_VERSION=v0.39.11 npm run test:integration` | matriz de compat (download) | auto |
| `POCKETBASE_BIN=/caminho/pocketbase npm run test:integration` | binário já baixado (formato do CI) | manual |
| `PB_BIN_DIR=/cache npm run test:integration` | cache de binários alternativo | auto |

Integração sem rede/OS suportado → testes PULAM com mensagem (não falham).

## Cenários pendentes (testes vermelhos por desenho)

`tests/fixtures/known-bugs.ts` é o registry. Testes `itBug/describeBugs`
documentam o comportamento ESPERADO pós-refactor: falham hoje, ficam verdes
quando a tarefa de código (t_8510e55a) aplicar as correções, SEM mudar o teste.

| Id | Onde | Problema |
|---|---|---|
| BUG-1 | src/tools/index.ts | 5 das 9 migration tools não roteadas (MethodNotFound) |
| BUG-2 | src/tools/log-tools.ts | `sort` de list_logs nunca repassado (unit + integração real) |
| BUG-3 | src/tools/file-tools.ts | `pb.files.getUrl()` deprecated → usar `getURL()` (console.warn corrompe stdio) |
| BUG-4 | src/migrations/execution.ts | JSVM de servidor executado contra client REST (redesign D1; mecânica atual travada em migration-execution.test.ts) |
| BUG-5 | src/migrations/helpers/template.ts | **ACHADO NOVO desta suíte**: `fields.add({objeto puro})` é ACEITO pelo runner v0.39.11 mas REJEITADO pelo v0.40.3 (`could not convert [object Object] to core.Field`). Forma correta validada: `new TextField({...})`/`new Field({...})` + `fields.add` (controle positivo no teste de integração passa em ambas as versões) |
| ROB-1 | src/tools/log-tools.ts (+cron) | `arguments` undefined → TypeError (MCP permite quando não há required) |
| ROB-2 | src/server/pocketbase-server.ts | mensagens SIGINT/SIGTERM via console.log → STDOUT corrompe JSON-RPC no shutdown; usar console.error |
| ERR-1 | src/server/error-handler.ts | ClientResponseError deveria expor status + response.data por campo |
| ID-1 | src/migrations | ids não validados contra regras de caracteres do v0.33 |

## Comportamentos reais do servidor validados (fixtures calibradas)

- **perPage**: server CLAMPA em 1000 (perPage=2000 → retorna 1000, sem erro 400).
- **crons v0.40**: `[{id, expression}]` — jobs `__pbDBOptimize__`, `__pbMFACleanup__`,
  `__pbOTPCleanup__`, `__pbLogsCleanup__` (`deleteOldLogs` NÃO existe mais).
- **logs**: flush ASSÍNCRONO (~2-4s após o request); shape
  `{id, created, level, message, data:{method,url,status,execTime,remoteIP,type:'request',...}}`;
  filtros válidos: `level>=N`, `data.status>=N`, `message~'...'` — filtro em
  `method` puro → 400.
- **get_logs_stats**: `[{date, total}]`.
- **erro 401**: body `{data:{}, message, status:401}` — sem campo `code`.
- **pb.health.check()** (SDK 0.28): RETORNA o body `{code:200,message,data}`.
- **json field > 1MB** (v0.28): erro 400 de validação — confirmado.
- **id com `.` ou `/`** (v0.33): erro 400 — confirmado; id custom válido
  (15 chars `[a-z0-9]`) aceito.
- **geoPoint** (v0.27): round-trip ok via create/fetch.
- **Content-Disposition** (v0.40): presente em download de arquivo com nome especial.
- **MCP SDK 1.30**: `McpError.message` vem prefixado `MCP error -32602: ...`.

## Contrato MCP

- Snapshot completo (22 tools: nomes+descrições+inputSchemas) em
  `tests/contract/__snapshots__/tools-list.snapshot.test.ts.snap`.
  Regeneração deliberada: `npx vitest run tests/contract -u` + justificativa no PR.
- Handshake real Client↔Server via InMemoryTransport (mock do pocketbase com
  `vi.hoisted` — NUNCA importar fixtures que importam 'pocketbase' dentro da
  factory do vi.mock: deadlock de resolução).
- stdio smoke: spawn de `node build/index.js`, handshake JSON-RPC por
  stdin/stdout, tools/list=22, callTool com erro (server inexistente) não
  crasha o processo, e sem POCKETBASE_ADMIN_TOKEN → exit!=0 + stderr.

## Armadilhas de ambiente (aprendidas na prática)

1. `--migrationsDir` SEMPRE explícito em qualquer comando do binário: o default
   `<cwd>/pb_migrations` (e `/tmp/pb_migrations` quando cwd=/tmp) é
   compartilhado entre processos na máquina — causou cross-contamination real
   durante o desenvolvimento desta suíte.
2. `serve <addr>` positional ativa TLS; para HTTP puro usar
   `serve --http 127.0.0.1:PORT`.
3. Porta ephemera via bind(0) do SO + retry; identidade de superuser ÚNICA por
   run prova posse da instância (evita cross-talk com servers de outros workers).
4. Testes que geram arquivos de migration precisam setar `setMigrationsDirectory`
   para tmpdir (o módulo tem estado global).
5. Node >= 18 (FormData/Blob/fetch nativos); testado em Node 26.

## CI

O workflow do repositório (criado pela tarefa de código) deve chamar:
`npm ci` → `npm run build` → `npm test` (hermetic) →
`POCKETBASE_BIN=... npm run test:integration` com matriz
`[v0.39.11, v0.40.3]` — contrato de env já suportado pelo setup.ts.
