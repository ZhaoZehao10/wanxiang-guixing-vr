// 破洞边深挖 — 找到无反向配对的有向边后，按位置搜索所有相关边，定位缺失来源
import { splitIntoPieces } from '../public/js/puzzle.mjs';

const [mk, nStr] = process.argv.slice(2);
const n = parseInt(nStr, 10);
const r = splitIntoPieces(mk, n);

function pos(p, i) { return [p[i * 6], p[i * 6 + 1], p[i * 6 + 2]]; }
function k3(v) { return v.map((x) => x.toFixed(6)).join(','); }

for (let pi = 0; pi < r.pieces.length; pi++) {
  const piece = r.pieces[pi];
  const I = piece.indices, P = piece.positions;
  const nT = I.length / 3;

  // 索引级有向边普查
  const directed = new Map();
  for (let t = 0; t < nT; t++) {
    for (let k = 0; k < 3; k++) {
      const a = I[t * 3 + k], b = I[t * 3 + (k + 1) % 3];
      const key = a + '_' + b;
      if (!directed.has(key)) directed.set(key, []);
      directed.get(key).push(t);
    }
  }
  const holes = [];
  for (const [key, tris] of directed) {
    if (tris.length !== 1) { holes.push({ key, tris, why: 'x' + tris.length }); continue; }
    const [a, b] = key.split('_').map(Number);
    if (!directed.has(b + '_' + a)) holes.push({ key, tris, why: 'no-reverse' });
  }
  if (!holes.length) { console.log(`piece${pi}: OK`); continue; }
  console.log(`piece${pi}: ${holes.length} 条破洞边`);

  // 位置 → 索引 映射（检查是否有"同位置不同索引"的顶点）
  const byPos = new Map();
  for (let i = 0; i < P.length / 6; i++) {
    const k = k3(pos(P, i));
    if (!byPos.has(k)) byPos.set(k, []);
    byPos.get(k).push(i);
  }
  let dupPos = 0;
  for (const [k, ids] of byPos) if (ids.length > 1) dupPos++;
  console.log(`  同位置多索引的顶点数: ${dupPos}`);

  for (const { key, tris, why } of holes.slice(0, 4)) {
    const [a, b] = key.split('_').map(Number);
    console.log(`  [${why}] ${key}`);
    console.log(`    A=${k3(pos(P, a))}  B=${k3(pos(P, b))}`);
    for (const t of tris) {
      console.log(`    tri${t}: ${[I[t * 3], I[t * 3 + 1], I[t * 3 + 2]].map((i) => k3(pos(P, i))).join('  ')}`);
    }
    // 谁在用 A、B 这两个位置？（列出含 A 或 B 位置的所有边的另一端）
    for (const [label, vi] of [['A', a], ['B', b]]) {
      const ids = byPos.get(k3(pos(P, vi))) || [];
      if (ids.length > 1) console.log(`    位置${label}被索引复用: ${ids.join(',')}`);
      const partners = new Set();
      for (const [ekey] of directed) {
        const [x, y] = ekey.split('_').map(Number);
        if (x === vi) partners.add(y);
        if (y === vi) partners.add(x);
      }
      console.log(`    顶点${label}(idx=${vi})的边邻居: ${[...partners].join(',')}`);
    }
  }
}
