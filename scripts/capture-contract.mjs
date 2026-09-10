// Captures the tools/list contract from the built server over stdio.
// Usage: node scripts/capture-contract.mjs [output.json]
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const outFile = process.argv[2] || 'contract-snapshot.json';

const child = spawn(process.execPath, ['build/index.js'], {
  env: { ...process.env, POCKETBASE_API_URL: 'http://127.0.0.1:8090', POCKETBASE_ADMIN_TOKEN: '***' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

let buf = '';
const pending = new Map();
child.stdout.on('data', (d) => {
  buf += d.toString();
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});
child.stderr.on('data', () => {});

function send(obj) { child.stdin.write(JSON.stringify(obj) + '\n'); }
function request(id, method, params) {
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
  });
}

const timeout = setTimeout(() => { console.error('TIMEOUT'); child.kill(); process.exit(1); }, 15000);

const init = await request(1, 'initialize', {
  protocolVersion: '2024-11-05',
  capabilities: {},
  clientInfo: { name: 'capture-contract', version: '1.0.0' },
});
if (init.error) { console.error('initialize error', init.error); process.exit(1); }
send({ jsonrpc: '2.0', method: 'notifications/initialized' });

const list = await request(2, 'tools/list', {});
if (list.error) { console.error('tools/list error', list.error); process.exit(1); }

const tools = list.result.tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }))
  .sort((a, b) => a.name.localeCompare(b.name));

writeFileSync(outFile, JSON.stringify(tools, null, 2) + '\n');
console.log(`Captured ${tools.length} tools -> ${outFile}`);
console.log(tools.map(t => t.name).join('\n'));
clearTimeout(timeout);
child.kill();
process.exit(0);
