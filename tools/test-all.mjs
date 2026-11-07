// 一键测试入口 — node tools/test-all.mjs [--fast] [--no-server]
//
// 串行运行全部测试套件，自动按需拉起本地 HTTPS 服务器（结束后关闭），
// 输出每套耗时与结果，任一失败则整体失败。
//
//   --fast       跳过耗时较长的压力/性能套件（plane-fuzz、perf-browser）
//   --no-server  假定 8443 已在运行，不自动拉起（用于 CI 里已有服务的情况）
import { spawn, spawnSync } from 'node:child_process';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE = process.execPath;
const FAST = process.argv.includes('--fast');
const NO_SERVER = process.argv.includes('--no-server');

const SUITES = [
  { name: '模型几何自检', file: 'tools/check-models.mjs' },
  { name: '切割表完整性', file: 'tools/check-calibration.mjs' },
  { name: '切割单元测试', file: 'test/run-tests.mjs' },
  { name: '进度成就逻辑', file: 'test/progress-tests.mjs' },
  { name: '模糊测试', file: 'test/fuzz-tests.mjs' },
  { name: '随机平面压力', file: 'test/plane-fuzz.mjs', slow: true },
  { name: '结构回归基线', file: 'test/regression.mjs' },
  { name: '视觉回归', file: 'test/visual-regression.mjs', server: true },
  { name: '综合端到端', file: 'test/e2e-comprehensive.mjs', server: true },
  { name: '离线单文件端到端', file: 'test/offline-e2e.mjs' },
  { name: 'APK 运行链路端到端', file: 'test/apk-serve-e2e.mjs' },
  { name: '浏览器性能', file: 'test/perf-browser.mjs', slow: true, server: true },
].filter((s) => !(FAST && s.slow));

function serverUp() {
  return new Promise((resolve) => {
    const req = https.get({ host: '127.0.0.1', port: 8443, path: '/', rejectUnauthorized: false, timeout: 1200 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function waitServer(ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await serverUp()) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

const needServer = SUITES.some((s) => s.server);
let serverProc = null;

if (needServer && !NO_SERVER) {
  if (await serverUp()) {
    console.log('· 检测到 8443 已在运行，复用现有服务器');
  } else {
    console.log('· 启动本地服务器…');
    serverProc = spawn(NODE, [path.join(ROOT, 'server.mjs')], { cwd: ROOT, stdio: 'ignore' });
    if (!(await waitServer())) {
      console.error('✗ 服务器启动失败（8443 未就绪）');
      if (serverProc) serverProc.kill();
      process.exit(1);
    }
    console.log('· 服务器已就绪');
  }
}

const results = [];
const t0 = Date.now();

for (const suite of SUITES) {
  const start = Date.now();
  process.stdout.write(`\n=== ${suite.name} (${suite.file}) ===\n`);
  const r = spawnSync(NODE, [path.join(ROOT, suite.file)], {
    cwd: ROOT, encoding: 'utf8', timeout: 600000,
  });
  const out = ((r.stdout || '') + (r.stderr || '')).trim();
  // 只打印最后几行，避免刷屏；失败时打印更多
  const lines = out.split('\n').filter((l) => l !== '');
  const tail = r.status === 0 ? lines.slice(-3) : lines.slice(-20);
  for (const l of tail) console.log('  ' + l);
  const secs = ((Date.now() - start) / 1000).toFixed(1);
  const ok = r.status === 0;
  results.push({ name: suite.name, ok, secs });
  console.log(`  → ${ok ? 'PASS' : 'FAIL'} (${secs}s)`);
}

if (serverProc) serverProc.kill();

const failed = results.filter((r) => !r.ok);
const total = ((Date.now() - t0) / 1000).toFixed(1);
console.log('\n================ 汇总 ================');
for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name.padEnd(14, ' ')} ${r.secs}s`);
console.log('--------------------------------------');
console.log(`${results.length - failed.length}/${results.length} 套件通过，总耗时 ${total}s`);
process.exit(failed.length ? 1 : 0);
