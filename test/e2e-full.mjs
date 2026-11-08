// 扩展 e2e：全部 3 模型 × 建局 → 截图；吸附/胜利逻辑模拟验证
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const URL = 'https://localhost:8443/';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu-sandbox', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}\\pico3d-cdp2`, `--remote-debugging-port=${PORT}`,
  '--window-size=1280,800', '--ignore-certificate-errors', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = null;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    targets = await res.json();
    if (targets && targets.length) break;
  } catch { /* retry */ }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  }
};
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(2200);

const results = [];
const models = [['rocket', '小火箭'], ['mushroom', '蘑菇屋'], ['gemplanet', '宝石星球']];
for (const [key, cname] of models) {
  await evalJs(`window.__pico3d.startGame('${key}', 4)`);
  await sleep(600);
  const st = await evalJs(`(() => {
    const s = window.__pico3d.state;
    return { count: s.pieces.length, mode: s.mode, placed: s.placedCount };
  })()`);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`test/preview-${key}.png`, Buffer.from(shot.result.data, 'base64'));
  results.push({ key, ...st });
  console.log(`${cname} n=4:`, JSON.stringify(st));
}

// 吸附/胜利逻辑：把全部拼片瞬移到目标位姿附近，扣"扳机"放下 → 应全部吸附并胜利
await evalJs(`(() => {
  const s = window.__pico3d.state;
  const THREE = window.__pico3d.THREE;
  for (const mesh of s.pieces) {
    const tp = new THREE.Vector3(), tq = new THREE.Quaternion();
    mesh.userData.target.getWorldPosition(tp);
    mesh.userData.target.getWorldQuaternion(tq);
    // 模拟"手拿着放到目标附近"：位置差 < snapDist，旋转差 < 阈值
    mesh.position.copy(tp).add(new THREE.Vector3(0.02, 0.01, 0));
    mesh.quaternion.copy(tq);
    window.__pico3d.trySnap(mesh);
  }
  return { placed: s.placedCount, total: s.pieces.length, mode: s.mode };
})()`);
await sleep(600);
const win = await evalJs(`({
  mode: window.__pico3d.state.mode,
  winVisible: !document.getElementById('win').classList.contains('hidden'),
  winText: document.getElementById('win-time').textContent,
  counter: document.getElementById('placed-counter').textContent,
})`);
console.log('吸附后:', JSON.stringify(win));
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('test/preview-win.png', Buffer.from(shot.result.data, 'base64'));

console.log('控制台错误数:', consoleErrors.length);
for (const e of consoleErrors.slice(0, 8)) console.log('  [err]', e.slice(0, 250));

chrome.kill();
const allFour = results.every((r) => r.count === 4);
const winOk = win.mode === 'won' && win.winVisible;
process.exit(allFour && winOk && !consoleErrors.length ? 0 : 1);
