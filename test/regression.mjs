// 回归测试 — 黄金基线：切割引擎输出的结构性指标必须稳定
// 首次运行 capture 建基线；之后每次 check 与基线比对，输出漂移即报警。
// 注意：几何精确值随算法演进而变化——基线漂移时人工确认"变化是否有意"，
// 确认后用 --capture 重新建基线（与 capture 参数一致）。
import { splitIntoPieces, isWatertight, CUT_TABLE } from '../public/js/puzzle.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(__dirname, 'regression-baseline.json');
const capture = process.argv.includes('--capture');

// 结构性指标：片数、三角形数、包围盒（6 位定点）、包围球半径（4 位）。
// 不含顶点精确坐标——那会因浮点实现细节抖动，交给 watertight/体积不变式把关。
function fingerprint(modelKey, n) {
  const r = splitIntoPieces(modelKey, n);
  return r.pieces.map((p) => {
    // 包围盒从中心半径反推：center ± radius 的上界不精确，改为重新计算
    const P = p.positions;
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < P.length / 6; i++) {
      for (let c = 0; c < 3; c++) { const v = P[i * 6 + c]; if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
    }
    const q = (v) => Math.round(v * 1e4) / 1e4;
    return {
      tris: p.triCount,
      verts: P.length / 6,
      bbox: [mn, mx].map((b) => b.map(q)),
    };
  });
}

import { MODELS as MODEL_DEFS } from '../public/js/models.mjs';
const MODELS = Object.keys(MODEL_DEFS);
const current = { capturedAt: new Date().toISOString(), combos: {} };
let drift = [];

const REG_COUNTS = [2, 3, 4, 6, 8];
for (const mk of MODELS) for (const n of REG_COUNTS) {
  if (!CUT_TABLE[mk] || !CUT_TABLE[mk][n]) continue; // 8 块可选档缺失跳过
  current.combos[`${mk}|${n}`] = fingerprint(mk, n);
}

if (capture || !fs.existsSync(BASELINE)) {
  fs.writeFileSync(BASELINE, JSON.stringify(current, null, 1));
  console.log(`基线已${capture ? '重建' : '创建'}: ${BASELINE}`);
  console.log(`组合数: ${Object.keys(current.combos).length}`);
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
for (const [key, fp] of Object.entries(current.combos)) {
  const old = base.combos[key];
  if (!old) { drift.push(`${key}: 基线缺失（新增组合）`); continue; }
  if (old.length !== fp.length) { drift.push(`${key}: 片数 ${old.length} → ${fp.length}`); continue; }
  for (let i = 0; i < fp.length; i++) {
    if (old[i].tris !== fp[i].tris) drift.push(`${key} 片${i}: 三角形 ${old[i].tris} → ${fp[i].tris}`);
    if (old[i].verts !== fp[i].verts) drift.push(`${key} 片${i}: 顶点 ${old[i].verts} → ${fp[i].verts}`);
    const ob = JSON.stringify(old[i].bbox), nb = JSON.stringify(fp[i].bbox);
    if (ob !== nb) drift.push(`${key} 片${i}: 包围盒 ${ob} → ${nb}`);
    const wt = isWatertight(splitIntoPieces(key.split('|')[0], Number(key.split('|')[1])).pieces[i]);
    if (!wt.ok) drift.push(`${key} 片${i}: 水密破坏 ${wt.reason}`);
  }
}
for (const key of Object.keys(base.combos)) {
  if (!current.combos[key]) drift.push(`${key}: 当前输出缺失（组合被移除）`);
}

if (drift.length) {
  console.error(`检测到 ${drift.length} 处输出漂移：`);
  for (const d of drift.slice(0, 20)) console.error('  ' + d);
  console.error('\n若漂移是有意的算法改进，运行 node test/regression.mjs --capture 重建基线。');
  process.exit(1);
}
console.log(`回归检查通过：${Object.keys(current.combos).length} 组合的结构指纹与基线一致，且全部 watertight。`);
