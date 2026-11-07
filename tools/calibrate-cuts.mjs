// 切割平面自动标定 — node tools/calibrate-cuts.mjs
//
// 目标：给每个模型 × 2/3/4 块自动找一组"安全"的轴对齐切割平面，使切割结果
// 同时满足：① 全部拼片水密（有向边普查）② 体积守恒（拼片体积和 = 原模型体积）
// ③ 每片非空。
//
// 策略：
//   1) 每个轴收集全部顶点坐标（居中坐标），在相邻坐标之间的"安全间隙"里取候选
//      平面位置——平面永远不会穿过任何顶点，从根本上消除"顶点落面"的退化；
//   2) 按轴排列 DFS 搜索：每一刀先局部验证（该阶段所有拼片水密）再进入下一刀；
//   3) 全部刀切完后做体积守恒总校验；通过则把结果写回 puzzle.mjs 的标记区。
//
// 为什么要自动标定：手工挑平面时，"平面恰好掠过锥面切线/顶点"会产生病态边界，
// 表现为补面环断链（历史教训）。自动标定让新模型加入不再需要人肉试错。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODELS, buildModel } from '../public/js/models.mjs';
import { splitWithPlanes, isWatertight } from '../public/js/puzzle.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUZZLE = path.join(ROOT, 'public', 'js', 'puzzle.mjs');
const AXES = ['x', 'y', 'z'];

// ---------- 几何信息 ----------
function axisCoords(model) {
  const vals = [[], [], []];
  for (const line of model.obj.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') for (let a = 0; a < 3; a++) vals[a].push(parseFloat(p[1 + a]) - model.center[a]);
  }
  return vals.map((v) => v.sort((a, b) => a - b));
}

function modelVolume(model) {
  // 解析 OBJ → 相对整体质心的有符号体积（各壳闭合 → 求和即总体积）
  const pos = [], tris = [];
  for (const line of model.obj.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') pos.push([parseFloat(p[1]) - model.center[0], parseFloat(p[2]) - model.center[1], parseFloat(p[3]) - model.center[2]]);
    else if (p[0] === 'f') tris.push([parseInt(p[1]) - 1, parseInt(p[2]) - 1, parseInt(p[3]) - 1]);
  }
  return meshVolume(pos, tris);
}

function meshVolume(pos, tris) {
  let cx = 0, cy = 0, cz = 0, n = 0;
  const seen = new Set();
  for (const [a, b, c] of tris) for (const i of [a, b, c]) if (!seen.has(i)) { seen.add(i); cx += pos[i][0]; cy += pos[i][1]; cz += pos[i][2]; n++; }
  cx /= n; cy /= n; cz /= n;
  let vol = 0;
  for (const [a, b, c] of tris) {
    const ax = pos[a][0] - cx, ay = pos[a][1] - cy, az = pos[a][2] - cz;
    const bx = pos[b][0] - cx, by = pos[b][1] - cy, bz = pos[b][2] - cz;
    const ccx = pos[c][0] - cx, ccy = pos[c][1] - cy, ccz = pos[c][2] - cz;
    vol += (ax * (by * ccz - bz * ccy) - ay * (bx * ccz - bz * ccx) + az * (bx * ccy - by * ccx)) / 6;
  }
  return vol;
}

function pieceVolume(piece) {
  const n = piece.positions.length / 6;
  const pos = [];
  for (let i = 0; i < n; i++) pos.push([piece.positions[i * 6], piece.positions[i * 6 + 1], piece.positions[i * 6 + 2]]);
  const tris = [];
  const I = piece.indices;
  for (let t = 0; t < I.length / 3; t++) tris.push([I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]);
  return meshVolume(pos, tris);
}

