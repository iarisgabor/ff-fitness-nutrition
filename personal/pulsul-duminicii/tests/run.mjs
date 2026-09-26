// npm test — pornește site-ul local pe o stare SEPARATĂ (.wrangler/test-state, ștearsă la fiecare
// rulare), cu date sintetice, și rulează suitele în Chromium. Nu atinge Sheet-urile reale, D1/KV/R2
// de producție sau starea ta de `npm run dev`.
//
//   npm test                    toate suitele
//   npm test -- pwa aspect      doar unele
//   npm test -- --capturi       + capturi de ecran în tests/capturi/
//   npm test -- --server        doar pornește site-ul de test (cu datele sintetice) și îl lasă deschis
//
// Detalii și cerințe: tests/README.md.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Fără asta, Playwright nu poate simula lipsa rețelei pentru cererile service worker-ului (pwa.mjs).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const STATE = join(ROOT, '.wrangler', 'test-state');
const PORT = Number(process.env.TEST_PORT || 8788);
const B = `http://127.0.0.1:${PORT}`;
// api-app primul: rulează pe conturile exact cum le lasă seed-ul (celelalte suite schimbă parole)
const ALL_SUITES = ['api-app', 'regresie', 'telefon', 'iphone', 'aspect', 'navigare', 'pwa'];
const args = process.argv.slice(2);
const shots = args.includes('--capturi');
const serverOnly = args.includes('--server');
const chosen = args.filter((a) => !a.startsWith('--'));
const suites = chosen.length ? chosen : ALL_SUITES;
const unknown = suites.filter((s) => !ALL_SUITES.includes(s));
if (unknown.length) { console.error(`Suite necunoscute: ${unknown.join(', ')} (există: ${ALL_SUITES.join(', ')})`); process.exit(2); }

const F = await import('./fixtures.mjs');
const isWin = process.platform === 'win32';
// pe Windows (shell: true) o cale cu spații s-ar rupe în mai multe argumente
const q = (arg) => (isWin && /\s/.test(arg) ? `"${arg}"` : arg);
function wrangler(...cmd) {
  const r = spawnSync('npx', ['wrangler', ...cmd.map(q)], { cwd: ROOT, encoding: 'utf8', shell: isWin, env: { ...process.env, CI: '1' } });
  if (r.status !== 0) throw new Error(`wrangler ${cmd.join(' ')} a eșuat:\n${r.stdout}\n${r.stderr}`);
}

// ---- 1. stare locală nouă: schema D1 + „Sheet-urile" în KV
console.log('Pregătesc datele de test…');
rmSync(STATE, { recursive: true, force: true });
mkdirSync(STATE, { recursive: true });
wrangler('d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', STATE);
const payloadFile = join(STATE, 'payload.json');
const scheduleFile = join(STATE, 'schedule.json');
const attendanceFile = join(STATE, 'attendance.json');
writeFileSync(payloadFile, JSON.stringify(F.buildPayload()));
writeFileSync(scheduleFile, JSON.stringify(F.SCHEDULE));
writeFileSync(attendanceFile, JSON.stringify(F.ATTENDANCE));
wrangler('kv', 'key', 'put', '--binding', 'PULSUL_KV', '--local', '--persist-to', STATE, 'sheet_payload', '--path', payloadFile);
wrangler('kv', 'key', 'put', '--binding', 'PULSUL_KV', '--local', '--persist-to', STATE, 'preacher_schedule', '--path', scheduleFile);
wrangler('kv', 'key', 'put', '--binding', 'PULSUL_KV', '--local', '--persist-to', STATE, 'attendance_sheet', '--path', attendanceFile);

// ---- 2. serverul — parola de test și AI oprit suprascriu orice ai în .dev.vars
const server = spawn('npx', [
  'wrangler', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--persist-to', q(STATE),
  '--var', `ADMIN_PASSWORD:${F.ADMIN.password}`, '--var', 'ANTHROPIC_API_KEY:',
], { cwd: ROOT, shell: isWin, detached: !isWin, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CI: '1' } });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });
function stopServer() {
  if (server.exitCode !== null) return;
  if (isWin) spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F']);
  else { try { process.kill(-server.pid, 'SIGTERM'); } catch { /* deja oprit */ } }
}
process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(130); });

async function waitForServer() {
  for (let i = 0; i < 90; i++) {
    try { if ((await fetch(`${B}/login`)).ok) return; } catch { /* încă pornește */ }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Serverul local nu a pornit în 90s.\n${serverLog.slice(-2000)}`);
}

// ---- 3. conturi și duminici prin API, ca un admin real
async function seedViaApi() {
  const login = await fetch(`${B}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { origin: B, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: F.ADMIN.username, password: F.ADMIN.password, next: '' }),
  });
  const cookie = (login.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  if (login.status !== 303 || !cookie) throw new Error(`Login admin de test eșuat (${login.status}) — .dev.vars suprascrie parola?`);
  const api = async (method, path, body) => {
    const r = await fetch(B + path, { method, headers: { cookie, origin: B, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`${method} ${path} → ${r.status} ${await r.text()}`);
  };
  await api('POST', '/api/conturi', { username: F.MARIUS.username, preacher_name: F.MARIUS.preacher, display_name: F.MARIUS.preacher, password: F.MARIUS.password });
  for (const [date, preacher] of F.PROGRAMS) {
    await api('POST', '/api/program', { date, preacher_name: preacher, from: 'template' });
  }
}

let failed = 0, total = 0;
try {
  await waitForServer();
  await seedViaApi();
  if (serverOnly) {
    console.log(`Site de test: ${B} — ${F.ADMIN.username} / ${F.ADMIN.password}, ${F.MARIUS.username} / ${F.MARIUS.password}. Ctrl+C oprește.`);
    await new Promise(() => {}); // rămâne deschis până la Ctrl+C
  }
  const { launchBrowser, Checks } = await import('./lib.mjs');
  const browser = await launchBrowser();
  console.log(`Site local: ${B} · azi ${F.TODAY} · duminica cu feedback ${F.DAY_WITH_FEEDBACK} · duminica lui Marius ${F.MARIUS_SUNDAY}\n`);
  for (const name of suites) {
    console.log(`▸ ${name}`);
    const t = new Checks(name);
    const run = (await import(`./${name}.mjs`)).default;
    try { await run(t, { B, browser, shots }); }
    catch (err) { t.ok(false, `suita s-a oprit: ${err.message.split('\n')[0]}`); }
    failed += t.fails; total += t.count;
    console.log('');
  }
  await browser.close();
} catch (err) {
  console.error(err.message);
  failed++;
} finally {
  stopServer();
}
console.log(failed ? `✗ ${failed} din ${total} verificări au eșuat` : `✓ toate cele ${total} verificări au trecut`);
process.exit(failed ? 1 : 0);
