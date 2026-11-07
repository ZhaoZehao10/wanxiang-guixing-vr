// 随机平面压力测试 — node test/plane-fuzz.mjs
//
// 目的：标定表只覆盖"被选中"的平面；本测试随机生成大量轴对齐平面组合，
// 压测引擎在任意切口下的行为：
//   - 成功返回 → 必须满足：每片水密、每片体积为正、总体积守恒（<0.5%）
//   - 抛错    → 允许（平面掠过顶点/切线时引擎会显式拒绝，绝不产出坏网格）
// 任何"成功但坏"的结果都算失败。
import { splitWithPlanes, isWatertight } from '../public/js/puzzle.mjs';
import { MODELS, buildModel } from '../public/js/models.mjs';

function meshVolume(pos, tris) {
  let cx = 0, cy = 0, cz = 0; const seen = new Set();
  for (const [a, b, c] of tris) for (const i of [a, b, c]) if (!seen.has(i)) { seen.add(i); cx += pos[i][0]; cy += pos[i][1]; cz += pos[i][2]; }
  const n = seen.size; cx /= n; cy /= n; cz /= n;
  let v = 0;
  for (const [a, b, c] of tris) {
    const ax = pos[a][0] - cx, ay = pos[a][1] - cy, az = pos[a][2] - cz;
    const bx = pos[b][0] - cx, by = pos[b][1] - cy, bz = pos[b][2] - cz;
    const ccx = pos[c][0] - cx, ccy = pos[c][1] - cy, ccz = pos[c][2] - cz;
    v += (ax * (by * ccz - bz * ccy) - ay * (bx * ccz - bz * ccx) + az * (bx * ccy - by * ccx)) / 6;
  }
  return v;
}
function modelVolumeAndBox(model) {
  const pos = [], tris = [];
  for (const line of model.obj.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') pos.push([+p[1] - model.center[0], +p[2] - model.center[1], +p[3] - model.center[2]]);
    else if (p[0] === 'f') tris.push([+p[1] - 1, +p[2] - 1, +p[3] - 1]);
  }
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const v of pos) for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; }
  return { vol: meshVolume(pos, tris), mn, mx };
}

const AXES = ['x', 'y', 'z'];
const ROUNDS = 60; // 每模型随机平面组数
let ok = 0, rejected = 0, violations = 0;
const t0 = Date.now();

for (const key of Object.keys(MODELS)) {
  const model = buildModel(key);
  const { vol: vol0, mn, mx } = modelVolumeAndBox(model);
  let modelOk = 0, modelRej = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const depth = 1 + Math.floor(Math.random() * 3); // 1~3 刀
    const planes = [];
    const usedAxis = [];
    for (let d = 0; d < depth; d++) {
      const axis = AXES[Math.floor(Math.random() * 3)];
      usedAxis.push(axis);
      const ai = AXES.indexOf(axis);
      const lo = mn[ai], hi = mx[ai];
      const frac = 0.12 + Math.random() * 0.76; // 避开极端边缘
      planes.push([axis, lo + frac * (hi - lo)]);
    }
    let out = null;
    try { out = splitWithPlanes(key, planes); } catch (e) { modelRej++; continue; }
    // 成功 → 不变量必须成立
    const vols = out.pieces.map((p) => {
      const pos = [];
      for (let i = 0; i < p.positions.length / 6; i++) pos.push([p.positions[i * 6], p.positions[i * 6 + 1], p.positions[i * 6 + 2]]);
      const tris = [];
      for (let t = 0; t < p.indices.length / 3; t++) tris.push([p.indices[t * 3], p.indices[t * 3 + 1], p.indices[t * 3 + 2]]);
      return meshVolume(pos, tris);
    });
    const tight = out.pieces.every((p) => isWatertight(p).ok);
    const positive = vols.every((v) => v > 0);
    const sum = vols.reduce((a, b) => a + b, 0);
    const relErr = Math.abs(sum - vol0) / Math.abs(vol0);
    if (!tight || !positive || relErr > 0.005) {
      violations++;
      console.error(`✗ 违规 ${key} planes=${JSON.stringify(planes)} 水密=${tight} 体积正=${positive} 误差=${(relErr * 100).toFixed(2)}%`);
    } else {
      modelOk++;
    }
  }
  ok += modelOk;
  rejected += modelRej;
  console.log(`${key}: 成功 ${modelOk} / 拒绝 ${modelRej} / 违规 ${violations}`);
}

console.log(`\n总计: 成功 ${ok}, 显式拒绝 ${rejected}, 违规 ${violations}，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (violations > 0) { console.error('✗ 存在"成功但坏"的结果'); process.exit(1); }
console.log('✓ 所有成功结果均水密且体积守恒（拒绝属于预期保护）');