// ---------- 安全候选平面 ----------
// 在相邻顶点坐标之间的"足够宽的间隙"里取中点：平面永远不会穿过任何顶点，
// 从根本上消除"顶点落面/切线"导致的补面断链。
// 同轴多刀（6/8 块）需要多个候选位置，所以这里按"离中心距离"排序多给几个，
// 并限制在 0.10~0.90 区间内，避免切出薄片。
function safeCandidates(coords, min, max, limit = 8) {
  const extent = max - min;
  const uniq = [...new Set(coords.filter((v) => v > min + 1e-9 && v < max - 1e-9))].sort((a, b) => a - b);
  const bounds = [min, ...uniq, max];
  const gaps = [];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const w = bounds[i + 1] - bounds[i];
    if (w <= extent * 0.004) continue;
    const mid = (bounds[i] + bounds[i + 1]) / 2;
    const frac = (mid - min) / extent;
    if (frac < 0.10 || frac > 0.90) continue;
    gaps.push({ mid, w, frac });
  }
  gaps.sort((a, b) => (Math.abs(a.frac - 0.5) - Math.abs(b.frac - 0.5)) || (b.w - a.w));
  return gaps.slice(0, limit).map((g) => +g.mid.toFixed(6));
}

function permutations(arr, k) {
  if (k === 0) return [[]];
  if (k === undefined) k = arr.length;
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest, k - 1)) out.push([arr[i], ...p]);
  }
  return out;
}

// 从数组里取 k 个的组合（下标组合）
function combinations(arr, k) {
  const out = [];
  const n = arr.length;
  if (k > n) return out;
  const idx = Array.from({ length: k }, (_, i) => i);
  for (;;) {
    out.push(idx.map((i) => arr[i]));
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) break;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
  return out;
}

// 把总刀数 k 拆成三个轴上的刀数 (a,b,c)，每轴最多 3 刀、至少两个轴参与。
// 结果按"均衡度"排序（越均衡越优先），便于先尝试更容易成功的组合。
function countTriples(k) {
  const out = [];
  for (let a = 0; a <= Math.min(4, k); a++) {
    for (let b = 0; b <= Math.min(4, k - a); b++) {
      const c = k - a - b;
      if (c < 0 || c > 4) continue;
      if (a + b + c !== k) continue;
      const active = [a, b, c].filter((x) => x > 0).length;
      if (k >= 2 && active < 2) continue; // 至少两轴：避免全是平行薄切
      const balance = Math.max(a, b, c) - Math.min(a, b, c);
      out.push({ counts: [a, b, c], balance });
    }
  }
  out.sort((x, y) => x.balance - y.balance);
  return out.map((o) => o.counts);
}

// ---------- 搜索 ----------
const splitCache = new Map();
let attempts = 0;
const MAX_ATTEMPTS = 800; // 防止极端组合把标定卡死

function trySplit(modelKey, planes) {
  const key = modelKey + '|' + planes.map((p) => p[0] + ':' + p[1]).join(',');
  if (splitCache.has(key)) return splitCache.get(key);
  attempts++;
  if (attempts > MAX_ATTEMPTS) { splitCache.set(key, null); return null; }
  let res = null;
  try {
    const out = splitWithPlanes(modelKey, planes);
    if (!out.pieces.every((p) => { const w = isWatertight(p); return w.ok; })) res = null;
    else if (out.pieces.some((p) => p.triCount === 0)) res = null;
    else res = out;
  } catch { res = null; }
  splitCache.set(key, res);
  return res;
}

