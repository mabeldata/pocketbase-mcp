/**
 * INTEGRAÇÃO — auth, health e superfície básica do client contra PocketBase REAL.
 *
 * Comportamentos validados empiricamente no binário v0.40.3 (probe 2026-09-10):
 * - pb.health.check() RETORNA o body { code: 200, message, data } (não void)
 * - corpo de erro 401: { data: {}, message, status: 401 } — sem campo `code`
 * Pula uniformemente se o binário não estiver disponível (ver setup.ts).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import PocketBase, { ClientResponseError } from 'pocketbase';
import {
  integrationSkipReason, createIntegrationClient, readServerState, integrationUrl,
} from './helpers.js';

const skipReason = integrationSkipReason();
const describeI = skipReason ? describe.skip : describe;

describeI('integração — auth & health', () => {
  let pb: PocketBase;

  beforeAll(() => {
    pb = createIntegrationClient();
  });

  it('o server de integração está no ar e responde /api/health', async () => {
    const res = await fetch(`${integrationUrl()}/api/health`);
    expect(res.ok).toBe(true);
    const body: any = await res.json();
    expect(body.code).toBe(200);
    expect(body.message).toMatch(/healthy/i);
  });

  it('pb.health.check() retorna o body de saúde (proposta de check no startup do MCP)', async () => {
    const health: any = await pb.health.check();
    expect(health.code).toBe(200);
    expect(health.message).toMatch(/healthy/i);
  });

  it('token de superuser é aceito: authStore válida + acesso a /api/collections', async () => {
    expect(pb.authStore.isValid).toBe(true);
    const cols = await pb.collections.getList(1, 1);
    expect(cols.totalItems).toBeGreaterThan(0);
    // server >= v0.23: o modelo de admin é a collection _superusers
    const names = (await pb.collections.getFullList({ filter: 'system=true' })).map(c => c.name);
    expect(names).toContain('_superusers');
  });

  it('o token obtido pertence à instância deste run (identidade única)', async () => {
    const state = readServerState();
    // authWithPassword com a identidade única criada no setup: se responder,
    // este é inequivocamente o NOSSO server (sem cross-talk de porta).
    const auth = await pb.collection('_superusers').authWithPassword(
      state.superuserEmail!, state.superuserPassword!
    );
    expect(auth.token).toBeTruthy();
    expect(auth.record.email).toBe(state.superuserEmail);
  });

  it('token inválido → ClientResponseError 401 do SDK 0.28 (status + response preservados)', async () => {
    const bad = new PocketBase(integrationUrl());
    bad.authStore.save('token-invalido', null);
    let err: any;
    try {
      await bad.collections.getList(1, 1);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ClientResponseError);
    expect(err.status).toBe(401);
    // corpo real do v0.40.3: { data, message, status } — `code` NÃO existe
    expect(err.response?.status).toBe(401);
    expect(typeof err.response?.message).toBe('string');
  });

  it('client sem token → 401 em rota de superuser', async () => {
    const anon = new PocketBase(integrationUrl());
    await expect(anon.collections.getList(1, 1)).rejects.toMatchObject({ status: 401 });
  });
});
