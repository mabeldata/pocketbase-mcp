/**
 * Payloads de resposta no formato devolvido pelo PocketBase v0.40.x,
 * usados como retorno dos mocks nos testes unitários e como referência
 * de forma (shape) para os testes de integração.
 *
 * Fontes das mudanças de forma (diagnóstico t_e266f9f8):
 * - v0.23+: collections usam `fields` (não `schema`)
 * - v0.27+: field type `geoPoint`
 * - v0.38.1: `indexes` normalizados pelo server (strings CREATE INDEX ...)
 * - v0.40: Log.Data truncado a ~16KB com marcador __pb_truncated__
 * - v0.28: default max do field json = 1MB (novos erros de validação)
 * - v0.33: validação de caracteres em id
 */
import { ClientResponseError } from 'pocketbase';

export const sampleRecord = {
  id: 'rec1234567890abc',
  collectionId: 'pbc_1234567890',
  collectionName: 'posts',
  created: '2026-09-01 10:00:00.000Z',
  updated: '2026-09-01 10:00:00.000Z',
  title: 'Hello world',
  status: 'active',
  expand: undefined as unknown,
};

export const sampleRecordWithExpand = {
  ...sampleRecord,
  id: 'book1234567890abcd',
  author: 'auth1234567890abc',
  expand: {
    author: {
      id: 'auth1234567890abc',
      collectionId: 'pbc_0987654321',
      collectionName: 'authors',
      name: 'Ada Lovelace',
    },
  },
};

export function sampleListResult<T>(
  items: T[],
  page = 1,
  perPage = 30,
  totalItems = items.length
) {
  return {
    page,
    perPage,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / perPage)),
    items,
  };
}

/** Collection base no formato v0.40 (fields + indexes normalizados + geoPoint). */
export const sampleCollectionV40 = {
  id: 'pbc_1234567890',
  name: 'posts',
  type: 'base',
  system: false,
  created: '2026-09-01 10:00:00.000Z',
  updated: '2026-09-01 10:00:00.000Z',
  fields: [
    {
      autodate: true,
      hidden: false,
      id: 'autodate_created',
      name: 'created',
      onCreate: true,
      onUpdate: false,
      presentable: false,
      system: false,
      type: 'autodate',
    },
    {
      hidden: false,
      id: 'text_title',
      max: 255,
      min: 0,
      name: 'title',
      pattern: '',
      presentable: true,
      primary: false,
      required: true,
      system: false,
      type: 'text',
    },
    {
      hidden: false,
      id: 'geopoint_loc',
      max: 90,
      min: -90,
      name: 'location',
      presentable: false,
      required: false,
      system: false,
      type: 'geoPoint',
    },
  ],
  // v0.38.1+: sempre strings SQL normalizadas
  indexes: ['CREATE INDEX `idx_posts_title` ON `posts` (`title`)'],
  listRule: null,
  viewRule: null,
  createRule: null,
  updateRule: null,
  deleteRule: null,
};

export const sampleSystemCollections = ['_superusers', '_externalAuths', '_authOrigins', '_mfas', '_otps'];

export const sampleLog = {
  id: 'log1234567890abc',
  created: '2026-09-01 10:00:01.000Z',
  level: 2,
  message: '200 GET /api/health',
  data: {
    method: 'GET',
    url: '/api/health',
    status: 200,
  },
};

/** Log.Data truncado pelo server v0.40 (payload > ~16KB). */
export const sampleTruncatedLogData = {
  request: { method: 'POST', url: '/api/collections/posts/records' },
  '__pb_truncated__': true,
};

export const sampleLogsStats = [
  { total: 120, label: '2026-09-01' },
  { total: 95, label: '2026-09-02' },
];

export const sampleCronJob = {
  id: 'deleteOldLogs',
  name: 'deleteOldLogs',
  schedule: '0 2 * * *',
};

/**
 * Constrói um ClientResponseError real do SDK (0.28.1) como o server devolveria.
 * `data` é o mapa de erros por campo (response.data), padrão do PocketBase.
 */
export function makeClientResponseError(
  status: number,
  data: Record<string, { code: string; message: string }> = {},
  message = 'Something went wrong while processing your request.'
): ClientResponseError {
  return new ClientResponseError({
    status,
    response: { code: status, message, data },
  });
}

/** Erro de validação json > 1MB (default max introduzido no server v0.28). */
export const jsonTooLargeError = () =>
  makeClientResponseError(
    400,
    { payload: { code: 'validation_max_size', message: 'Must be less than 1048576.' } },
    'Failed to create record.'
  );

/** Erro de id com caracteres proibidos (validação introduzida no server v0.33). */
export const invalidIdError = () =>
  makeClientResponseError(
    400,
    { id: { code: 'validation_invalid_id', message: 'The model id contains invalid characters.' } },
    'Failed to create record.'
  );

export const unauthorizedError = () =>
  makeClientResponseError(401, {}, 'The request requires valid authorization token.');

export const notFoundError = () =>
  makeClientResponseError(404, {}, "The requested resource wasn't found.");
