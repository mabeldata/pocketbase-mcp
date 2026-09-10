/**
 * Fábrica de client PocketBase fake para testes unitários.
 *
 * Os handlers de tools recebem `pb` por parâmetro (injeção explícita), então
 * NÃO é necessário vi.mock('pocketbase') — basta passar o mock criado aqui.
 *
 * Cada método é um vi.fn() sem implementação; os testes configuram
 * mockResolvedValue conforme o cenário e inspecionam as chamadas.
 */
import { vi } from 'vitest';

export interface MockRecordService {
  getOne: ReturnType<typeof vi.fn>;
  getList: ReturnType<typeof vi.fn>;
  getFirstListItem: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

export interface MockPocketBase {
  collection(name: string): MockRecordService;
  collections: {
    getOne: ReturnType<typeof vi.fn>;
    getFullList: ReturnType<typeof vi.fn>;
    import: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    // PR-3 (server v0.37+): scaffolds + dry-run de view query
    getScaffolds: ReturnType<typeof vi.fn>;
    dryRunViewQuery: ReturnType<typeof vi.fn>;
  };
  logs: {
    getList: ReturnType<typeof vi.fn>;
    getOne: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
    truncate: ReturnType<typeof vi.fn>;
  };
  crons: {
    getFullList: ReturnType<typeof vi.fn>;
    run: ReturnType<typeof vi.fn>;
  };
  files: {
    getUrl: ReturnType<typeof vi.fn>;
    getURL: ReturnType<typeof vi.fn>;
    getToken: ReturnType<typeof vi.fn>;
  };
  // PR-3: SQL console (v0.39), backups, settings, batch (transacional)
  sql: {
    run: ReturnType<typeof vi.fn>;
  };
  backups: {
    getFullList: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  settings: {
    getAll: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  createBatch: ReturnType<typeof vi.fn>;
  __batchRequests: Array<{ collection: string; method: string; id?: string; data?: any }>;
  health: {
    check: ReturnType<typeof vi.fn>;
  };
  authStore: {
    save: ReturnType<typeof vi.fn>;
    clear: ReturnType<typeof vi.fn>;
    token: string;
    isValid: boolean;
    isSuperuser: boolean;
  };
  autoCancellation: ReturnType<typeof vi.fn>;
  /** Helpers de inspeção para os testes. */
  __recordServices: Map<string, MockRecordService>;
  __collectionCalls: string[];
}

export function createMockRecordService(): MockRecordService {
  return {
    getOne: vi.fn(),
    getList: vi.fn(),
    getFirstListItem: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

export function createMockPocketBase(): MockPocketBase {
  const recordServices = new Map<string, MockRecordService>();
  const collectionCalls: string[] = [];
  const batchRequests: Array<{ collection: string; method: string; id?: string; data?: any }> = [];

  /**
   * Mock fiel ao contrato do SubBatchService do SDK: os verbos só EMPILHAM
   * requests; send() devolve um resultado por request empilhado e limpa a
   * fila (o batch real é one-shot por instância do createBatch()).
   */
  const createBatch = vi.fn(() => {
    const queued: Array<{ collection: string; method: string; id?: string; data?: any }> = [];
    const sub = (collection: string) => ({
      create: (data?: any) => { queued.push({ collection, method: 'POST', data }); },
      update: (id: string, data?: any) => { queued.push({ collection, method: 'PATCH', id, data }); },
      upsert: (data?: any) => { queued.push({ collection, method: 'PUT', id: data?.id, data }); },
      delete: (id: string) => { queued.push({ collection, method: 'DELETE', id }); },
    });
    return {
      collection: vi.fn((name: string) => sub(name)),
      send: vi.fn(async () => {
        batchRequests.push(...queued);
        return queued.map((q, i) => ({
          status: q.method === 'DELETE' ? 204 : 200,
          body: q.method === 'DELETE' ? null : { id: `batch_rec_${i}`, ...q.data },
        }));
      }),
    };
  });

  const pb = {
    collection(name: string): MockRecordService {
      collectionCalls.push(name);
      if (!recordServices.has(name)) {
        recordServices.set(name, createMockRecordService());
      }
      return recordServices.get(name)!;
    },
    collections: {
      getOne: vi.fn(),
      getFullList: vi.fn(),
      import: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      // PR-3 (SDK 0.27+, server v0.37+)
      getScaffolds: vi.fn(),
      dryRunViewQuery: vi.fn(),
    },
    logs: {
      getList: vi.fn(),
      getOne: vi.fn(),
      getStats: vi.fn(),
      // presente no SDK 0.28+ (endpoint DELETE /api/logs do server v0.40)
      truncate: vi.fn(),
    },
    crons: {
      getFullList: vi.fn(),
      run: vi.fn(),
    },
    files: {
      // getUrl: alias deprecated (emite console.warn no SDK real)
      getUrl: vi.fn(),
      // getURL: substituto recomendado (SDK >= 0.26.7)
      getURL: vi.fn(),
      getToken: vi.fn(),
    },
    // PR-3: SQL console (v0.39), backups, settings, batch (transacional)
    sql: {
      run: vi.fn(),
    },
    backups: {
      getFullList: vi.fn(),
      create: vi.fn(),
      restore: vi.fn(),
      delete: vi.fn(),
    },
    settings: {
      getAll: vi.fn(),
      update: vi.fn(),
    },
    createBatch,
    __batchRequests: batchRequests,
    health: {
      check: vi.fn(),
    },
    authStore: {
      save: vi.fn(),
      clear: vi.fn(),
      token: 'mock-superuser-token',
      isValid: true,
      isSuperuser: true,
    },
    autoCancellation: vi.fn(),
    __recordServices: recordServices,
    __collectionCalls: collectionCalls,
  };

  return pb as MockPocketBase;
}

/** Atalho: mock com a service de uma collection já populada. */
export function createMockPocketBaseWithCollection(
  name: string,
  service: Partial<MockRecordService>
): MockPocketBase {
  const pb = createMockPocketBase();
  const svc = pb.collection(name);
  Object.assign(svc, service);
  pb.__collectionCalls.length = 0; // limpa a chamada de setup
  return pb;
}
