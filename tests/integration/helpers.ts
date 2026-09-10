/**
 * Helper dos testes de integração: lê o estado gravado pelo globalSetup
 * (tests/integration/.server.json) e expõe client PocketBase real + skip
 * uniforme quando a infraestrutura não estiver disponível.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PocketBase from 'pocketbase';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '.server.json');

export interface IntegrationServerState {
  skipped?: string;
  version?: string;
  bin?: string;
  url?: string;
  token?: string;
  dataDir?: string;
  pid?: number;
  superuserEmail?: string;
  superuserPassword?: string;
}

export function readServerState(): IntegrationServerState {
  if (!fs.existsSync(STATE_FILE)) {
    return { skipped: 'estado da integração ausente (.server.json) — rode via `npm run test:integration`' };
  }
  return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
}

/** Motivo do skip (ou null se o server está disponível). */
export function integrationSkipReason(): string | null {
  const state = readServerState();
  if (state.skipped) return state.skipped;
  if (!state.url || !state.token) return 'estado de integração incompleto (url/token ausentes)';
  return null;
}

/** Client PocketBase real autenticado como o superuser do run. */
export function createIntegrationClient(): PocketBase {
  const state = readServerState();
  if (!state.url || !state.token) {
    throw new Error(`integration client indisponível: ${integrationSkipReason()}`);
  }
  const pb = new PocketBase(state.url);
  pb.autoCancellation(false);
  pb.authStore.save(state.token, null);
  return pb;
}

/** URL base do server de integração. */
export function integrationUrl(): string {
  return readServerState().url!;
}

/** Caminho do binário (para testes que invocam CLI, ex.: migrate up). */
export function integrationBin(): string {
  return readServerState().bin!;
}

/** Diretório pb_data do server de integração. */
export function integrationDataDir(): string {
  return readServerState().dataDir!;
}

/** Versão do PocketBase sob teste (ex.: "v0.40.3"). */
export function integrationVersion(): string {
  return readServerState().version || 'desconhecida';
}
