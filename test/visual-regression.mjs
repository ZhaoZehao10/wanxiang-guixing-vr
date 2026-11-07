// 视觉回归测试 — node test/visual-regression.mjs [--capture]
//
// 思路：把渲染结果降采样成 32×18 的网格平均色（每格 RGB），作为"感知哈希"与基线比对。
// 相比截图文件对比，不需要 PNG 解码依赖，也能容忍不同 GPU 的极小像素差异。
//
// 确定性保证：
//   1) 用 CDP 在页面脚本执行前注入固定种子 PRNG，覆盖 Math.random
//      （碎片散落位置、星空位置都来自 Math.random）；
//   2) 截图前冻结虚影呼吸（它依赖 performance.now 时间）；
//   3) 固定视口尺寸、隐藏 2D DOM 覆盖层无关（只读 WebGL 帧缓冲）。
//
// 用法：
//   node test/visual-regression.mjs --capture   # 建立/更新基线
//   node test/visual-regression.mjs             # 与基线比对
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9337;
const URL = 'https://localhost:8443/';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(__dirname, 'visual-baseline.json');
const capture = process.argv.includes('--capture');

// 被测场景：固定模型/块数，冻结姿态
const SCENES = [
  { name: 'rocket-x4', model: 'rocket', n: 4 },
  { name: 'penguin-x6', model: 'penguin', n: 6 },
  { name: 'castle-x2', model: 'castle', n: 2 },
];

const chrome = spawn(CHROME, [
  '--headless=new', '--no-first-run', '--disable-gpu-sandbox',
  '--use-angle=swiftshader', // 软件渲染：跨机器可复现性更好
  `--user-data-dir=${process.env.TEMP}\\pico3d-visual`, `--remote-debugging-port=${PORT}`,
  '--window-size=960,540', '--force-device-scale-factor=1',
  '--ignore-certificate-errors', '--autoplay-policy=no-user-gesture-required',
  'about:blank',
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
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
};
const send = (method, params = {}) => new Promise((resolve) => {
  const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }));
});
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
  return r.result?.result?.value;
}

await send('Page.enable');
await send('Runtime.enable');
// 注入确定性随机源（mulberry32 固定种子）
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `(() => {
    let s = 0x9E3779B9 >>> 0;
    Math.random = function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  })();`,
});
await send('Page.navigate', { url: URL });
await sleep(2500);

// 页面内：渲染 → 读帧缓冲 → 32×18 网格平均色
const HASH_FN = `
  const hashFrame = (renderer, cols, rows) => {
    renderer.render(window.__pico3d.scene, window.__pico3d.camera);
    const gl = renderer.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const cells = [];
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        const x0 = Math.floor(gx * w / cols), x1 = Math.floor((gx + 1) * w / cols);
        const y0 = Math.floor(gy * h / rows), y1 = Math.floor((gy + 1) * h / rows);
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
          const i = (y * w + x) * 4; r += buf[i]; g += buf[i + 1]; b += buf[i + 2]; n++;
        }
        cells.push(n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : [0, 0, 0]);
      }
    }
    return cells;
  };
`;

// 锁定画质：画质自适应会按帧率降像素比/关星空，导致视觉哈希不可比
await evalJs(`(() => {
  const p = window.__pico3d;
  p.setQualityAuto(false);
  p.applyQualityLevel(2);
  return p.getQuality();
})()`);

// 每个场景采样一次（可重复调用；用于失败时重采样一次以排除偶发抖动）
async function captureAll(label) {
  const out = {};
  for (const sc of SCENES) {
    const cells = await evalJs(`(() => {
      ${HASH_FN}
      const p = window.__pico3d;
      p.startGame(${JSON.stringify(sc.model)}, ${sc.n});
      // 让画面与"随机数序列"彻底解耦：
      //   three.js 的 generateUUID 也消耗 Math.random，新增/删除任何 Object3D 都会
      //   移动随机序列，导致星空与碎片散落位置变化（曾因此误报视觉漂移）。
      //   这里固定碎片摆位并关闭星空，只保留模型/材质/光照/投影的比对。
      p.state.pieces.forEach((mesh, i) => {
        mesh.position.set(-0.55 + i * 0.36, 0.80, -0.85 - (i % 2) * 0.18);
        mesh.quaternion.identity();
      });
      const stars = p.getStarfield();
      if (stars) stars.visible = false;
      // 冻结虚影呼吸（依赖 performance.now）
      const g = p.ghostGroup();
      if (g) { g.position.y = 0.05; g.rotation.y = 0; }
      return hashFrame(p.renderer, 32, 18);
    })()`);
    out[sc.name] = cells;
  }
  console.log(`  采样完成（${label}）`);
  return out;
}

// 环境贴图必须就绪：PMREM 偶发失败会让材质（尤其虚影）明显变暗，哈希不可比
const envOk = await evalJs('window.__pico3d.hasEnv()');
if (!envOk) {
  console.error('✗ 环境贴图(PMREM)未就绪，本轮的视觉哈希与环境贴图不符，无法判定');
  chrome.kill();
  process.exit(1);
}

let results = await captureAll('第一次');

if (capture || !fs.existsSync(BASELINE)) {
  fs.writeFileSync(BASELINE, JSON.stringify({ version: 1, cols: 32, rows: 18, scenes: results }, null, 0));
  console.log(`基线已${capture ? '更新' : '创建'}: ${BASELINE}`);
  chrome.kill();
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

function compare(current) {
  const out = [];
  for (const sc of SCENES) {
    const a = base.scenes[sc.name];
    const b = current[sc.name];
    if (!a || !b || a.length !== b.length) { out.push({ name: sc.name, bad: true, msg: '基线缺失/尺寸不一致' }); continue; }
    let maxDiff = 0, sum = 0;
    for (let i = 0; i < a.length; i++) {
      for (let k = 0; k < 3; k++) {
        const d = Math.abs(a[i][k] - b[i][k]);
        if (d > maxDiff) maxDiff = d;
        sum += d;
      }
    }
    const meanDiff = sum / (a.length * 3);
    out.push({ name: sc.name, ok: meanDiff <= 2.5 && maxDiff <= 40, meanDiff, maxDiff });
  }
  return out;
}

let diffs = compare(results);
if (diffs.some((d) => !d.ok)) {
  // 软件渲染偶发抖动（例如 PMREM 初始化时序）会导致一次误报：重采样一次再判
  console.log('  · 首次比对有差异，重采样一次以排除偶发抖动…');
  results = await captureAll('重采样');
  diffs = compare(results);
}
chrome.kill();

let failed = 0;
for (const d of diffs) {
  if (d.bad) { console.error(`  ✗ ${d.name}: ${d.msg}`); failed++; continue; }
  console.log(`  ${d.ok ? '✓' : '✗'} ${d.name}: 平均差异 ${d.meanDiff.toFixed(2)}，最大 ${d.maxDiff}`);
  if (!d.ok) failed++;
}
if (failed) {
  console.error(`\n✗ ${failed} 个场景视觉漂移。若为有意改动（材质/光照/构图），运行 --capture 更新基线。`);
  process.exit(1);
}
console.log('\n✓ 视觉回归通过：3 个场景与基线一致');