// 通用搜索：2~8 块。刀数按"均衡三元组"分配（每轴 ≤3 刀、至少两轴），
// 同轴多刀时在安全候选里取组合并升序排列；DFS 每下一组前先验证部分结果水密。
function search(modelKey, n, candidateLimit = 3, minGapFrac = 0.14) {
  const model = buildModel(modelKey);
  const coords = axisCoords(model);
  const vol0 = modelVolume(model);
  const extents = coords.map((c) => c[c.length - 1] - c[0]);
  const candidates = [0, 1, 2].map((a) => safeCandidates(coords[a], coords[a][0], coords[a][coords[a].length - 1], candidateLimit));
  attempts = 0;

  let planes = [];
  function dfsGroup(groups, gi) {
    if (gi === groups.length) {
      const out = trySplit(modelKey, planes);
      if (!out) return false;
      const vols = out.pieces.map(pieceVolume);
      if (vols.some((v) => v <= 0)) return false;
      const sum = vols.reduce((s, v) => s + v, 0);
      if (Math.abs(sum - vol0) / Math.abs(vol0) > 0.005) return false;
      return out.pieces.length === n;
    }
    const { axis, count } = groups[gi];
    const ai = AXES.indexOf(axis);
    const cands = candidates[ai];
    if (cands.length < count) return false;
    // 同轴相邻两刀之间至少留 14% 轴长：否则会切出纸片状薄片（体积守恒能过，
    // 但拼片太薄既不好抓也不好看）
    const minGap = extents[ai] * minGapFrac;
    for (const combo of combinations(cands, count)) {
      const sorted = combo.slice().sort((a, b) => a - b);
      let tooClose = false;
      for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] < minGap) { tooClose = true; break; }
      if (tooClose) continue;
      const added = sorted.map((p) => [axis, p]);
      planes.push(...added);
      if (trySplit(modelKey, planes) && dfsGroup(groups, gi + 1)) return true;
      planes.length -= added.length;
    }
    return false;
  }

  for (const counts of countTriples(n - 1)) {
    const groups = AXES.map((axis, i) => ({ axis, count: counts[i] })).filter((g) => g.count > 0);
    for (const order of permutations(groups)) {
      planes = [];
      if (dfsGroup(order, 0)) return planes;
    }
  }
  return null;
}

// ---------- 主流程 ----------
// 2/3/4/6 四档：8 块在细长锥体模型（圣诞树）上找不到同时满足"水密 + 体积守恒 +
// 最小刀距"的解，且 8 片在小型模型上会切出过多薄片，收益有限，暂不提供。
const COUNTS = [2, 3, 4, 6, 8];
// 8 块为可选档：细长锥体（圣诞树）无解时不阻断整体标定
const OPTIONAL_COUNTS = new Set([8]);
// 逐级放宽：先保证同轴刀距 ≥14% 轴长（碎片均匀好看），失败再放宽
const LADDER = [
  { limit: 3, gap: 0.14 },
  { limit: 5, gap: 0.10 },
  { limit: 6, gap: 0.07 },
  { limit: 8, gap: 0.05 },
];
const table = {};
let failed = 0;
const t0 = Date.now();
for (const key of Object.keys(MODELS)) {
  const name = MODELS[key].name;
  table[key] = {};
  for (const n of COUNTS) {
    const t = Date.now();
    let planes = null;
    let usedLadder = null;
    for (const rung of LADDER) {
      attempts = 0;
      planes = search(key, n, rung.limit, rung.gap);
      if (planes) { usedLadder = rung; break; }
    }
    if (!planes) {
      if (OPTIONAL_COUNTS.has(n)) { console.warn(`⚠ ${key} x${n} 无解（可选档，跳过）`); continue; }
      failed++;
      console.error(`✗ ${key} x${n} 未找到可行平面`);
      continue;
    }
    table[key][n] = planes;
    console.log(`✓ ${name}(${key}) x${n}: ${JSON.stringify(planes)}  (${Date.now() - t}ms, 刀距≥${(usedLadder.gap * 100).toFixed(0)}%)`);
  }
}
console.log(`\n总耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (failed) { console.error(`✗ ${failed} 个组合失败，未写回`); process.exit(1); }

// ---------- 写回 puzzle.mjs ----------
const src = fs.readFileSync(PUZZLE, 'utf8');
const fmt = JSON.stringify(table, null, 1).replace(/"([xy])"/g, "'$1'").replace(/"/g, "'");
const block = `// >>> CUT_TABLE_START（标定工具生成，勿手改）\nexport const CUT_TABLE = ${fmt};\n// <<< CUT_TABLE_END`;
const re = /\/\/ >>> CUT_TABLE_START[\s\S]*?\/\/ <<< CUT_TABLE_END/;
if (!re.test(src)) { console.error('✗ puzzle.mjs 中找不到 CUT_TABLE 标记区'); process.exit(1); }
fs.writeFileSync(PUZZLE, src.replace(re, block), 'utf8');
console.log('已写回 public/js/puzzle.mjs 的 CUT_TABLE 标记区');
