// 稳定性浸泡测试 — node test/soak.mjs [--minutes=30]
//
// 循环随机开局（含 8 块极限关），监控：
//   - JS 堆内存增长（前 1/3 均值 vs 后 1/3 均值，< 50%）
//   - 单次开局耗时（切割 + 构建）均值/最大值
//   - 控制台错误、页面异常、致命覆盖层
// 注意：完整 30 分钟请在发版前跑；日常可用 --minutes=3 做快速稳定性检查。
import { spawn } from 'node:child_process';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9515;
const URL = 'https://localhost:8443/';
const MINUTES = Math.max(0.2, Number((process.argv.find((a) => a.startsWith('--minutes=')) || '').split('=')[1] || process.env.SOAK_MINUTES || 30));

const chrome = spawn(CHROME, [
  '--headless=new', '--no-first-run', '--disable-gpu-sandbox',
  `--user-data-dir=${process.env.TEMP}\\wanxiang-soak-${Date.now()}`, `--remote-debugging-port=${PORT}`,
  '--window-size=1280,800', '--ignore-certificate-errors', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = null;
for (let i = 0; i < 60; i++) {
  await sleep(250);
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch { /* retry */ }
}
if (!targets) { console.error('DevTools 未就绪'); process.exit(1); }
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

let msgId = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
};
const send = (method, params = {}) => new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(2500);
await evalJs('(() => { const p = window.__wanxiang; p.setQualityAuto(false); p.applyQualityLevel(2); localStorage.clear(); return true; })()');

const combos = await evalJs('(() => { const p = window.__wanxiang; const out = []; for (const mk of Object.keys(p.MODELS)) for (const n of [2,3,4,6,8]) if (p.CUT_TABLE[mk] && p.CUT_TABLE[mk][n]) out.push([mk, n]); return out; })()');
console.log(`浸泡 ${MINUTES} 分钟，可用组合 ${combos.length} 个`);

const t0 = Date.now();
const end = t0 + MINUTES * 60 * 1000;
const startTimes = [];
const memSamples = [];
let cycles = 0, fatalCount = 0;
let i = 0;
while (Date.now() < end) {
  const [mk, n] = combos[i % combos.length];
  i++;
  const s = Date.now();
  try {
    const r = await evalJs(`(() => { const p = window.__wanxiang; p.startGame(${JSON.stringify(mk)}, ${n}); return { mode: p.state.mode, pieces: p.state.pieces.length }; })()`);
    if (r.mode !== 'playing' || r.pieces !== n) { errors.push(`bad start ${mk} x${n}`); }
  } catch (e) { errors.push('start error: ' + e.message); }
  startTimes.push(Date.now() - s);
  cycles++;
  if (cycles % 10 === 0) {
    const mem = await evalJs('performance.memory ? performance.memory.usedJSHeapSize : 0');
    memSamples.push(mem);
    const fatal = await evalJs("!document.getElementById('fatal').classList.contains('hidden')");
    if (fatal) fatalCount++;
    const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
    process.stdout.write(`  ${elapsed}s / ${cycles} 局 / 堆 ${(mem / 1048576).toFixed(1)} MB\n`);
  }
  await sleep(120);
}
chrome.kill();

const avg = startTimes.reduce((a, b) => a + b, 0) / Math.max(1, startTimes.length);
const max = Math.max(...startTimes);
const half = Math.floor(memSamples.length / 3);
const first = memSamples.slice(0, Math.max(1, half));
const last = memSamples.slice(-Math.max(1, half));
const avgOf = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const growth = avgOf(first) > 0 ? (avgOf(last) - avgOf(first)) / avgOf(first) : 0;
console.log(`\n局数: ${cycles} | 开局耗时 平均 ${avg.toFixed(0)}ms / 最大 ${max}ms | 堆增长 ${(growth * 100).toFixed(1)}% | 控制台错误 ${errors.length} | fatal ${fatalCount}`);
const ok = cycles >= 10 && growth < 0.5 && errors.length === 0 && fatalCount === 0;
if (!ok) { console.error('✗ 稳定性不合格'); process.exit(1); }
console.log('✓ 稳定性通过（无错误、无 fatal、堆增长 <50%）');
