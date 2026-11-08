// 浏览器端性能实测 — 首次切割耗时（模拟 Pico 加载体验）+ 帧率采样
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const URL = 'https://localhost:8443/';
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu-sandbox', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}\\pico3d-cdp4`, `--remote-debugging-port=${PORT}`,
  '--window-size=1280,800', '--ignore-certificate-errors', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = null;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.length) break; } catch {}
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let msgId = 0;
const pending = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
function send(method, params = {}) {
  return new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(2000);

// CPU 限速 6x 模拟移动端芯片（Snapdragon XR2 ≈ 桌面 1/4~1/8 性能）
await send('Emulation.setCPUThrottlingRate', { rate: 6 });

const perf = await evalJs(`(async () => {
  // 首切耗时：fresh 页面上第一次 startGame 内含切割 + 几何上传
  const t0 = performance.now();
  window.__pico3d.startGame('rocket', 4);
  const tCut = performance.now() - t0;
  // 最重模型（企鹅 11k 三角形）4 块切分 — 最坏情况
  const tHeavy0 = performance.now();
  window.__pico3d.startGame('penguin', 4);
  const heavyCutMs = performance.now() - tHeavy0;
  await new Promise((r) => setTimeout(r, 300)); // 等首帧渲染
  // 帧率采样 2 秒
  let frames = 0;
  const t1 = performance.now();
  await new Promise((resolve) => {
    const tick = () => { frames++; if (performance.now() - t1 < 2000) requestAnimationFrame(tick); else resolve(); };
    requestAnimationFrame(tick);
  });
  const fps = frames / ((performance.now() - t1) / 1000);
  // 重开耗时（缓存命中，含建几何+上传）
  const t2 = performance.now();
  for (let i = 0; i < 50; i++) { window.__pico3d.startGame('penguin', 4); }
  const rebuildMs = (performance.now() - t2) / 50;
  window.__pico3d.startGame('rocket', 4);
  return { firstCutMs: +tCut.toFixed(1), heavyCutMs: +heavyCutMs.toFixed(1), fps: +fps.toFixed(1), rebuildMs: +rebuildMs.toFixed(2) };
})()`);
console.log('浏览器性能（6x CPU 限速 ≈ 移动端）:', JSON.stringify(perf));

// 通过标准：最重模型首切 < 3s，帧率 ≥ 60（Pico Neo3 面板 72Hz）
const ok = perf.firstCutMs < 3000 && perf.heavyCutMs < 3000 && perf.fps >= 60;
console.log(ok ? '性能达标' : '性能不达标');
chrome.kill();
process.exit(ok ? 0 : 1);
