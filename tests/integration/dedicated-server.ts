/**
 * Helper para subir uma instância PocketBase DEDICADA por arquivo de teste
 * (mesmo padrão do scripts/smoke.mjs e do setup.ts global, mas em processo).
 *
 * Por quê: a suíte PR-3 exercita endpoints que mexem no estado global do
 * server (DELETE /api/logs, POST /api/sql, /api/batch, backups em fila,
 * PATCH /api/settings). No CI (Node 18/20) isso se manifestou como o server
 * compartilhado travando o write-path para os arquivos-irmãos
 * (migrations-rest/files/auth-health estourando timeouts em cascata). Com
 * instância própria, qualquer lock/backpressure fica contido neste arquivo.
 */
import { spawn, execFileSync, ChildProcess } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import PocketBase from 'pocketbase';
import { readServerState } from './helpers.js';

export interface DedicatedServer {
  bin: string;
  version: string;
  url: string;
  token: string;
  client: PocketBase;
  stop(): Promise<void>;
}

function resolveBin(): string | null {
  const explicit = process.env.POCKETBASE_BIN;
  if (explicit && fs.existsSync(explicit)) return path.resolve(explicit);
  const state = readServerState();
  if (state.bin && fs.existsSync(state.bin)) return state.bin;
  return null;
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url: string, proc: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (proc.exitCode !== null) throw new Error(`pocketbase morreu no boot (exit=${proc.exitCode})`);
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('health timeout na instância dedicada');
}

/**
 * Boota uma instância ephemera dedicada (porta SO, pb_data + migrationsDir
 * próprios — NUNCA compartilhar migrationsDir: armadilha conhecida).
 * Retorna null se o binário não estiver disponível (suíte pula).
 */
export async function startDedicatedPocketBase(): Promise<DedicatedServer | null> {
  const bin = resolveBin();
  if (!bin) return null;

  let version = 'desconhecida';
  try {
    const vOut = execFileSync(bin, ['--version'], { encoding: 'utf-8', timeout: 15_000 }).trim();
    const m = vOut.match(/v?\d+\.\d+\.\d+/);
    if (m) version = m[0].startsWith('v') ? m[0] : `v${m[0]}`;
  } catch { /* mantém 'desconhecida' */ }

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbmcp-ded-'));
  const migDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pbmcp-dedmig-'));
  const email = `ded+${process.pid}+${Math.random().toString(36).slice(2, 8)}@tests.local`;
  const password = 'Dedicat…2026';

  let proc: ChildProcess | undefined;
  let url = '';
  try {
    execFileSync(bin, ['superuser', 'upsert', email, password,
      `--dir=${dataDir}`, `--migrationsDir=${migDir}`],
      { encoding: 'utf-8', timeout: 120_000, stdio: ['ignore', 'pipe', 'pipe'] });

    // retry em porta tomada entre alocação e bind
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      const port = await getFreePort();
      url = `http://127.0.0.1:${port}`;
      proc = spawn(bin, ['serve', `--http=127.0.0.1:${port}`,
        `--dir=${dataDir}`, `--migrationsDir=${migDir}`],
        { stdio: ['ignore', 'ignore', 'ignore'] });
      try {
        await waitForHealth(url, proc);
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        proc.kill('SIGKILL');
        proc = undefined;
      }
    }
    if (!proc || lastErr) throw lastErr || new Error('não foi possível bootar a instância dedicada');

    const authRes = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: email, password }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!authRes.ok) throw new Error(`auth dedicado falhou: ${authRes.status}`);
    const token = (await authRes.json() as { token?: string }).token;
    if (!token) throw new Error('auth dedicado não retornou token');

    const client = new PocketBase(url);
    client.autoCancellation(false);
    client.authStore.save(token, null);

    return {
      bin, version, url, token, client,
      async stop() {
        if (proc && proc.exitCode === null) {
          proc.kill('SIGTERM');
          await new Promise<void>(resolve => {
            const t = setTimeout(() => { proc?.kill('SIGKILL'); resolve(); }, 8_000);
            proc!.on('exit', () => { clearTimeout(t); resolve(); });
          });
        }
        fs.rmSync(dataDir, { recursive: true, force: true });
        fs.rmSync(migDir, { recursive: true, force: true });
      },
    };
  } catch (e) {
    if (proc && proc.exitCode === null) proc.kill('SIGKILL');
    fs.rmSync(dataDir, { recursive: true, force: true });
    fs.rmSync(migDir, { recursive: true, force: true });
    throw e;
  }
}
