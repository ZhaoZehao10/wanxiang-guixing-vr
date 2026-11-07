// 离线单文件版验收 — 用 file:// 打开，走完整开局流程
// 验证点：资源零外链（无网络请求）、模块拼接无语法错误、navigator.xr 存在、可完成一局。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9335;
const FILE = path.resolve('dist/3D拼图VR-离线版.html');
const URL = 'file:///' + FILE.replace(/\\/g, '/');

const chrome = spawn(CHROME, [
  '--headless=new', '--no-first-run', '--disable-gpu-sandbox',
  `--user-data-dir=${process.env.TEMP}\\pico3d-offline`, `--remote-debugging-port=${PORT}`,
  '--window-size=1280,800', '--allow-file-access-from-files',
  '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = null;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch { /* retry */ }
}
if (!targets) { console.error('DevTools 未就绪'); process.exit(1); }
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
const netRequests = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push((m.params.exceptionDetails.text || '') + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  }
  if (m.method === 'Network.requestWillBeSent') netRequests.push(m.params.request.url);
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }));
});
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
}

let failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
};

await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Page.navigate', { url: URL });
await sleep(2500);

const env = await evalJs(`({
  title: document.title,
  hook: !!window.__pico3d,
  secure: window.isSecureContext,
  hasXR: typeof navigator.xr !== 'undefined',
  canvas: !!document.getElementById('c3d'),
  three: (typeof THREE !== 'undefined') ? THREE.REVISION : null,
})`);
check('页面以 file:// 正常加载', env.title === 'Pico 3D 拼图 VR' && env.canvas, JSON.stringify(env));
check('内联 THREE 版本 = 160', env.three === '160', String(env.three));
check('file:// 下 isSecureContext 为真', env.secure === true);
console.log(`  · navigator.xr 存在: ${env.hasXR}（桌面 Chrome 实测；Pico 浏览器需真机确认）`);

// 无外部网络请求（除 file:// 自身）
const external = netRequests.filter((u) => !u.startsWith('file://') && !u.startsWith('data:'));
check('零外部网络请求（全部资源内联）', external.length === 0, JSON.stringify(external.slice(0, 5)));

// 完整一局：引导页 → 难度菜单 → 3 块开局 → 全部吸附 → 胜利
await evalJs(`document.getElementById('intro').click()`);
await sleep(300);
const diff = await evalJs(`({
  visible: !document.getElementById('difficulty').classList.contains('hidden'),
  buttons: [...document.querySelectorAll('#difficulty .diff-btn')].map((b) => b.textContent.trim()),
})`);
check('引导页点击 → 难度菜单出现', diff.visible && diff.buttons.length === 19, JSON.stringify(diff.buttons));

await evalJs(`(() => {
  document.querySelectorAll('#difficulty .diff-btn')[0].click(); // 小火箭
  [...document.querySelectorAll('#difficulty .diff-btn')].find((b) => b.textContent.includes('3 块')).click();
})()`);
await sleep(800);
const started = await evalJs(`({ mode: window.__pico3d.state.mode, n: window.__pico3d.state.pieces.length, counter: document.getElementById('placed-counter').textContent })`);
check('3 块开局成功', started.mode === 'playing' && started.n === 3, JSON.stringify(started));

await evalJs(`(() => {
  const s = window.__pico3d.state, THREE = window.__pico3d.THREE;
  for (const mesh of s.pieces) {
    const tp = new THREE.Vector3(), tq = new THREE.Quaternion();
    mesh.userData.target.getWorldPosition(tp); mesh.userData.target.getWorldQuaternion(tq);
    mesh.position.copy(tp); mesh.quaternion.copy(tq);
    window.__pico3d.trySnap(mesh);
  }
})()`);
await sleep(700);
const won = await evalJs(`({ mode: window.__pico3d.state.mode, win: !document.getElementById('win').classList.contains('hidden'), counter: document.getElementById('placed-counter').textContent })`);
check('全部吸附 → 胜利面板', won.mode === 'won' && won.win && won.counter === '3 / 3', JSON.stringify(won));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('test/preview-offline-win.png', Buffer.from(shot.result.data, 'base64'));

check('控制台零错误', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));
console.log(`\n结果: ${failed ? 'FAIL' : 'PASS'}（${failed} 项失败）`);
chrome.kill();
process.exit(failed ? 1 : 0);
