// 真实浏览器证书校验验证 — 不带 --ignore-certificate-errors 启动 Chrome，
// 访问 https://<LAN-IP>:8443/，读取页面实际状态（正常加载 or 证书拦截页）。
// 这是修复 ERR_CERT_INVALID 的验收测试。
import { spawn } from 'node:child_process';
import os from 'node:os';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const ips = new Set();
for (const list of Object.values(os.networkInterfaces())) {
  for (const ni of list || []) if (ni.family === 'IPv4' && !ni.internal) ips.add(ni.address);
}
const lanIp = [...ips][0];
const URL = `https://${lanIp}:8443/`;

const chrome = spawn(CHROME, [
  '--headless=new', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}\\pico3d-certcheck`, `--remote-debugging-port=${PORT}`,
  '--window-size=1280,800', 'about:blank',
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
const certErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Network.loadingFailed') {
    certErrors.push({ error: m.params.errorText, type: m.params.type });
  }
};
function send(method, params = {}) {
  return new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return { value: r.result?.result?.value, exception: r.result?.exceptionDetails?.text };
}

await send('Page.enable');
await send('Network.enable');
await send('Page.navigate', { url: URL });
await sleep(2500);

// 证书拦截页的特征：document.title 是 "隐私设置错误"/"Privacy error"，正文无我们的 canvas
const state = await evalJs(`({
  title: document.title,
  hasCanvas: !!document.getElementById('c3d'),
  bodyStart: (document.body ? document.body.innerText.slice(0, 80) : '(no body)'),
})`);
console.log('LAN IP:', lanIp);
console.log('页面状态:', JSON.stringify(state));
console.log('网络失败事件:', JSON.stringify(certErrors));

// 三种结果分级：INVALID（结构错误，无绕过入口）= 失败；
// AUTHORITY_INVALID（CA 未安装的标准警告，有"高级→继续"）= 带警告通过；
// 直接加载成功 = 完全通过（CA 已安装）。
const allErrors = JSON.stringify(certErrors);
if (/CERT_INVALID(?!_)/.test(allErrors) && !/AUTHORITY/.test(allErrors)) {
  console.log('FAIL: 证书结构性无效（ERR_CERT_INVALID），用户将完全无法进入。重跑 node make-cert.mjs');
  process.exitCode = 1;
} else if (/CERT_AUTHORITY_INVALID/.test(allErrors)) {
  console.log('PASS（带警告）: 证书结构有效，仅因 CA 未安装弹标准警告（有"高级→继续"入口）。安装 CA 后零警告。');
} else if (state.value && state.value.hasCanvas) {
  console.log('PASS: 真实证书校验完全通过（CA 已安装，零警告，应用正常加载）');
} else {
  console.log('FAIL: 未知页面状态: ' + JSON.stringify(state));
  process.exitCode = 1;
}
chrome.kill();
