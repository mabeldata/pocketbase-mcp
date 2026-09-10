/**
 * Global setup da suíte de integração (vitest globalSetup).
 *
 * Responsabilidades:
 *  1. resolver/baixar o binário do PocketBase (cache compartilhado;
 *     POCKETBASE_VERSION escolhe a versão — matriz de compat);
 *  2. bootar instância ephemera: porta EPHEMERA asignada pelo SO + pb_data em
 *     tmpdir único (NUNCA compartilhar porta/dir fixos — workers de outras
 *     tarefas podem subir instâncias concorrentes na mesma máquina);
 *  3. criar superuser com identidade ÚNICA por run (mcp+<pid>+<rand>@...) —
 *     o auth-with-password succeeding com essa identidade PROVA que o server
 *     que responde é o nosso (evita cross-talk com instâncias alheias);
 *  4. gravar o estado (url, token, dir, pid) em tests/integration/.server.json
 *     para os testes lerem (globalSetup roda em processo separado; env vars
 *     não propagam de forma confiável para os workers do vitest);
 *  5. teardown: mata o processo e remove tmpdir + state file.
 *
 * Se o binário não puder ser baixado/executado (sem rede, OS não suportado),
 * o setup grava `.server.json` com { skipped: reason } e os testes pulam com
 * mensagem clara — a suíte NÃO falha por infraestrutura indisponível.
 */
import { spawn, execFileSync, ChildProcess } from 'child_process';
import fs from 'fs';
import fsp from 'fs/promises';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_FILE = path.join(__dirname, '.server.json');
const FETCH_SCRIPT = path.join(__dirname, 'bin', 'fetch-pocketbase.py');
const VERSION = process.env.POCKETBASE_VERSION || 'v0.40.3';
const SUPERUSER_EMAIL = `mcp+${process.pid}+${Math.random().toString(36).slice(2, 8)}@tests.local`;
const SUPERUSER_PASSWORD = 'Integr…2026';

interface ServerState {
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

function writeState(state: ServerState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function resolveBinary(cacheDir: string): Promise<string> {
  // 1) POCKETBASE_BIN: caminho direto para um binário já preparado (usado pelo
  //    CI, que baixa/extrai o binário num passo anterior). Tem precedência.
  const explicitBin = process.env.POCKETBASE_BIN;
  if (explicitBin) {
    if (!fs.existsSync(explicitBin)) {
      throw new Error(`POCKETBASE_BIN aponta para arquivo inexistente: ${explicitBin}`);
    }
    return path.resolve(explicitBin);
  }
  // 2) download/cache via script python (stdlib zipfile; não depende de `unzip`).
  const python = process.env.PYTHON_BIN || 'python3';
  const out = execFileSync(python, [FETCH_SCRIPT, VERSION, cacheDir], {
    encoding: 'utf-8',
    timeout: 300_000,
  });
  const line = out.trim().split('\n').find(l => l.startsWith('BIN='));
  if (!line) throw new Error(`fetch-pocketbase.py não retornou BIN=: ${out}`);
  return line.slice(4);
}

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      if (typeof addr === 'object' && addr) {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close(() => reject(new Error('failed to allocate port')));
      }
    });
  });
}

async function waitForHealth(url: string, proc: ChildProcess, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  let lastErr = '';
  while (Date.now() - start < timeoutMs) {
    if (proc.exitCode !== null || proc.killed) {
      throw new Error(`pocketbase morreu durante o boot (exit=${proc.exitCode}): ${lastErr}`);
    }
    try {
      const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
      lastErr = `health ${res.status}`;
    } catch (e: any) {
      lastErr = e?.message || String(e);
    }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`health timeout após ${timeoutMs}ms: ${lastErr}`);
}

async function obtainToken(url: string, identity: string, password: string): Promise<string> {
  const res = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, password }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`auth-with-password falhou (${res.status}): ${body}`);
  }
  const data: any = await res.json();
  if (!data?.token) throw new Error('auth-with-password não retornou token');
  // A identidade única garante que este token veio do NOSSO server.
  return data.token as string;
}

