// CDP 端到端验证：加载页面 → 点击进入难度选择 → 开始 2 块游戏 → 截图 + 收集控制台错误
// 零依赖：用 Node 内置 WebSocket 连 Chrome DevTools Protocol。
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const URL = 'https://localhost:8443/';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu-sandbox', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}\\pico3d-cdp`, `--remote-debugging-port=${PORT}`,
  '--window-size=1280,800', '--ignore-certificate-errors', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 等 DevTools 端口就绪
let targets = null;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    targets = await res.json();
    if (targets && targets.length) break;
  } catch { /* retry */ }
}
if (!targets) { console.error('DevTools 端口未就绪'); process.exit(1); }
const page = targets.find((t) => t.type === 'page');
if (!page) { console.error('找不到页面 target'); process.exit(1); }

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
  if (r.result?.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails));
  return r.result?.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(2500);

// 1) 引导页状态
const intro = await evalJs(`({
  title: document.title,
  introVisible: !document.getElementById('intro').classList.contains('hidden'),
  vrBtn: document.querySelector('#vr-button') ? document.querySelector('#vr-button').textContent : '(无)',
})`);
console.log('引导页:', JSON.stringify(intro));

// 2) 点击画布 → 难度选择
await evalJs(`document.getElementById('intro').click()`);
await sleep(400);
const diff = await evalJs(`({
  visible: !document.getElementById('difficulty').classList.contains('hidden'),
  buttons: [...document.querySelectorAll('#difficulty .diff-btn')].map((b) => b.textContent.trim()),
})`);
console.log('难度选择:', JSON.stringify(diff));

// 3) 选第一个模型（小火箭），再点 "2 块"
await evalJs(`document.querySelectorAll('#difficulty .diff-btn')[0].click()`);
await sleep(200);
await evalJs(`[...document.querySelectorAll('#difficulty .diff-btn')].find(b => b.textContent.includes('2 块')).click()`);
await sleep(1500);

const game = await evalJs(`({
  hudVisible: !document.getElementById('hud').classList.contains('hidden'),
  counter: document.getElementById('placed-counter').textContent,
  modelName: document.getElementById('model-name').textContent,
  hasWebGL: !!document.querySelector('#c3d'),
})`);
console.log('游戏中:', JSON.stringify(game));

// 4) 检查 three.js 场景里拼片真的存在（从 renderer 全局不好拿，改查 drawcall 间接证据：
//    读取 canvas 像素是否有非背景色 —— 简化：直接检查 window 上无未捕获错误 + 截图肉眼验证）
const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('test/preview-game.png', Buffer.from(shot.result.data, 'base64'));

console.log('控制台错误数:', consoleErrors.length);
for (const e of consoleErrors.slice(0, 10)) console.log('  [err]', e.slice(0, 300));

chrome.kill();
process.exit(consoleErrors.length ? 1 : 0);
