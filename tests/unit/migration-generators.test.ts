/**
 * Geradores de migration (src/migrations/helpers/template.ts + index.ts).
 *
 * Os templates produzem código JSVM compatível com PocketBase v0.23+ (usa
 * `fields`, não `schema`) — válido também no v0.40. Snapshots travam o formato
 * exato; regenerate deliberadamente com `npx vitest run tests/unit -u`.
 *
 * Inclui ID-1 (cenário pendente): validação de caracteres de id conforme
 * regras introduzidas no server v0.33 — hoje os geradores aceitam ids
 * inválidos (ex.: "a.b"), o que produziria migration rejeitada pelo servidor.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';
import {
  generateMigrationTemplate,
  generateCreateCollectionQuery,
  generateDeleteCollectionQuery,
  generateAddFieldQuery,
  generateRemoveFieldQuery,
} from '../../src/migrations/helpers/template.js';
import {
  createNewMigration,
  createCollectionMigration,
  createAddFieldMigration,
  setMigrationsDirectory,
  listMigrations,
} from '../../src/migrations/index.js';
import { itBug, KNOWN_BUGS } from '../fixtures/known-bugs.js';

describe('generateMigrationTemplate', () => {
  it('template vazio com placeholders', () => {
    expect(generateMigrationTemplate()).toMatchSnapshot();
  });

  it('template com up/down customizados', () => {
    expect(generateMigrationTemplate('const x = 1;', 'const y = 2;')).toMatchSnapshot();
  });

  it('estrutura migrate((app)=>{...},(app)=>{...}) presente e referência de tipos no topo', () => {
    const out = generateMigrationTemplate('up();', 'down();');
    expect(out).toContain('/// <reference path="../pb_data/types.d.ts" />');
    expect(out).toMatch(/migrate\(\(app\) => \{/);
    expect(out).toContain('up();');
    expect(out).toContain('down();');
  });
});

describe('generateCreateCollectionQuery', () => {
  it('snapshot de collection completa (formato v0.23+: fields, não schema)', () => {
    const q = generateCreateCollectionQuery({
      id: 'pbc_1234567890',
      name: 'posts',
      type: 'base',
      fields: [
        { id: 'text_title', name: 'title', type: 'text', required: true, max: 255 },
        {
          id: 'file_doc', name: 'doc', type: 'file',
          options: { maxSelect: 1, maxSize: 5242880, mimeTypes: ['application/pdf'] },
        },
      ],
      indexes: ['CREATE INDEX `idx_posts_title` ON `posts` (`title`)'],
      listRule: null,
      viewRule: '@request.auth.id != ""',
    });
    expect(q).toMatchSnapshot();
    // options são achatadas no corpo do field (formato esperado pelo JSVM v0.23+)
    expect(q).toContain('maxSelect: 1');
    expect(q).not.toMatch(/options:/);
    expect(q).toContain('new Collection(');
    expect(q).toContain('app.save(collection)');
  });

  it('sem name ou id → Error', () => {
    expect(() => generateCreateCollectionQuery({ name: 'x' } as any)).toThrow(/'name' and 'id'/);
    expect(() => generateCreateCollectionQuery({ id: 'x' } as any)).toThrow(/'name' and 'id'/);
  });

  it('fields ausente vira array vazio', () => {
    const q = generateCreateCollectionQuery({ id: 'pbc_1', name: 'c' });
    expect(q).toContain('fields: []');
  });

  itBug('id com caracteres proibidos (v0.33) deveria ser rejeitado pelo gerador', () => {
    // EXPECTED (pós-correção): gerador valida id contra as regras de v0.33
    // (proíbe ./\|"'`<>:?*%$ e nomes reservados) e lança erro claro.
    // Estado atual: aceita silenciosamente e gera migration que o server rejeitaria.
    expect(() => generateCreateCollectionQuery({ id: 'a.b/c', name: 'c' })).toThrow();
    void KNOWN_BUGS.ID1_VALIDATION;
  });
});

describe('generateDeleteCollectionQuery', () => {
  it('snapshot', () => {
    expect(generateDeleteCollectionQuery('pbc_1234567890')).toMatchSnapshot();
  });
});

describe('generateAddFieldQuery / generateRemoveFieldQuery', () => {
  it('add field: snapshot com options achatadas', () => {
    const q = generateAddFieldQuery('posts', {
      id: 'text_sub', name: 'subtitle', type: 'text',
      options: { max: 100 },
    });
    expect(q).toMatchSnapshot();
    expect(q).toContain('collection.fields.add(');
    expect(q).toContain('max: 100');
  });

  it('add field sem name/type → Error', () => {
    expect(() => generateAddFieldQuery('posts', { name: 'x' } as any)).toThrow(/'name' and 'type'/);
    expect(() => generateAddFieldQuery('posts', { type: 'text' } as any)).toThrow(/'name' and 'type'/);
  });

  it('remove field: snapshot', () => {
    expect(generateRemoveFieldQuery('posts', 'subtitle')).toMatchSnapshot();
  });
});

describe('criação de arquivos de migration (tmpdir isolado)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbmcp-gen-'));
    setMigrationsDirectory(tmpDir);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('createNewMigration: nome = timestamp_descricao.js, conteúdo = template', async () => {
    const filePath = await createNewMigration('Add User Email Index!');
    const base = path.basename(filePath);
    expect(base).toMatch(/^\d{9,}_add_user_email_index\.js$/);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('migrate((app) => {');
  });

  it('createNewMigration: descrição só com caracteres inválidos → Error', async () => {
    await expect(createNewMigration('!!!')).rejects.toThrow(/cannot be empty/);
  });

  it('createCollectionMigration: default de descrição é create_<name>_collection', async () => {
    const filePath = await createCollectionMigration({
      id: 'pbc_1234567890',
      name: 'posts',
      fields: [{ id: 'text_title', name: 'title', type: 'text' }],
    });
    expect(path.basename(filePath)).toMatch(/^\d{9,}_create_posts_collection\.js$/);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('new Collection(');
    expect(content).toContain('app.findCollectionByNameOrId("pbc_1234567890")');
    expect(content).toContain('app.delete(collection)');
  });

  it('createCollectionMigration sem id → Error (validação do gerador)', async () => {
    await expect(
      createCollectionMigration({ name: 'posts' } as any)
    ).rejects.toThrow(/'id'/);
  });

  it('createAddFieldMigration: up adiciona, down remove o campo', async () => {
    const filePath = await createAddFieldMigration(
      'posts', { name: 'subtitle', type: 'text' }, 'add subtitle'
    );
    expect(path.basename(filePath)).toMatch(/^\d{9,}_add_subtitle\.js$/);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toContain('collection.fields.add(');
    expect(content).toContain('collection.fields.removeByName("subtitle")');
  });

  it('createAddFieldMigration fieldDefinition incompleto → Error', async () => {
    await expect(
      createAddFieldMigration('posts', { name: 'x' } as any)
    ).rejects.toThrow(/'name' and 'type'/);
  });

  it('listMigrations reflete os arquivos criados em ordem cronológica', async () => {
    await createNewMigration('first');
    await new Promise(r => setTimeout(r, 1100)); // timestamp em segundos: garante ordem
    await createNewMigration('second');
    const files = await listMigrations();
    expect(files).toHaveLength(2);
    expect(files[0]).toMatch(/first\.js$/);
    expect(files[1]).toMatch(/second\.js$/);
  });
});
