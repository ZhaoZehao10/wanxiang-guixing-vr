// 切割引擎测试 — node test/run-tests.mjs
// 硬指标：
//   1. 每个模型 × 每种块数：全部拼片 watertight（有向边一一配对）
//   2. 体积守恒：拼片有向体积之和 ≈ 原模型有向体积（封盖无遗漏/重叠）
//   3. 拼片数量正确、三角形数 > 0、坐标有限
import { splitIntoPieces, isWatertight, parseObj, CUT_TABLE } from '../public/js/puzzle.mjs';
import { buildModel, MODELS as MODEL_DEFS } from '../public/js/models.mjs';

function signedVolume(positions, indices) {
  let v = 0;
  for (let t = 0; t < indices.length / 3; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
    const ax = positions[a * 6], ay = positions[a * 6 + 1], az = positions[a * 6 + 2];
    const bx = positions[b * 6], by = positions[b * 6 + 1], bz = positions[b * 6 + 2];
    const cx = positions[c * 6], cy = positions[c * 6 + 1], cz = positions[c * 6 + 2];
    v += (ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx)) / 6;
  }
  return v;
}

let failed = 0, passed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}

const MODELS = Object.keys(MODEL_DEFS); // 覆盖全部模型（新增模型自动纳入）
const COUNTS = [2, 3, 4, 6, 8];

for (const mk of MODELS) {
  console.log(`\n=== 模型 ${mk} ===`);
  const model = buildModel(mk);
  const orig = parseObj(model.obj);
  const origV = signedVolume(orig.positions, orig.tris);
  check(`原模型闭合体积为正 (${origV.toFixed(4)})`, origV > 0);

  for (const n of COUNTS) {
    if (!CUT_TABLE[mk] || !CUT_TABLE[mk][n]) { console.log(`  --- 切成 ${n} 块：该模型不支持，跳过 ---`); continue; }
    console.log(`  --- 切成 ${n} 块 ---`);
    let result;
    try { result = splitIntoPieces(mk, n); } catch (e) {
      check(`切割不抛错`, false, e.message);
      continue;
    }
    check('拼片数量正确', result.pieces.length === n, `got ${result.pieces.length}`);

    let sumTris = 0, sumVol = 0, allTight = true, tightMsg = '';
    let allVolPositive = true;
    for (let i = 0; i < result.pieces.length; i++) {
      const p = result.pieces[i];
      sumTris += p.triCount;
      const pv = signedVolume(p.positions, p.indices);
      if (pv <= 0) { allVolPositive = false; tightMsg += ` [片${i}: 体积 ${pv.toFixed(4)} ≤ 0]`; }
      sumVol += pv;
      const wt = isWatertight(p);
      if (!wt.ok) { allTight = false; tightMsg += ` [片${i}: ${wt.reason}]`; }
      let finite = true;
      for (const v of p.positions) if (!Number.isFinite(v)) { finite = false; break; }
      if (!finite) { allTight = false; tightMsg += ` [片${i}: 非有限坐标]`; }
    }
    check('全部拼片 watertight', allTight, tightMsg);
    check('每片体积为正（绕向正确）', allVolPositive, tightMsg);
    check('三角形总数不少于原模型', sumTris >= result.totalTris, `${sumTris} vs ${result.totalTris}`);
    const relErr = Math.abs(sumVol - origV) / Math.abs(origV);
    check(`体积守恒 (误差 ${(relErr * 100).toFixed(3)}%)`, relErr < 0.005, `sum=${sumVol.toFixed(4)} orig=${origV.toFixed(4)}`);
    // 缓存命中路径再跑一遍，保证幂等
    const again = splitIntoPieces(mk, n);
    check('缓存幂等', again === result);
  }
}

console.log(`\n=== 配色皮肤（几何不变、仅颜色变化；切割表通用） ===`);
{
  const PALETTE_KEYS = ['neon', 'warm', 'mono', 'festive', 'ocean'];
  for (const mk of MODELS) {
    const classic = splitIntoPieces(mk, 6, 'classic');
    const orig = parseObj(buildModel(mk).obj);
    const origV = signedVolume(orig.positions, orig.tris);
    for (const pal of PALETTE_KEYS) {
      const r = splitIntoPieces(mk, 6, pal);
      const tight = r.pieces.every((p) => isWatertight(p).ok);
      const sumVol = r.pieces.reduce((s, p) => s + signedVolume(p.positions, p.indices), 0);
      const relErr = Math.abs(sumVol - origV) / Math.abs(origV);
      // 颜色确实改变（对比第一片前 300 个颜色分量）
      let colorDelta = 0;
      const a = classic.pieces[0].positions, b = r.pieces[0].positions;
      const lim = Math.min(a.length, b.length, 1800);
      for (let i = 3; i < lim; i += 6) colorDelta += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      const changed = colorDelta > 1;
      check(`${mk} × ${pal}: 水密 + 体积守恒 + 颜色已改变`, tight && relErr < 0.005 && changed,
        `tight=${tight} err=${(relErr * 100).toFixed(3)}% colorDelta=${colorDelta.toFixed(2)}`);
    }
  }
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
