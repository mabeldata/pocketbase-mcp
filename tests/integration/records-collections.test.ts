/**
 * INTEGRAÇÃO — records + collections via as TOOLS do MCP (handleToolCall),
 * contra PocketBase REAL v0.40.x.
 *
 * Cobre a matriz 6.2 do diagnóstico:
 * - CRUD completo, filter/sort/expand, paginação
 * - json > 1MB → erro de validação (default max introduzido no server v0.28)
 * - id com caracteres proibidos → erro (validação introduzida no v0.33)
 * - get_collection_schema com fields/indexes no formato v0.38+
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import PocketBase, { ClientResponseError } from 'pocketbase';
import { handleToolCall } from '../../src/tools/index.js';
import { integrationSkipReason, createIntegrationClient } from './helpers.js';

const skipReason = integrationSkipReason();
const describeI = skipReason ? describe.skip : describe;

const TEST_COLLECTION = 'it_posts';

function toolText(result: any): string {
  return result.content[0].text;
}

async function call(name: string, args: Record<string, unknown>, pb: PocketBase) {
  return handleToolCall({ name, arguments: args } as any, pb);
}

describeI('integração — records & collections via tools MCP', () => {
  let pb: PocketBase;

  beforeAll(async () => {
    pb = createIntegrationClient();
    // collection de teste idempotente (cria se não existir)
    const existing = await pb.collections.getFullList({ filter: `name="${TEST_COLLECTION}"` });
    if (existing.length === 0) {
      await pb.collections.create({
        name: TEST_COLLECTION,
        type: 'base',
        fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'status', type: 'text', required: false },
          { name: 'views', type: 'number', required: false },
          { name: 'payload', type: 'json', required: false },
          { name: 'location', type: 'geoPoint', required: false },
        ],
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
      });
    }
    // limpa registros de runs anteriores
    const old = await pb.collection(TEST_COLLECTION).getFullList();
    for (const r of old) {
      await pb.collection(TEST_COLLECTION).delete(r.id);
    }
  });

  afterAll(async () => {
    const recs = await pb.collection(TEST_COLLECTION).getFullList().catch(() => []);
    for (const r of recs) {
      await pb.collection(TEST_COLLECTION).delete(r.id).catch(() => {});
    }
    await pb.collections.delete(TEST_COLLECTION).catch(() => {});
  });

  it('create_record → fetch_record → update_record (CRUD via tools)', async () => {
    const created = await call('create_record', {
      collection: TEST_COLLECTION,
      data: { title: 'Primeiro post', status: 'draft', views: 0 },
    }, pb);
    expect(created.isError).toBeFalsy();
    const record = JSON.parse(toolText(created));
    expect(record.id).toMatch(/^[a-z0-9]{15}$/);
    expect(record.title).toBe('Primeiro post');

    const fetched = await call('fetch_record', {
      collection: TEST_COLLECTION, id: record.id,
    }, pb);
    expect(JSON.parse(toolText(fetched)).id).toBe(record.id);

    const updated = await call('update_record', {
      collection: TEST_COLLECTION, id: record.id, data: { status: 'published', views: 42 },
    }, pb);
    const updatedRecord = JSON.parse(toolText(updated));
    expect(updatedRecord.status).toBe('published');
    expect(updatedRecord.views).toBe(42);
  });

  it('list_records com filter/sort/page/perPage reais', async () => {
    for (let i = 0; i < 5; i++) {
      await pb.collection(TEST_COLLECTION).create({
        title: `post-${i}`, status: i % 2 === 0 ? 'active' : 'archived', views: i * 10,
      });
    }
    const result = await call('list_records', {
      collection: TEST_COLLECTION,
      filter: "status='active'",
      sort: '-views',
      page: 1,
      perPage: 2,
    }, pb);
    const parsed = JSON.parse(toolText(result));
    expect(parsed.page).toBe(1);
    expect(parsed.perPage).toBe(2);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.totalItems).toBe(3); // post-0, post-2, post-4
    expect(parsed.items[0].views).toBeGreaterThanOrEqual(parsed.items[1].views);
    for (const item of parsed.items) {
      expect(item.status).toBe('active');
    }
  });

  it('list_records perPage=500 aceito; server v0.40 clamp em 1000 (sem erro — limite documentado)', async () => {
    const ok = await call('list_records', { collection: TEST_COLLECTION, perPage: 500 }, pb);
    expect(ok.isError).toBeFalsy();
    expect(JSON.parse(toolText(ok)).perPage).toBe(500);

    // Comportamento REAL do v0.40.3 (validado por probe): perPage > 1000 é
    // clampeado para 1000 pelo server — NÃO devolve erro 400.
    const page: any = await pb.collection(TEST_COLLECTION).getList(1, 2000);
    expect(page.perPage).toBe(1000);
  });

  it('record com field json > 1MB → erro de validação do server (default max v0.28)', async () => {
    const huge = { big: 'x'.repeat(1024 * 1024 + 100) };
    let err: any;
    try {
      await call('create_record', {
        collection: TEST_COLLECTION,
        data: { title: 'json gigante', payload: huge },
      }, pb);
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ClientResponseError);
    expect(err.status).toBe(400);
    // o erro deve apontar o campo/falha de tamanho (forma exata varia por versão)
    const text = JSON.stringify(err.response);
    expect(text.length).toBeGreaterThan(2);
  });

  it('record com field geoPoint (v0.27+) — pass-through ok', async () => {
    const result = await call('create_record', {
      collection: TEST_COLLECTION,
      data: { title: 'com geo', location: { lat: -23.5505, lon: -46.6333 } },
    }, pb);
    const record = JSON.parse(toolText(result));
    expect(record.location.lat).toBeCloseTo(-23.5505, 3);
    expect(record.location.lon).toBeCloseTo(-46.6333, 3);
  });

  it('filtro geoDistance() (v0.27+) passa pela tool list_records (sintaxe oficial: km)', async () => {
    // ponto ~2km do centro de SP; o registro acima (-23.5505,-46.6333) entra,
    // registros sem location não entram na busca < 10km
    await call('create_record', {
      collection: TEST_COLLECTION,
      data: { title: 'geo-longe', location: { lat: -22.9056, lon: -47.0444 } }, // Campinas ~90km
    }, pb);
    const result = await call('list_records', {
      collection: TEST_COLLECTION,
      filter: 'geoDistance(location.lon, location.lat, -46.6333, -23.5505) <= 10',
      perPage: 100,
    }, pb);
    expect(result.isError).toBeFalsy();
    const page = JSON.parse(toolText(result));
    const titles = page.items.map((i: any) => i.title);
    expect(titles).toContain('com geo');
    expect(titles).not.toContain('geo-longe');
  });

  it('create_record com id contendo caracteres proibidos → erro de validação (v0.33)', async () => {
    let err: any;
    try {
      await pb.collection(TEST_COLLECTION).create({ id: 'id.invalid/o', title: 'x' });
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ClientResponseError);
    expect(err.status).toBe(400);
  });

  it('create_record com id válido customizado (15 chars alfanuméricos) → aceito', async () => {
    const customId = 'abc123def456ghi';
    const result = await call('create_record', {
      collection: TEST_COLLECTION,
      data: { id: customId, title: 'id custom' },
    }, pb);
    expect(JSON.parse(toolText(result)).id).toBe(customId);
  });

  it('get_collection_schema devolve fields + indexes no formato do server real', async () => {
    const result = await call('get_collection_schema', { collection: TEST_COLLECTION }, pb);
    const schema = JSON.parse(toolText(result));
    expect(schema.name).toBe(TEST_COLLECTION);
    expect(Array.isArray(schema.fields)).toBe(true);
    const types = schema.fields.map((f: any) => f.type);
    expect(types).toContain('text');
    expect(types).toContain('geoPoint');
    expect(Array.isArray(schema.indexes)).toBe(true);
    // criado/updated presentes no formato moderno
    expect(schema.created).toBeTruthy();
  });

  it('list_collections inclui as system collections do server real', async () => {
    const result = await call('list_collections', {}, pb);
    const names = JSON.parse(toolText(result)).map((c: any) => c.name);
    for (const sys of ['_superusers', '_externalAuths', '_authOrigins', '_mfas', '_otps']) {
      expect(names, `system collection ${sys} ausente`).toContain(sys);
    }
  });

  it('fetch_record inexistente → ClientResponseError 404 propaga pela tool', async () => {
    let err: any;
    try {
      await call('fetch_record', { collection: TEST_COLLECTION, id: 'naoexistenaobc' }, pb);
    } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ClientResponseError);
    expect(err.status).toBe(404);
  });
});
