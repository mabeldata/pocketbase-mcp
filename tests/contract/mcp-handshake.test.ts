/**
 * CONTRATO MCP — handshake real via InMemoryTransport (MCP SDK 1.30).
 *
 * Sobe o PocketBaseServer de verdade (src/server/pocketbase-server.ts) com o
 * módulo 'pocketbase' mockado, conecta um Client MCP oficial via
 * InMemoryTransport e exercita: initialize → listTools → callTool.
 *
 * Prova que o padrão low-level (Server + setRequestHandler + ListTools/CallTool
 * schemas) continua funcional no MCP SDK 1.30.0 — item 3.3 do diagnóstico.
 *
 * Os dados do mock são definidos via vi.hoisted() (a factory do vi.mock é
 * içada ao topo do arquivo; referenciar consts top-level causaria TDZ).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// vi.hoisted roda ANTES dos imports (que são içados): o módulo do server
// executa a checagem de POCKETBASE_ADMIN_TOKEN no top-level e chama
// process.exit(1) se ausente — o env precisa estar definido antes do import.
const H = vi.hoisted(() => {
  const TOKEN_KEY = 'POCKETBASE_ADMIN_TOKEN';
  if (!process.env[TOKEN_KEY]) process.env[TOKEN_KEY] = 'test-superuser-token';
  if (!process.env.POCKETBASE_API_URL) process.env.POCKETBASE_API_URL = 'http://127.0.0.1:8090';

  const collection = {
    id: 'pbc_1234567890',
    name: 'posts',
    type: 'base',
    system: false,
    fields: [{ name: 'title', type: 'text', required: true }],
    indexes: ['CREATE INDEX `idx_posts_title` ON `posts` (`title`)'],
  };
  const record = {
    id: 'rec1234567890abc',
    collectionId: collection.id,
    collectionName: collection.name,
    title: 'Hello world',
  };
  return { collection, record };
});

vi.mock('pocketbase', () => {
  const svcCache: Record<string, any> = {};
  const shared: any = {
    collections: {
      getOne: vi.fn().mockResolvedValue(H.collection),
      getFullList: vi.fn().mockResolvedValue([H.collection]),
    },
    logs: { getList: vi.fn(), getOne: vi.fn(), getStats: vi.fn() },
    crons: { getFullList: vi.fn(), run: vi.fn() },
    files: { getUrl: vi.fn(), getURL: vi.fn() },
    health: { check: vi.fn().mockResolvedValue(undefined) },
    authStore: { save: vi.fn(), clear: vi.fn(), token: 'mock', isValid: true },
    autoCancellation: vi.fn(),
    collection(name: string) {
      if (!svcCache[name]) {
        svcCache[name] = {
          getOne: vi.fn().mockResolvedValue(H.record),
          getList: vi.fn().mockResolvedValue({
            items: [H.record], page: 1, perPage: 30, totalItems: 1, totalPages: 1,
          }),
          create: vi.fn().mockResolvedValue(H.record),
          update: vi.fn().mockResolvedValue(H.record),
          delete: vi.fn().mockResolvedValue(true),
        };
      }
      return svcCache[name];
    },
  };
  class PocketBaseMock {
    constructor(_url: string) {
      return shared;
    }
  }
  return { default: PocketBaseMock, PocketBase: PocketBaseMock };
});

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { PocketBaseServer } from '../../src/server/pocketbase-server.js';

describe('handshake MCP (Client ↔ PocketBaseServer via InMemoryTransport)', () => {
  let client: Client;
  let server: PocketBaseServer;
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    server = new PocketBaseServer();
    client = new Client({ name: 'test-client', version: '1.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([
      (server as any).server.connect(serverTransport),
      client.connect(clientTransport),
    ]);
  });

  afterAll(async () => {
    await client.close().catch(() => {});
    errSpy.mockRestore();
  });

  it('initialize responde com as informações do server e capabilities.tools', () => {
    const serverInfo = client.getServerVersion();
    expect(serverInfo?.name).toBe('pocketbase-mcp');
    expect(client.getServerCapabilities()?.tools).toBeDefined();
  });

  it('listTools devolve as 33 tools com inputSchema válido', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(33);
    for (const t of tools) {
      expect(typeof t.name).toBe('string');
      expect(t.inputSchema).toMatchObject({ type: 'object' });
    }
    const names = tools.map(t => t.name);
    expect(names).toContain('list_collections');
    expect(names).toContain('fetch_record');
    expect(names).toContain('run_cron_job');
    // PR-3: as tools aditivas precisam aparecer no handshake real
    expect(names).toContain('delete_record');
    expect(names).toContain('truncate_logs');
    expect(names).toContain('run_sql');
    expect(names).toContain('batch_records');
  });

  it('callTool list_collections retorna payload do mock (sem isError)', async () => {
    const result = await client.callTool({ name: 'list_collections', arguments: {} });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].type).toBe('text');
    const parsed = JSON.parse(content[0].text);
    expect(parsed[0].name).toBe(H.collection.name);
    expect(parsed[0].indexes[0]).toMatch(/^CREATE INDEX/);
  });

  it('callTool fetch_record retorna o record', async () => {
    const result = await client.callTool({
      name: 'fetch_record',
      arguments: { collection: 'posts', id: H.record.id },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text).id).toBe(H.record.id);
  });

  it('callTool get_collection_schema via mock devolve a collection', async () => {
    const result = await client.callTool({
      name: 'get_collection_schema',
      arguments: { collection: 'posts' },
    });
    expect(result.isError).toBeFalsy();
    const content = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content[0].text).name).toBe('posts');
  });

  it('callTool inexistente → isError com MethodNotFound (formatError no caminho)', async () => {
    const result = await client.callTool({ name: 'tool_fantasma', arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toMatch(/MethodNotFound/);
    expect(content[0].text).toMatch(/tool_fantasma/);
  });

  it('callTool com params inválidos → isError InvalidParams', async () => {
    const result = await client.callTool({ name: 'fetch_record', arguments: {} });
    expect(result.isError).toBe(true);
    const content = result.content as Array<{ type: string; text: string }>;
    expect(content[0].text).toMatch(/InvalidParams/);
  });
});
