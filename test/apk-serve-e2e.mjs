// APK 运行链路模拟验收（无需真机）：
//   1) 从 dist/3D拼图VR.apk 中提取 assets/game/index.html（APK 实际内嵌的那份）；
//   2) 按 MainActivity.java 的同一套路由在 127.0.0.1:8898 起 HTTP 服务
//      （"/" → "/puzzle/index.html"，拒绝 ".."，替换页脚提示）；
//   3) 用真实 Chrome（不带任何证书豁免）访问 http://127.0.0.1:8898/，
//      验证 isSecureContext / navigator.xr / 完整开局。
// 这一步验证的是「loopback 明文 HTTP 即安全上下文」这一 APK 方案的核心前提。
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8898;      // 与 Java 壳一致的端口
const CDP = 9336;

// ---------- 1) 从 APK 提取内嵌 HTML ----------
function extractAsset(apkPath, entryName) {
  const buf = fs.readFileSync(apkPath);
  // 解析 zip 中央目录
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('找不到 zip 中央目录');
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('中央目录项损坏');
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString('utf8', off + 46, off + 46 + nameLen);
    if (name === entryName) {
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(dataStart, dataStart + compSize);
      return method === 0 ? data : zlib.inflateRawSync(data);
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error('APK 中找不到 ' + entryName);
}

let html = extractAsset(path.resolve('dist/3D拼图VR.apk'), 'assets/game/index.html').toString('utf8');
// 与 MainActivity.java 完全一致的页脚替换
html = html.replace('单文件离线版 · 全部资源已内联 · 无需网络', 'APK 版 · 全部资源内置 · 无需网络');
console.log(`从 APK 提取内嵌页面: ${(html.length / 1024).toFixed(0)} KB，页脚已替换为 APK 版`);

// ---------- 2) 按 Java 壳的路由起服务 ----------
const server = http.createServer((req, res) => {
  let p = (req.url || '/').split('?')[0];
  if (p.includes('..')) { res.writeHead(403); res.end('forbidden'); return; }
  if (p === '/' || p === '/index.html') p = '/puzzle/index.html';
  if (p === '/puzzle/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
    return;
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('not found');
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
console.log(`本地服务已起: http://127.0.0.1:${PORT}/`);

// ---------- 3) 真实 Chrome 验收 ----------
const chrome = spawn(CHROME, [
  '--headless=new', '--no-first-run', '--disable-gpu-sandbox',
  `--user-data-dir=${process.env.TEMP}\\pico3d-apkserve`, `--remote-debugging-port=${CDP}`,
  '--window-size=1280,800', '--autoplay-policy=no-user-gesture-required', 'about:blank',
], { stdio: 'ignore' }); // 注意：没有 --ignore-certificate-errors（HTTP 用不到，也证明不依赖豁免）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = null;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json(); if (targets.length) break; } catch { /* retry */ }
}
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let msgId = 0; const pending = new Map(); const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push((m.params.exceptionDetails.text || '') + ' ' + (m.params.exceptionDetails.exception?.description || ''));
};
const send = (method, params = {}) => new Promise((resolve) => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}
let failed = 0;
const check = (n, c, d = '') => { if (c) console.log(`  ✓ ${n}`); else { failed++; console.error(`  ✗ ${n} ${d}`); } };

await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await sleep(2500);

const env = await evalJs(`({
  title: document.title, secure: window.isSecureContext, hasXR: typeof navigator.xr !== 'undefined',
  hook: !!window.__pico3d, footer: document.body.innerText.includes('APK 版'),
})`);
check('访问 / 自动路由到 /puzzle/index.html 并正常加载', env.title === 'Pico 3D 拼图 VR' && env.hook, JSON.stringify(env));
check('HTTP loopback 下 isSecureContext = true（APK 方案核心前提）', env.secure === true);
check('HTTP loopback 下 navigator.xr 存在（免证书出 WebXR）', env.hasXR === true);
check('页脚已被 Java 壳替换为 APK 版提示', env.footer === true);

await evalJs(`document.getElementById('intro').click()`); await sleep(300);
await evalJs(`(() => { document.querySelectorAll('#difficulty .diff-btn')[2].click(); [...document.querySelectorAll('#difficulty .diff-btn')].find(b=>b.textContent.includes('4 块')).click(); })()`);
await sleep(900);
const st = await evalJs(`({ mode: window.__pico3d.state.mode, n: window.__pico3d.state.pieces.length })`);
check('APK 内嵌页面 4 块开局成功', st.mode === 'playing' && st.n === 4, JSON.stringify(st));

await evalJs(`(() => { const s = window.__pico3d.state, T = window.__pico3d.THREE; for (const m of s.pieces) { const tp = new T.Vector3(), tq = new T.Quaternion(); m.userData.target.getWorldPosition(tp); m.userData.target.getWorldQuaternion(tq); m.position.copy(tp); m.quaternion.copy(tq); window.__pico3d.trySnap(m); } })()`);
await sleep(700);
const won = await evalJs(`({ mode: window.__pico3d.state.mode, win: !document.getElementById('win').classList.contains('hidden') })`);
check('全部吸附 → 胜利', won.mode === 'won' && won.win, JSON.stringify(won));

const shot = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync('test/preview-apk-serve.png', Buffer.from(shot.result.data, 'base64'));
check('控制台零错误', consoleErrors.length === 0, JSON.stringify(consoleErrors.slice(0, 3)));

console.log(`\n结果: ${failed ? 'FAIL' : 'PASS'}（${failed} 项失败）`);
chrome.kill();
server.close();
process.exit(failed ? 1 : 0);
