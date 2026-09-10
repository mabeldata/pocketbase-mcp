/**
 * CONTRATO MCP — smoke test do transporte stdio real.
 *
 * Spawn `node build/index.js` (o artefato publicado), executa o handshake
 * JSON-RPC por stdin/stdout e chama tools/list. Garante:
 * 1. o build responde no transporte stdio real (não apenas InMemory);
 * 2. durante a sessão ativa, NADA além de mensagens JSON-RPC vai para stdout —
 *    requisito crítico do transporte (um console.log/console.warn no stdout
 *    corrompe o canal; é o risco concreto do BUG-3 getUrl→getURL);
 * 3. o servidor exige POCKETBASE_ADMIN_TOKEN e falha de forma controlada
 *    (exit code != 0 + mensagem em stderr) quando ausente.
 *
 * Cenário pendente ROB-2: no shutdown (SIGTERM/SIGTERM) o servidor escreve
 * "SIGTERM received..." via console.log → STDOUT, corrompendo o canal no fim
 * da sessão. O teste itBug documenta o comportamento esperado (stderr).
 *
 * Pré-requisito: build/ atual (o teste roda `npm run build` se necessário).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawn, execSync, ChildProcessWithoutNullStreams } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { itBug, describeBugs, KNOWN_BUGS } from '../fixtures/known-bugs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');
const buildEntry = path.join(repoRoot, 'build', 'index.js');

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: any;
  error?: any;
}

interface ServerHandle {
  child: ChildProcessWithoutNullStreams;
  stdoutLines: string[];
  stderrChunks: string[];
  stop(): Promise<void>;
}

/** Envia uma mensagem JSON-RPC e espera a resposta com o mesmo id. */
function rpc(
  child: ChildProcessWithoutNullStreams,
  stdoutLines: string[],
  message: Record<string, unknown>,
  timeoutMs = 10000
): Promise<JsonRpcResponse> {
  return new Promise((resolve, reject) => {
    const id = message.id as number;
    const started = Date.now();
    const timer = setInterval(() => {
      for (const line of stdoutLines.splice(0, stdoutLines.length)) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === id) {
            clearInterval(timer);
            resolve(parsed);
            return;
          }
        } catch {
          clearInterval(timer);
          reject(new Error(`stdout não é JSON-RPC válido (canal corrompido): ${line}`));
          return;
        }
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timeout esperando resposta id=${id}; stdout: ${JSON.stringify(stdoutLines)}`));
      }
    }, 25);
    child.stdin.write(JSON.stringify(message) + '\n');
  });
}

const INIT_PARAMS = {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'stdio-smoke', version: '1.0.0' },
};

function startServer(env: Record<string, string> = {}): ServerHandle {
  const child = spawn(process.execPath, [buildEntry], {
    cwd: repoRoot,
    env: {
      ...process.env,
      POCKETBASE_ADMIN_TOKEN: '***',
      POCKETBASE_API_URL: 'http://127.0.0.1:59999', // não precisa existir p/ tools/list
      ...env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  }) as ChildProcessWithoutNullStreams;

  const stdoutLines: string[] = [];
  let stdoutBuf = '';
  child.stdout.setEncoding('utf-8');
  child.stdout.on('data', (chunk: string) => {
    stdoutBuf += chunk;
    let idx: number;
    while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
      stdoutLines.push(stdoutBuf.slice(0, idx));
      stdoutBuf = stdoutBuf.slice(idx + 1);
    }
  });

  const stderrChunks: string[] = [];
  child.stderr.setEncoding('utf-8');
  child.stderr.on('data', (chunk: string) => stderrChunks.push(chunk));

  return {
    child,
    stdoutLines,
    stderrChunks,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGTERM');
      await new Promise<void>(resolve => {
        const t = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5000);
        child.on('exit', () => { clearTimeout(t); resolve(); });
      });
    },
  };
}

async function handshake(srv: ServerHandle): Promise<JsonRpcResponse> {
  const init = await rpc(srv.child, srv.stdoutLines, {
    jsonrpc: '2.0', id: 1, method: 'initialize', params: INIT_PARAMS,
  });
  expect(init.error).toBeUndefined();
  srv.child.stdin.write(
    JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n'
  );
  return init;
}

describe('stdio smoke — build/index.js', () => {
  beforeAll(() => {
    if (!fs.existsSync(buildEntry)) {
      execSync('npm run build', { cwd: repoRoot, stdio: 'inherit' });
    }
  });

  it('handshake + tools/list pelo transporte stdio real, stdout 100% JSON-RPC durante a sessão', async () => {
    const srv = startServer();
    try {
      const init = await handshake(srv);
      expect(init.result.serverInfo.name).toBe('pocketbase-mcp');
      expect(init.result.capabilities.tools).toBeDefined();

      const list = await rpc(srv.child, srv.stdoutLines, {
        jsonrpc: '2.0', id: 2, method: 'tools/list', params: {},
      });
      expect(list.error).toBeUndefined();
      expect(list.result.tools).toHaveLength(33);
      const names = list.result.tools.map((t: any) => t.name);
      expect(names).toContain('list_collections');
      expect(names).toContain('run_cron_job');
      // PR-3: registro aditivo visível pelo transporte stdio real
      expect(names).toContain('delete_record');
      expect(names).toContain('restore_backup');

      // tudo que chegou em stdout ATÉ AQUI parseou como JSON-RPC (o helper
      // rpc() rejeitaria linha não-JSON); nenhuma sobra pendente não-JSON
      for (const line of srv.stdoutLines) {
        if (!line.trim()) continue;
        expect(() => JSON.parse(line), `stdout corrompido: ${line}`).not.toThrow();
      }
    } finally {
      await srv.stop();
    }
  });

  it('callTool list_collections contra server PocketBase INEXISTENTE → isError (não crasha o processo)', async () => {
    const srv = startServer();
    try {
      await handshake(srv);
      const call = await rpc(srv.child, srv.stdoutLines, {
        jsonrpc: '2.0', id: 3, method: 'tools/call',
        params: { name: 'list_collections', arguments: {} },
      }, 15000);
      expect(call.error).toBeUndefined();
      expect(call.result.isError).toBe(true);
      expect(call.result.content[0].text).toMatch(/Error/);
      // processo segue vivo (protocolo continua respondendo)
      expect(srv.child.exitCode).toBeNull();
    } finally {
      await srv.stop();
    }
  });

  it('sem POCKETBASE_ADMIN_TOKEN → exit != 0 com mensagem em stderr (fail-fast)', async () => {
    const env = { ...process.env };
    delete env.POCKETBASE_ADMIN_TOKEN;
    const child = spawn(process.execPath, [buildEntry], {
      cwd: repoRoot, env, stdio: ['pipe', 'pipe', 'pipe'],
    });

    const stderr: string[] = [];
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (c: string) => stderr.push(c));

    const code = await new Promise<number | null>(resolve => {
      child.on('exit', c => resolve(c));
      setTimeout(() => { child.kill('SIGKILL'); resolve(null); }, 10000);
    });

    expect(code, 'processo deveria ter saído com erro').not.toBe(0);
    expect(code).not.toBeNull();
    expect(stderr.join('')).toMatch(/POCKETBASE_ADMIN_TOKEN/);
  });

  describeBugs('ROB-2 — shutdown escreve no stdout (cenário pendente)', () => {
    itBug('mensagem de SIGTERM deve ir para stderr, não stdout', async () => {
      const srv = startServer();
      await handshake(srv);
      srv.child.kill('SIGTERM');
      await new Promise<void>(resolve => {
        const t = setTimeout(() => { srv.child.kill('SIGKILL'); resolve(); }, 5000);
        srv.child.on('exit', () => { clearTimeout(t); resolve(); });
      });
      // dá tempo do flush final
      await new Promise(r => setTimeout(r, 100));

      const stdoutText = srv.stdoutLines.join('\n');
      const stderrText = srv.stderrChunks.join('');
      // EXPECTED (pós-correção): aviso de shutdown em stderr; stdout permanece
      // 100% JSON-RPC parseável até o fim.
      expect(stderrText, KNOWN_BUGS.ROB2_STDOUT_SHUTDOWN).toMatch(/SIGTERM received/);
      for (const line of srv.stdoutLines) {
        if (!line.trim()) continue;
        expect(() => JSON.parse(line), `stdout corrompido no shutdown: ${line}`).not.toThrow();
      }
      expect(stdoutText).not.toMatch(/SIGTERM received/);
    });
  });
});