export default async function setup(): Promise<() => Promise<void>> {
  let proc: ChildProcess | undefined;
  let dataDir: string | undefined;
  let emptyMigDir: string | undefined;

  const cacheDir = process.env.PB_BIN_DIR || path.join(os.homedir(), '.cache', 'pocketbase-mcp-tests');

  try {
    const bin = await resolveBinary(cacheDir);
    // versão real do binário (POCKETBASE_BIN pode vir do CI sem POCKETBASE_VERSION)
    let detectedVersion = VERSION;
    try {
      const vOut = execFileSync(bin, ['--version'], { encoding: 'utf-8', timeout: 15_000 }).trim();
      const m = vOut.match(/v?\d+\.\d+\.\d+/);
      if (m) detectedVersion = m[0].startsWith('v') ? m[0] : `v${m[0]}`;
    } catch { /* mantém VERSION do env */ }
    dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pbmcp-int-'));
    // ISOLAMENTO CRÍTICO: o CLI do PocketBase usa <cwd>/pb_migrations por
    // padrão — diretório compartilhado entre processos na máquina já causou
    // cross-contamination (migrations de outros workers sendo aplicadas no
    // nosso serve). Sempre passar --migrationsDir explícito e vazio.
    emptyMigDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pbmcp-intmig-'));

    // 1) superuser offline (CLI, sem servidor rodando)
    execFileSync(bin, [
      'superuser', 'upsert', SUPERUSER_EMAIL, SUPERUSER_PASSWORD,
      '--dir', dataDir, '--migrationsDir', emptyMigDir,
    ], {
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // 2) serve em porta ephemera (retry: porta pode ser tomada entre alocação e bind)
    let url = '';
    let lastBootErr: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      const port = await getFreePort();
      url = `http://127.0.0.1:${port}`;
      proc = spawn(bin, [
        'serve', '--http', `127.0.0.1:${port}`,
        '--dir', dataDir, '--migrationsDir', emptyMigDir!,
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stderrBuf = '';
      proc.stderr?.setEncoding('utf-8');
      proc.stderr?.on('data', (c: string) => { stderrBuf += c; });
      try {
        await waitForHealth(url, proc);
        lastBootErr = null;
        break;
      } catch (e) {
        lastBootErr = e;
        proc.kill('SIGKILL');
        await new Promise(r => proc!.on('exit', r));
        proc = undefined;
        if (!/address already in use|morreu durante o boot/.test(String(e)) && !stderrBuf.includes('address already in use')) {
          break; // erro não-porta: não adianta retryar
        }
      }
    }
    if (!proc || lastBootErr) {
      throw lastBootErr || new Error('não foi possível bootar o pocketbase');
    }

    // 3) token (identidade única → prova de propriedade da instância)
    const token = await obtainToken(url, SUPERUSER_EMAIL, SUPERUSER_PASSWORD);

    writeState({
      version: detectedVersion,
      bin,
      url,
      token,
      dataDir,
      pid: proc.pid,
      superuserEmail: SUPERUSER_EMAIL,
      superuserPassword: SUPERUSER_PASSWORD,
    });
    console.log(`[integration] PocketBase ${detectedVersion} pronto em ${url} (pid ${proc.pid}, dir ${dataDir}, bin ${bin})`);
  } catch (e: any) {
    const reason = `PocketBase indisponível para integração: ${e?.message || e}`;
    writeState({ skipped: reason });
    console.warn(`[integration] SKIP — ${reason}`);
  }

  // teardown
  return async () => {
    if (proc && proc.exitCode === null) {
      proc.kill('SIGTERM');
      await new Promise<void>(resolve => {
        const t = setTimeout(() => { proc?.kill('SIGKILL'); resolve(); }, 10_000);
        proc!.on('exit', () => { clearTimeout(t); resolve(); });
      });
    }
    if (dataDir) {
      await fsp.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    }
    if (emptyMigDir) {
      await fsp.rm(emptyMigDir, { recursive: true, force: true }).catch(() => {});
    }
    await fsp.rm(STATE_FILE, { force: true }).catch(() => {});
  };
}
