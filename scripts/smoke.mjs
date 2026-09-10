/**
 * Local smoke test for the PocketBase MCP server.
 *
 * --contract-only : spawn the built server, run the MCP handshake and verify
 *                   the tools/list contract (names + presence of inputSchema).
 * (default)       : contract check + integration against a real PocketBase
 *                   instance (binary from POCKETBASE_BIN, default
 *                   /tmp/pb-bin/pocketbase), exercising the main tools.
 *
 * Usage: node scripts/smoke.mjs [--contract-only]
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POCKETBASE_BIN = process.env.POCKETBASE_BIN || '/tmp/pb-bin/pocketbase';
// Random port + unique collection names keep runs hermetic (no cross-run
// contamination from a stale instance holding a fixed port).
const PB_PORT = process.env.SMOKE_PB_PORT || String(20000 + Math.floor(Math.random() * 20000));
const PB_URL = `http://127.0.0.1:${PB_PORT}`;
const RUN = Date.now().toString(36);
const POSTS = `smoke_posts_${RUN}`;
const WIDGETS = `smoke_widgets_${RUN}`;
const contractOnly = process.argv.includes('--contract-only');

let failures = 0;
let checks = 0;
function check(name, ok, detail = '') {
  checks++;
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.log(`FAIL  ${name}${detail ? ` -- ${detail}` : ''}`);
  }
}

// --- expected MCP contract: all tools registered by the server ---
const EXPECTED_TOOLS = [
  'add_field_migration', 'apply_all_migrations', 'apply_migration',
  'create_collection_migration', 'create_migration', 'create_record',
  'download_file', 'fetch_record', 'get_collection_schema', 'get_log',
  'get_logs_stats', 'list_collections', 'list_cron_jobs', 'list_logs',
  'list_migrations', 'list_records', 'revert_migration',
  'revert_to_migration', 'run_cron_job', 'set_migrations_directory',
  'update_record', 'upload_file',
].sort();

// ---------------------------------------------------------------------------
// MCP stdio client helper
// ---------------------------------------------------------------------------
function startMcpServer(env) {
  const child = spawn(process.execPath, ['build/index.js'], {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let buf = '';
  const pending = new Map();
  const stderrChunks = [];
  child.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch {
        // Any non-JSON garbage on stdout corrupts the JSON-RPC channel
        failures++;
        console.log(`FAIL  stdout purity -- non-JSON line on stdout: ${line.slice(0, 120)}`);
        continue;
      }
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });
  child.stderr.on('data', (d) => stderrChunks.push(d.toString()));
  let nextId = 1;
  function request(method, params, timeoutMs = 20000) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { pending.delete(id); reject(new Error(`timeout waiting for ${method}`)); }, timeoutMs);
      pending.set(id, (msg) => { clearTimeout(t); resolve(msg); });
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
  }
  async function callTool(name, args) {
    return request('tools/call', { name, arguments: args });
  }
  async function init() {
    const res = await request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'smoke', version: '1.0.0' },
    });
    if (res.error) throw new Error(`initialize failed: ${JSON.stringify(res.error)}`);
    notify('notifications/initialized');
    return res;
  }
  function kill() { try { child.kill('SIGTERM'); } catch {} }
  return { request, notify, callTool, init, kill, stderr: () => stderrChunks.join('') };
}

function toolText(res) {
  const content = res?.result?.content;
  if (Array.isArray(content) && content[0]?.text !== undefined) return content[0].text;
  return JSON.stringify(res);
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}

// ---------------------------------------------------------------------------
// PocketBase instance helpers (integration mode)
// ---------------------------------------------------------------------------
async function waitFor(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`PocketBase did not become healthy at ${url} within ${timeoutMs}ms`);
}

async function getSuperuserToken(email, password) {
  const r = await fetch(`${PB_URL}/api/collections/_superusers/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password }),
  });
  if (!r.ok) throw new Error(`auth-with-password failed: ${r.status} ${await r.text()}`);
  return (await r.json()).token;
}

async function pbFetch(token, urlPath, options = {}) {
  const r = await fetch(`${PB_URL}${urlPath}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: token, ...(options.headers || {}) },
  });
  return r;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const tmpDirs = [];
let pbProc = null;
const mcpServers = [];

async function contractChecks(envToken) {
  const mcp = startMcpServer({ POCKETBASE_API_URL: PB_URL, POCKETBASE_ADMIN_TOKEN: envToken || '***' });
  mcpServers.push(mcp);
  await mcp.init();
  const list = await mcp.request('tools/list', {});
  check('initialize handshake', !!list?.result || !!list?.id);
  const names = (list.result?.tools || []).map((t) => t.name).sort();
  check('tools/list contract (22 tools, exact names)', JSON.stringify(names) === JSON.stringify(EXPECTED_TOOLS),
    names.length === EXPECTED_TOOLS.length ? `order/content diff: ${names.filter(n=>!EXPECTED_TOOLS.includes(n))}/${EXPECTED_TOOLS.filter(n=>!names.includes(n))}` : `got ${names.length}: ${names.join(',')}`);
  check('all tools have inputSchema', (list.result?.tools || []).every((t) => t.inputSchema && typeof t.inputSchema === 'object'));
  // unknown tool must map to MethodNotFound-style error, not crash
  const unknown = await mcp.callTool('does_not_exist', {});
  check('unknown tool -> isError', unknown.result?.isError === true || !!unknown.error, toolText(unknown).slice(0, 120));
  const stderr = mcp.stderr();
  check('no getUrl deprecation warning on stderr', !stderr.includes('Please replace pb.files.getUrl'), stderr.slice(0, 200));
  return mcp;
}

async function integrationChecks(mcp, token) {
  // --- collections ---
  const listCols = await mcp.callTool('list_collections', {});
  const cols = JSON.parse(toolText(listCols));
  check('list_collections returns array incl. _superusers', Array.isArray(cols) && cols.some((c) => c.name === '_superusers'), `count=${Array.isArray(cols) ? cols.length : 'n/a'}`);

  const schema = await mcp.callTool('get_collection_schema', { collection: '_superusers' });
  const schemaObj = JSON.parse(toolText(schema));
  check('get_collection_schema(_superusers) has fields array', Array.isArray(schemaObj.fields), `keys=${Object.keys(schemaObj).join(',')}`.slice(0, 160));

  // --- setup fixture collection via REST (with text + file + json fields) ---
  const createCol = await pbFetch(token, '/api/collections', {
    method: 'POST',
    body: JSON.stringify({
      name: POSTS,
      type: 'base',
      fields: [
        { name: 'content', type: 'text', required: false },
        { name: 'attachment', type: 'file', required: false, maxSelect: 1, maxSize: 1048576 },
        { name: 'payload', type: 'json', required: false },
        { name: 'created', type: 'autodate', onCreate: true },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    }),
  });
  check('fixture collection created (REST setup)', createCol.ok, `${createCol.status} ${(await createCol.text()).slice(0, 200)}`);

  // --- records CRUD ---
  const created = await mcp.callTool('create_record', { collection: POSTS, data: { content: 'hello v0.40', payload: { n: 1 } } });
  const rec = JSON.parse(toolText(created));
  check('create_record returns id', !!rec?.id, toolText(created).slice(0, 200));

  const fetched = await mcp.callTool('fetch_record', { collection: POSTS, id: rec.id });
  const fRec = JSON.parse(toolText(fetched));
  check('fetch_record content roundtrip', fRec?.content === 'hello v0.40', toolText(fetched).slice(0, 200));

  const updated = await mcp.callTool('update_record', { collection: POSTS, id: rec.id, data: { content: 'updated' } });
  check('update_record applied', JSON.parse(toolText(updated))?.content === 'updated', toolText(updated).slice(0, 200));

  const listed = await mcp.callTool('list_records', { collection: POSTS, filter: "content='updated'", sort: '-created', page: 1, perPage: 10 });
  const lText = toolText(listed);
  const lRes = safeJson(lText);
  check('list_records filter+sort -> 1 item', lRes?.totalItems === 1 && lRes?.items?.[0]?.id === rec.id, lText.slice(0, 300));

  const missingArgs = await mcp.callTool('fetch_record', { collection: POSTS });
  check('fetch_record missing id -> isError InvalidParams', missingArgs.result?.isError === true && toolText(missingArgs).includes('InvalidParams'), toolText(missingArgs).slice(0, 160));

  // --- files: upload via tool, download URL via tool ---
  const upload = await mcp.callTool('upload_file', {
    collection: POSTS, recordId: rec.id, fileField: 'attachment',
    fileContent: 'smoke file body', fileName: 'smoke.txt',
  });
  const upRec = upload.result?.content?.[0]?.text || '';
  check('upload_file succeeds', !upload.result?.isError && upRec.includes('uploaded successfully'), upRec.slice(0, 240));

  const download = await mcp.callTool('download_file', { collection: POSTS, recordId: rec.id, fileField: 'attachment' });
  const dText = toolText(download);
  const urlMatch = dText.match(/http\S+/);
  let fileFetched = false;
  if (urlMatch) {
    const fr = await fetch(urlMatch[0].replace(/,$/, ''));
    fileFetched = fr.ok && (await fr.text()) === 'smoke file body';
  }
  check('download_file URL serves the file', fileFetched, dText.slice(0, 200));

  // --- logs ---
  // PocketBase writes request logs asynchronously; retry briefly.
  let logsRes = { items: [] };
  for (let attempt = 0; attempt < 12; attempt++) {
    const logs = await mcp.callTool('list_logs', { page: 1, perPage: 5, sort: '-created' });
    logsRes = safeJson(toolText(logs)) || { items: [] };
    if (Array.isArray(logsRes.items) && logsRes.items.length > 0) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  check('list_logs (with sort) returns items', Array.isArray(logsRes?.items) && logsRes.items.length > 0, JSON.stringify(logsRes).slice(0, 200));

  if (logsRes?.items?.[0]?.id) {
    const one = await mcp.callTool('get_log', { id: logsRes.items[0].id });
    const oneObj = safeJson(toolText(one));
    check('get_log returns the log', oneObj?.id === logsRes.items[0].id, toolText(one).slice(0, 200));
  } else {
    check('get_log returns the log', false, 'no log id available');
  }

  const stats = await mcp.callTool('get_logs_stats', {});
  check('get_logs_stats ok', !stats.result?.isError, toolText(stats).slice(0, 200));

  // --- crons ---
  const crons = await mcp.callTool('list_cron_jobs', {});
  check('list_cron_jobs returns array', Array.isArray(JSON.parse(toolText(crons))), toolText(crons).slice(0, 200));

  const badCron = await mcp.callTool('run_cron_job', { jobId: 'nonexistent-job' });
  check('run_cron_job invalid id -> error surfaced', badCron.result?.isError === true || !!badCron.error || toolText(badCron).toLowerCase().includes('error'), toolText(badCron).slice(0, 200));

  // --- migrations (routing fix + REST execution redesign) ---
  const migDir = path.join(tmpDirs[tmpDirs.length - 1], 'pb_migrations_smoke');
  mkdirSync(migDir, { recursive: true });
  const setDir = await mcp.callTool('set_migrations_directory', { customPath: migDir });
  check('set_migrations_directory routed (was MethodNotFound)', toolText(setDir).includes('Migration directory set to'), toolText(setDir).slice(0, 200));

  const emptyMig = await mcp.callTool('create_migration', { description: 'smoke_empty' });
  check('create_migration writes file', toolText(emptyMig).includes('Created new migration file'), toolText(emptyMig).slice(0, 200));
  const emptyMigFile = toolText(emptyMig).split(':').pop().trim().split('/').pop();

  const colMig = await mcp.callTool('create_collection_migration', {
    description: 'smoke_create_widgets',
    collectionDefinition: {
      id: `smkwidgets${RUN}`, name: WIDGETS, type: 'base',
      fields: [{ name: 'label', type: 'text', required: false }],
      listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    },
  });
  const colMigText = toolText(colMig);
  check('create_collection_migration writes file', colMigText.includes('Created collection migration file'), colMigText.slice(0, 200));
  const colMigFile = colMigText.split(':').pop().trim().split('/').pop();

  const badIdMig = await mcp.callTool('create_collection_migration', {
    description: 'bad_id',
    collectionDefinition: { id: 'bad..id', name: 'bad_id_col', fields: [] },
  });
  check('create_collection_migration rejects v0.33-invalid id', badIdMig.result?.isError === true && toolText(badIdMig).includes('forbids'), toolText(badIdMig).slice(0, 240));

  const applyMig = await mcp.callTool('apply_migration', { migrationFile: colMigFile });
  check('apply_migration via REST creates collection', toolText(applyMig).includes('Successfully applied'), toolText(applyMig).slice(0, 300));
  const verifyCol = await pbFetch(token, `/api/collections/${WIDGETS}`);
  check('WIDGETS collection exists on server after apply', verifyCol.ok, `status=${verifyCol.status}`);

  const listMig = await mcp.callTool('list_migrations', {});
  check('list_migrations sees the files', toolText(listMig).includes(colMigFile), toolText(listMig).slice(0, 200));

  const revertMig = await mcp.callTool('revert_migration', { migrationFile: colMigFile });
  check('revert_migration via REST deletes collection', toolText(revertMig).includes('Successfully reverted'), toolText(revertMig).slice(0, 300));
  const verifyGone = await pbFetch(token, `/api/collections/${WIDGETS}`);
  check('WIDGETS collection gone after revert', verifyGone.status === 404, `status=${verifyGone.status}`);

  // add_field_migration + apply_all + revert_to
  const addField = await mcp.callTool('add_field_migration', {
    collectionNameOrId: POSTS,
    fieldDefinition: { name: 'extra', type: 'text', required: false },
    description: 'smoke_add_extra_field',
  });
  check('add_field_migration writes file', toolText(addField).includes('Created field migration file'), toolText(addField).slice(0, 200));
  const addFieldFile = toolText(addField).split(':').pop().trim().split('/').pop();

  const applyAll = await mcp.callTool('apply_all_migrations', { appliedMigrations: [emptyMigFile, colMigFile] });
  check('apply_all_migrations routed + executes pending', toolText(applyAll).includes('Applied migrations'), toolText(applyAll).slice(0, 300));
  const verifyField = await pbFetch(token, `/api/collections/${POSTS}`);
  const colJson = await verifyField.json();
  check('fixture collection has new field "extra"', (colJson.fields || []).some((f) => f.name === 'extra'), JSON.stringify((colJson.fields||[]).map(f=>f.name)));

  const revertTo = await mcp.callTool('revert_to_migration', { targetMigration: '', appliedMigrations: [colMigFile, addFieldFile] });
  check('revert_to_migration routed + reverts all', toolText(revertTo).includes('Reverted migrations'), toolText(revertTo).slice(0, 300));
  const verifyFieldGone = await pbFetch(token, `/api/collections/${POSTS}`);
  const colJson2 = await verifyFieldGone.json();
  check('field "extra" removed after revert_to', !(colJson2.fields || []).some((f) => f.name === 'extra'), JSON.stringify((colJson2.fields||[]).map(f=>f.name)));

  // manual JSVM migration must fail with explanatory hint, not crash
  writeFileSync(path.join(migDir, '1700000000_manual_jsvm.js'),
    '/// <reference path="../pb_data/types.d.ts" />\nmigrate((app) => {\n  const c = new Collection({});\n  return app.save(c);\n}, (app) => {\n  return null;\n});\n');
  const applyManual = await mcp.callTool('apply_migration', { migrationFile: '1700000000_manual_jsvm.js' });
  check('manual JSVM migration -> explanatory error (no new Function on REST client)',
    applyManual.result?.isError === true && toolText(applyManual).includes('migrate up'), toolText(applyManual).slice(0, 300));

  // stderr purity: no deprecation warnings leaked (getUrl)
  check('stderr has no pb.files.getUrl deprecation warning', !mcp.stderr().includes('Please replace pb.files.getUrl'), mcp.stderr().slice(0, 200));
}

async function main() {
  if (contractOnly) {
    await contractChecks(null);
  } else {
    // --- start ephemeral PocketBase v0.40 instance ---
    const pbDataDir = mkdtempSync(path.join(tmpdir(), 'pb-smoke-'));
    tmpDirs.push(pbDataDir);
    const email = 'smoke@test.local';
    const password = 'smoke12345678';
    const upsert = spawn(POCKETBASE_BIN, ['superuser', 'upsert', email, password, `--dir=${pbDataDir}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((res, rej) => { upsert.on('exit', (c) => c === 0 ? res() : rej(new Error(`superuser upsert exit ${c}`))); upsert.on('error', rej); });

    pbProc = spawn(POCKETBASE_BIN, ['serve', `--http=127.0.0.1:${PB_PORT}`, `--dir=${pbDataDir}`], { stdio: ['ignore', 'pipe', 'pipe'] });
    pbProc.stdout.on('data', () => {});
    pbProc.stderr.on('data', () => {});
    await waitFor(`${PB_URL}/api/health`);
    const token = await getSuperuserToken(email, password);
    check('pocketbase health + superuser auth (REST)', !!token);

    const workDir = mkdtempSync(path.join(tmpdir(), 'pb-smoke-work-'));
    tmpDirs.push(workDir);
    const mcp = await contractChecks(token);
    await integrationChecks(mcp, token);
  }

  console.log(`\n${checks - failures}/${checks} checks passed`);
  for (const m of mcpServers) m.kill();
  if (pbProc) pbProc.kill('SIGTERM');
  for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }); } catch {} }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error('SMOKE CRASHED:', e);
  for (const m of mcpServers) m.kill();
  if (pbProc) pbProc.kill('SIGTERM');
  for (const d of tmpDirs) { try { rmSync(d, { recursive: true, force: true }); } catch {} }
  process.exit(2);
});
