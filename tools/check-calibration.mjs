// 切割表完整性校验 — node tools/check-calibration.mjs
//
// 快速校验（约 5~10 秒）：对每个模型 × 每个难度（2/3/4/6），
//   1) CUT_TABLE 必须有对应的平面序列（缺项直接失败，避免运行时"不支持的块数"）
//   2) 用该平面序列实际切割 → 片数正确、每片水密、每片体积为正、总体积守恒
//
// 与 calibrate-cuts.mjs 的区别：本工具不做搜索、不写回，只验证"当前表是否可用"，
// 适合放进 test-all 每次跑；几何改动后仍需跑一次 calibrate-cuts.mjs 重新标定。
import { MODELS, buildModel } from '../public/js/models.mjs';
import { splitWithPlanes, isWatertight, CUT_TABLE } from '../public/js/puzzle.mjs';

const COUNTS = [2, 3, 4, 6];

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

function modelVolume(key) {
  const model = buildModel(key);
  const pos = [], tris = [];
  for (const line of model.obj.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') pos.push([+p[1] - model.center[0], +p[2] - model.center[1], +p[3] - model.center[2]]);
    else if (p[0] === 'f') tris.push([+p[1] - 1, +p[2] - 1, +p[3] - 1]);
  }
  return meshVolume(pos, tris);
}

function pieceVolume(piece) {
  const pos = [];
  for (let i = 0; i < piece.positions.length / 6; i++) pos.push([piece.positions[i * 6], piece.positions[i * 6 + 1], piece.positions[i * 6 + 2]]);
  const tris = [];
  for (let t = 0; t < piece.indices.length / 3; t++) tris.push([piece.indices[t * 3], piece.indices[t * 3 + 1], piece.indices[t * 3 + 2]]);
  return meshVolume(pos, tris);
}

let failed = 0, checks = 0;
const t0 = Date.now();
for (const key of Object.keys(MODELS)) {
  const vol0 = modelVolume(key);
  for (const n of COUNTS) {
    const planes = CUT_TABLE[key] && CUT_TABLE[key][n];
    if (!Array.isArray(planes) || planes.length !== n - 1) {
      console.error(`✗ ${key} x${n}: CUT_TABLE 缺项（期望 ${n - 1} 个平面）`);
      failed++;
      continue;
    }
    let out;
    try { out = splitWithPlanes(key, planes); } catch (e) {
      console.error(`✗ ${key} x${n}: 切割抛错 ${e.message}`);
      failed++;
      continue;
    }
    checks++;
    const okCount = out.pieces.length === n;
    const okTight = out.pieces.every((p) => isWatertight(p).ok);
    const vols = out.pieces.map(pieceVolume);
    const okVol = vols.every((v) => v > 0);
    const sum = vols.reduce((a, b) => a + b, 0);
    const err = Math.abs(sum - vol0) / Math.abs(vol0);
    const okCons = err < 0.005;
    if (!okCount || !okTight || !okVol || !okCons) {
      failed++;
      console.error(`✗ ${key} x${n}: 片数=${okCount} 水密=${okTight} 体积正=${okVol} 守恒误差=${(err * 100).toFixed(3)}%`);
    }
  }
}
const secs = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`${checks} 个组合校验完成，失败 ${failed}（${secs}s）`);
if (failed) { console.error('✗ 切割表不完整或不可用，请运行 node tools/calibrate-cuts.mjs 重新标定'); process.exit(1); }
console.log('✓ 切割表完整：所有模型 × 2/3/4/6 均有解且水密/守恒');
