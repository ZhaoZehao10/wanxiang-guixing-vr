// 模型几何自检 — node tools/check-models.mjs
// 对每个模型：按位置焊接 → 求连通分量（= 各图元壳）→ 每个壳做有向边普查 +
// 有符号体积检查。任何一项失败都会退出码 1。
// 这能提前暴露：图元不闭合、绕向反了、两个壳顶点重合被焊成一个壳（拓扑桥接）。
import { MODELS, buildModel } from '../public/js/models.mjs';

function parseObj(obj) {
  const pos = [], tris = [];
  for (const line of obj.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') pos.push([+p[1], +p[2], +p[3]]);
    else if (p[0] === 'f') tris.push([+p[1] - 1, +p[2] - 1, +p[3] - 1]);
  }
  return { pos, tris };
}

function analyze(obj) {
  const { pos, tris } = parseObj(obj);
  // 焊接
  const key = (v) => v[0].toFixed(6) + '|' + v[1].toFixed(6) + '|' + v[2].toFixed(6);
  const map = new Map(); const V = []; const remap = [];
  for (const v of pos) {
    const k = key(v);
    let id = map.get(k);
    if (id === undefined) { id = V.length; V.push(v); map.set(k, id); }
    remap.push(id);
  }
  const T = tris.map((t) => t.map((i) => remap[i]));
  // 并查集找连通分量
  const parent = V.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (const [a, b, c] of T) { union(a, b); union(b, c); }
  const comps = new Map();
  for (let i = 0; i < V.length; i++) {
    const r = find(i);
    if (!comps.has(r)) comps.set(r, { verts: new Set(), tris: [] });
    comps.get(r).verts.add(i);
  }
  for (const [a, b, c] of T) comps.get(find(a)).tris.push([a, b, c]);

  const results = [];
  for (const [root, comp] of comps) {
    // 有向边普查（分量内）
    const dir = new Map();
    for (const [a, b, c] of comp.tris) for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const k = u + '_' + v; dir.set(k, (dir.get(k) || 0) + 1);
    }
    let wt = true, why = '';
    for (const [k, n] of dir) {
      if (n !== 1) { wt = false; why = `有向边 ${k} 出现 ${n} 次`; break; }
      const [a, b] = k.split('_');
      if (!dir.has(b + '_' + a)) { wt = false; why = `有向边 ${k} 无反向配对`; break; }
    }
    // 有符号体积（相对分量质心，避免大坐标误差）
    let cx = 0, cy = 0, cz = 0;
    for (const i of comp.verts) { cx += V[i][0]; cy += V[i][1]; cz += V[i][2]; }
    const n = comp.verts.size; cx /= n; cy /= n; cz /= n;
    let vol = 0;
    for (const [a, b, c] of comp.tris) {
      const ax = V[a][0] - cx, ay = V[a][1] - cy, az = V[a][2] - cz;
      const bx = V[b][0] - cx, by = V[b][1] - cy, bz = V[b][2] - cz;
      const cxx = V[c][0] - cx, cyy = V[c][1] - cy, czz = V[c][2] - cz;
      vol += (ax * (by * czz - bz * cyy) - ay * (bx * czz - bz * cxx) + az * (bx * cyy - by * cxx)) / 6;
    }
    results.push({ verts: comp.verts.size, tris: comp.tris.length, wt, why, vol });
  }
  return { V, T, comps: results };
}

let bad = 0;
for (const key of Object.keys(MODELS)) {
  const m = buildModel(key);
  const { V, T, comps } = analyze(m.obj);
  const allWt = comps.every((c) => c.wt && c.vol > 0);
  const totalVol = comps.reduce((s, c) => s + c.vol, 0);
  console.log(`\n=== ${m.emoji} ${m.name} (${key}) ===`);
  console.log(`  顶点 ${V.length} / 三角形 ${T.length} / 封闭壳 ${comps.length} / 总体积 ${totalVol.toFixed(3)}`);
  if (!allWt) {
    bad++;
    for (const [i, c] of comps.entries()) {
      if (!c.wt || c.vol <= 0) console.error(`  ✗ 壳#${i}: 顶点${c.verts} 三角${c.tris} 水密=${c.wt} (${c.why}) 体积=${c.vol.toFixed(5)}`);
    }
  } else {
    console.log(`  ✓ 全部 ${comps.length} 个壳水密且绕向正确`);
  }
}
console.log(`\n${bad ? `✗ ${bad} 个模型不合格` : '✓ 全部模型合格'}`);
process.exit(bad ? 1 : 0);
