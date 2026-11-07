// 水密性失败诊断 — 打印重复/未配对边的全精度坐标与涉事三角形
import { splitIntoPieces } from '../public/js/puzzle.mjs';

function census(piece) {
  const map = new Map();
  const I = piece.indices;
  for (let t = 0; t < I.length / 3; t++) {
    const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    for (let k = 0; k < 3; k++) {
      const a = ids[k], b = ids[(k + 1) % 3];
      const key = a + '_' + b;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ a, b, tri: t });
    }
  }
  return map;
}

function vstr(p, i) {
  return `(${p[i * 6].toFixed(6)}, ${p[i * 6 + 1].toFixed(6)}, ${p[i * 6 + 2].toFixed(6)})`;
}

const CASES = process.argv[2]
  ? [[process.argv[2], parseInt(process.argv[3], 10)]]
  : [['mushroom', 3], ['rocket', 2], ['gemplanet', 2]];

for (const [mk, n] of CASES) {
  console.log(`\n########## ${mk} n=${n} ##########`);
  const r = splitIntoPieces(mk, n);
  r.pieces.forEach((p, pi) => {
    const map = census(p);
    const bad = [];
    for (const [key, edges] of map) {
      const [ak, bk] = key.split('_').map(Number);
      if (edges.length !== 1) bad.push({ key, edges, why: `出现${edges.length}次` });
      else if (!map.has(bk + '_' + ak)) bad.push({ key, edges, why: '无反向配对' });
    }
    if (!bad.length) { console.log(`piece${pi}: OK`); return; }
    console.log(`piece${pi}: ${bad.length} 条问题边`);
    for (const { key, edges, why } of bad.slice(0, 6)) {
      const e0 = edges[0];
      console.log(`  [${why}] ${key}`);
      console.log(`    端点A全精度: ${vstr(p.positions, e0.a)}`);
      console.log(`    端点B全精度: ${vstr(p.positions, e0.b)}`);
      const tris = new Set(edges.map((e) => e.tri));
      for (const t of tris) {
        const ids = [p.indices[t * 3], p.indices[t * 3 + 1], p.indices[t * 3 + 2]];
        console.log(`    tri${t}: ${ids.map((i) => vstr(p.positions, i)).join('  ')}`);
      }
    }
  });
}
