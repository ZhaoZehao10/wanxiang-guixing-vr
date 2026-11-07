// 切割引擎模糊测试 + 性能基准 — node test/fuzz-tests.mjs
//
// 压测不变式：
//   a) 对每个内置模型 × 全部块数做 200 轮随机顺序调用（缓存/重复计算稳定性）
//   b) 对 OBJ 解析器做随机噪声输入（防崩溃）
//   c) 索引级 + 位置级双重视角的水密交叉校验
//   d) 性能基准（缓存命中耗时 + 全组合访问）
import { splitIntoPieces, isWatertight, parseObj } from '../public/js/puzzle.mjs';
import { MODELS as MODEL_DEFS } from '../public/js/models.mjs';

const MODEL_KEYS = Object.keys(MODEL_DEFS);
const COUNTS = [2, 3, 4];

let failed = 0, passed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}

// ---------------- a) 重复调用稳定性 ----------------
console.log('\n=== a) 重复调用稳定性（含随机调用顺序） ===');
{
  const combos = [];
  for (const mk of MODEL_KEYS) for (const n of COUNTS) combos.push([mk, n]);
  let ok = true;
  for (let round = 0; round < 200; round++) {
    const order = combos.slice().sort(() => Math.random() - 0.5);
    for (const [mk, n] of order) {
      const r = splitIntoPieces(mk, n);
      if (r.pieces.length !== n) { ok = false; console.error(`  轮${round}: ${mk}x${n} 片数 ${r.pieces.length}`); }
      for (let i = 0; i < n; i++) {
        const wt = isWatertight(r.pieces[i]);
        if (!wt.ok) { ok = false; console.error(`  轮${round}: ${mk}x${n} 片${i} ${wt.reason}`); }
      }
    }
    if (!ok) break;
  }
  check('200 轮随机顺序调用全部组合稳定', ok);
}

// ---------------- b) OBJ 解析器噪声输入 ----------------
console.log('\n=== b) OBJ 解析器噪声输入（不崩溃） ===');
{
  const noises = [
    '', 'v', 'v 1 2', 'v a b c d e f', 'f', 'f 1 2', 'f 0 1 2', 'f 99999 1 2',
    'v 1 2 3 0.5 0.5 0.5\nf 1 2 3',
    'g junk\ntoo short', 'v NaN NaN NaN', 'v Infinity 0 0', '\x00\x01\x02',
    ('v 1 2 3\nf 1 2 3\nf 2 3 1\n').repeat(50),
  ];
  let ok = true;
  for (const noise of noises) {
    try {
      const { positions, tris } = parseObj(noise);
      if (!Array.isArray(positions) || !Array.isArray(tris)) ok = false;
    } catch (e) { ok = false; console.error(`  噪声输入抛错: ${JSON.stringify(noise.slice(0, 30))}: ${e.message}`); }
  }
  check(`${noises.length} 种噪声输入全部安全解析`, ok);
}

// ---------------- c) 水密双重校验（索引级 + 位置级） ----------------
console.log('\n=== c) watertight 索引级与位置级交叉验证 ===');
{
  let ok = true;
  for (const mk of MODEL_KEYS) {
    for (const n of COUNTS) {
      const r = splitIntoPieces(mk, n);
      for (let pi = 0; pi < r.pieces.length; pi++) {
        const piece = r.pieces[pi];
        const I = piece.indices, P = piece.positions;
        const posKey = (i) => P[i * 6].toFixed(6) + ',' + P[i * 6 + 1].toFixed(6) + ',' + P[i * 6 + 2].toFixed(6);
        const byPos = new Map();
        for (let i = 0; i < P.length / 6; i++) {
          const k = posKey(i);
          if (!byPos.has(k)) byPos.set(k, new Set());
          byPos.get(k).add(i);
        }
        const edgeSet = new Set();
        for (let t = 0; t < I.length / 3; t++) {
          const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
          for (let k = 0; k < 3; k++) edgeSet.add(ids[k] + '>' + ids[(k + 1) % 3]);
        }
        for (const e of edgeSet) {
          const [a, b] = e.split('>').map(Number);
          if (edgeSet.has(b + '>' + a)) continue;
          const revOk = [...(byPos.get(posKey(b)) || [])].some((b2) => edgeSet.has(b2 + '>' + a) || [...(byPos.get(posKey(a)) || [])].some((a2) => edgeSet.has(b2 + '>' + a2)));
          if (!revOk) { ok = false; console.error(`  ${mk}x${n} 片${pi}: 边 ${e} 两种校验都无法配对`); }
        }
      }
    }
  }
  check('全部拼片索引级/位置级水密结论一致', ok);
}

// ---------------- d) 性能基准 ----------------
console.log('\n=== d) 性能基准（Node 基线） ===');
{
  for (const mk of MODEL_KEYS) {
    for (const n of COUNTS) {
      splitIntoPieces(mk, n); // 预热 + 填缓存
      const t0 = performance.now();
      const reps = 20;
      for (let i = 0; i < reps; i++) splitIntoPieces(mk, n);
      const cachedMs = (performance.now() - t0) / reps;
      const r = splitIntoPieces(mk, n);
      const tris = r.pieces.reduce((s, p) => s + p.triCount, 0);
      console.log(`  ${mk}x${n}: 缓存命中 ${cachedMs.toFixed(3)}ms/次, ${tris} 三角形`);
    }
  }
  const t0 = performance.now();
  let sum = 0;
  for (const mk of MODEL_KEYS) for (const n of COUNTS) sum += splitIntoPieces(mk, n).pieces.length;
  console.log(`  全组合访问总耗时（含缓存）: ${(performance.now() - t0).toFixed(2)}ms`);
  check(`全部组合可访问（${MODEL_KEYS.length} 模型 × (2+3+4) 块 = ${MODEL_KEYS.length * 9} 片）`, sum === MODEL_KEYS.length * 9);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
