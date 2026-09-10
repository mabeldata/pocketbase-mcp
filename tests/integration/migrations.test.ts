/**
 * INTEGRAÇÃO — migrations geradas pelas tools validadas no BINÁRIO REAL.
 *
 * Estratégia (enquanto a decisão D1 do diagnóstico não redefine execution.ts):
 * os arquivos gerados por create_collection_migration / add_field_migration são
 * código JSVM de SERVIDOR. O caminho correto de execução é o runner oficial
 * `./pocketbase migrate up --migrationsDir <dir> --dir <pb_data>`. Este teste
 * prova se o que o MCP gera É (ou não) ACEITO pelo servidor v0.40.3.
 *
 * Resultado empírico (probe 2026-09-10, PocketBase v0.40.3):
 * - create_collection_migration → ACEITO pelo runner (new Collection({...})
 *   com fields completos + app.save funciona);
 * - add_field_migration → REJEITADO: o gerador produz
 *   `collection.fields.add({objeto puro})` e o JSVM real exige instância de
 *   Field (`new TextField({...})` / `new Field({...})`) —
 *   "could not convert [object Object] to core.Field". BUG-5 documentado via
 *   itBug: fica VERDE quando o gerador for corrigido na tarefa de código.
 *
 * Isolamento:
 * - cada teste CLI usa SEU par (migDir, dataDir) de tmpdirs — um arquivo de
 *   migration quebrado (cenário BUG-5) não pode contaminar os testes seguintes
 *   via `migrate up` do diretório compartilhado;
 * - --migrationsDir SEMPRE explícito (o default <cwd>/pb_migrations é
 *   compartilhado entre processos na máquina — já causou cross-contamination).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import PocketBase from 'pocketbase';
import { handleToolCall } from '../../src/tools/index.js';
import { setMigrationsDirectory } from '../../src/migrations/index.js';
import {
  integrationSkipReason, createIntegrationClient, integrationBin,
} from './helpers.js';
import { itBug, describeBugs, KNOWN_BUGS } from '../fixtures/known-bugs.js';

const skipReason = integrationSkipReason();
const describeI = skipReason ? describe.skip : describe;

function toolText(result: any): string {
  return result.content[0].text;
}

async function call(name: string, args: Record<string, unknown>, pb: PocketBase) {
  return handleToolCall({ name, arguments: args } as any, pb);
}

describeI('integração — migrations geradas validadas pelo runner oficial (CLI)', () => {
  let pb: PocketBase;
  let bin: string;
  const tmpDirs: string[] = [];
  let logSpy: ReturnType<typeof vi.spyOn>;

  async function freshPair(): Promise<{ migDir: string; dataDir: string }> {
    const migDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbmcp-mig-'));
    const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pbmcp-migdata-'));
    tmpDirs.push(migDir, dataDir);
    return { migDir, dataDir };
  }

  function runCli(args: string[], migDir: string, dataDir: string): string {
    return execFileSync(bin, [...args, '--dir', dataDir, '--migrationsDir', migDir], {
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  beforeAll(async () => {
    pb = createIntegrationClient();
    bin = integrationBin();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterAll(async () => {
    logSpy?.mockRestore();
    for (const dir of tmpDirs) {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('create_collection_migration gera arquivo ACEITO pelo `migrate up` do v0.40.3', async () => {
    const { migDir, dataDir } = await freshPair();
    setMigrationsDirectory(migDir);

    const result = await call('create_collection_migration', {
      collectionDefinition: {
        id: 'pbc_it12345678',
        name: 'it_mig_posts',
        type: 'base',
        fields: [
          {
            hidden: false, id: 'text3293719186', max: 200, min: 0,
            name: 'title', pattern: '', presentable: true, primary: false,
            required: true, system: false, type: 'text',
          },
        ],
        indexes: [],
        listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
      },
      description: 'it create posts',
    }, pb);
    expect(result.isError).toBeFalsy();
    const filePath = toolText(result).replace('Created collection migration file: ', '').trim();
    expect(filePath.startsWith(migDir)).toBe(true);

    // runner oficial aplica o arquivo gerado sem erro
    runCli(['migrate', 'up'], migDir, dataDir);
    // idempotência: segundo `up` não falha
    runCli(['migrate', 'up'], migDir, dataDir);
  });

  describeBugs('BUG-5 — add_field gera fields.add(objeto puro), rejeitado pelo JSVM do v0.40', () => {
    itBug('add_field_migration deveria gerar up/down ACEITOS pelo runner (v0.39 aceita; v0.40 rejeita objeto puro)', async () => {
      const { migDir, dataDir } = await freshPair();
      setMigrationsDirectory(migDir);

      // collection base (aceita pelo runner — provado no teste anterior)
      await call('create_collection_migration', {
        collectionDefinition: {
          id: 'pbc_it87654321',
          name: 'it_mig_posts2',
          type: 'base',
          fields: [
            {
              hidden: false, id: 'text3293719187', max: 200, min: 0,
              name: 'title', pattern: '', presentable: true, primary: false,
              required: true, system: false, type: 'text',
            },
          ],
          indexes: [],
          listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
        },
        description: 'it base posts2',
      }, pb);
      runCli(['migrate', 'up'], migDir, dataDir);

      const result = await call('add_field_migration', {
        collectionNameOrId: 'it_mig_posts2',
        fieldDefinition: {
          hidden: false, id: 'text_subtitle_it', max: 100, min: 0,
          name: 'subtitle', pattern: '', presentable: false, required: false,
          system: false, type: 'text',
        },
        description: 'it add subtitle',
      }, pb);
      expect(result.isError).toBeFalsy();

      // EXPECTED (pós-correção do gerador: new TextField/new Field): exit 0 em
      // TODAS as versões suportadas. Estado atual: v0.39 aceita o objeto puro,
      // mas o v0.40 REJEITA ("could not convert [object Object] to core.Field")
      // — o alvo declarado é v0.40.3, então o teste fica vermelho nele
      // (KNOWN_BUGS.BUG5_FIELD_ADD) e verde no v0.39.x.
      let cliErr: any = null;
      try {
        runCli(['migrate', 'up'], migDir, dataDir);
      } catch (e) {
        cliErr = e;
      }
      expect(cliErr, KNOWN_BUGS.BUG5_FIELD_ADD).toBeNull();

      // ciclo completo: reverte a última e re-aplica
      runCli(['migrate', 'down', '1'], migDir, dataDir);
      runCli(['migrate', 'up'], migDir, dataDir);
    });
  });

  it('controle positivo: forma new TextField({...}) + fields.add é ACEITA pelo runner na versão sob teste', async () => {
    // Prova que o alvo da correção do BUG-5 funciona no binário real — em
    // v0.39.11 E v0.40.3 (validado por probe em 2026-09-10).
    const { migDir, dataDir } = await freshPair();
    await fs.writeFile(path.join(migDir, '1700000001_base.js'), `/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = new Collection({
    id: "pbc_ctl0000001", name: "it_ctl_posts", type: "base",
    fields: [
      { id: "text_ctl_title", name: "title", type: "text", required: true, max: 200, min: 0, pattern: "", hidden: false, presentable: true, system: false, primary: false }
    ],
    indexes: [], listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null
  });
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("it_ctl_posts");
  return app.delete(collection);
});
`, 'utf-8');
    await fs.writeFile(path.join(migDir, '1700000002_addfield.js'), `/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("it_ctl_posts");
  collection.fields.add(new TextField({ name: "subtitle", max: 100 }));
  return app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("it_ctl_posts");
  collection.fields.removeByName("subtitle");
  return app.save(collection);
});
`, 'utf-8');

    runCli(['migrate', 'up'], migDir, dataDir);
    // ciclo down/up completo
    runCli(['migrate', 'down', '1'], migDir, dataDir);
    runCli(['migrate', 'up'], migDir, dataDir);
  });

  it('create_migration gera arquivo vazio com placeholder que o runner aceita', async () => {
    const { migDir, dataDir } = await freshPair();
    setMigrationsDirectory(migDir);

    const result = await call('create_migration', { description: 'it placeholder' }, pb);
    expect(result.isError).toBeFalsy();
    // template vazio: up/down só com comentários — exit 0
    runCli(['migrate', 'up'], migDir, dataDir);
  });

  it('list_migrations reflete os arquivos gerados no diretório configurado', async () => {
    const { migDir } = await freshPair();
    setMigrationsDirectory(migDir);

    await call('create_migration', { description: 'it first' }, pb);
    await call('create_migration', { description: 'it second' }, pb);

    const result = await call('list_migrations', {}, pb);
    expect(result.isError).toBeFalsy();
    const text = toolText(result);
    expect(text).toMatch(/Found migration files/);
    expect(text).toMatch(/it_first\.js/);
    expect(text).toMatch(/it_second\.js/);
    const files = await fs.readdir(migDir);
    expect(files.filter(f => f.endsWith('.js'))).toHaveLength(2);
  });

  it('definição de collection criada por migration aplicada via REST fica visível (ciclo D1-preview)', async () => {
    // Prévia do redesign D1: a MESMA definição usada na migration, aplicada via
    // pb.collections.import (REST), resulta em collection funcional — é o
    // caminho que a futura implementação REST-based de apply/revert usará.
    const definition = {
      name: 'it_mig_posts_api',
      type: 'base',
      fields: [
        { name: 'title', type: 'text', required: true, max: 200 },
      ],
      indexes: [],
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    };
    await pb.collections.import([definition as any], false);
    try {
      const schema = await call('get_collection_schema', { collection: 'it_mig_posts_api' }, pb);
      expect(JSON.parse(toolText(schema)).name).toBe('it_mig_posts_api');

      const created = await call('create_record', {
        collection: 'it_mig_posts_api', data: { title: 'via migration def' },
      }, pb);
      expect(JSON.parse(toolText(created)).title).toBe('via migration def');
    } finally {
      await pb.collections.delete('it_mig_posts_api').catch(() => {});
    }
  });
});
