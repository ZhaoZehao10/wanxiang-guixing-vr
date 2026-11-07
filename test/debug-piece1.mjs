// 精确复现 gemplanet#1（x 切的 back、z 切的 back）在 z=0.30 补面的失败现场
import { cutPass, parseObj } from '../public/js/puzzle.mjs';
import { buildModel } from '../public/js/models.mjs';

const model = buildModel('gemplanet');
const { positions, tris } = parseObj(model.obj);
const weld = new Map(), V = [], remap = [];
for (let i = 0; i < positions.length / 6; i++) {
  const k = positions[i * 6].toFixed(6) + '|' + positions[i * 6 + 1].toFixed(6) + '|' + positions[i * 6 + 2].toFixed(6);
  let id = weld.get(k);
  if (id === undefined) { id = V.length / 6; for (let c = 0; c < 6; c++) V.push(positions[i * 6 + c]); weld.set(k, id); }
  remap.push(id);
}
const I0 = tris.map((x) => remap[x]);
for (let i = 0; i < V.length; i += 6) { V[i] -= model.center[0]; V[i + 1] -= model.center[1]; V[i + 2] -= model.center[2]; }
const AXIS = { x: 0, y: 1, z: 2 };
const c1 = cutPass(V, I0, AXIS.x, 0.30);
const c2 = cutPass(c1.front.V, c1.front.I, AXIS.z, 0.30);
const reg = c2.back; // gemplanet#1 补 z 盖之前
const v = reg.V, I = reg.I;
const fv = (i) => '(' + [v[i * 6], v[i * 6 + 1], v[i * 6 + 2]].map((x) => x.toFixed(4)).join(',') + ')';
const axis = AXIS.z, plane = 0.30;
const onP = (i) => Math.abs(v[i * 6 + axis] - plane) < 1e-9;

const und = new Map();
for (let t = 0; t < I.length / 3; t++) {
  const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
  for (let k = 0; k < 3; k++) {
    const p = ids[k], q = ids[(k + 1) % 3];
    if (onP(p) && onP(q)) { const key = Math.min(p, q) + '_' + Math.max(p, q); und.set(key, (und.get(key) || 0) + 1); }
  }
}
const outE = new Map();
for (let t = 0; t < I.length / 3; t++) {
  const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
  for (let k = 0; k < 3; k++) {
    const p = ids[k], q = ids[(k + 1) % 3];
    if (!(onP(p) && onP(q))) continue;
    if (und.get(Math.min(p, q) + '_' + Math.max(p, q)) !== 1) continue;
    if (outE.has(p) && outE.get(p) !== q) console.log('多重出边 at', p, fv(p), ':', outE.get(p), fv(outE.get(p)), '和', q, fv(q));
    outE.set(p, q);
  }
}
console.log('z=0.30 出边数:', outE.size);

// 从起点 8 行走（错误信息说 起点 8）
const seen = new Set();
let chainIdx = 0;
for (const [t0, h0] of outE) {
  if (seen.has(t0)) continue;
  const ring = [t0];
  seen.add(t0);
  let c = h0, closed = false, deadEnd = -1;
  for (let g = 0; g < 100000; g++) {
    if (c === t0) { closed = true; break; }
    if (seen.has(c)) break;
    ring.push(c);
    seen.add(c);
    const nx = outE.get(c);
    if (nx === undefined) { deadEnd = c; break; }
    c = nx;
  }
  chainIdx++;
  if (closed) { console.log(`chain${chainIdx}: 闭环 len=${ring.length}`); continue; }
  console.log(`chain${chainIdx}: 开弧 len=${ring.length} 死端 v${deadEnd}=${deadEnd >= 0 ? fv(deadEnd) : '?'} onPlane=${deadEnd >= 0 ? onP(deadEnd) : '?'}`);
  console.log('  环:', ring.map((i) => i + fv(i)).join(' -> '));
  if (deadEnd >= 0) {
    console.log(`  死端 v${deadEnd} 的所有邻边(在 z=0.30 平面上的):`);
    for (const [key, cnt] of und) {
      const [a, b] = key.split('_').map(Number);
      if (a === deadEnd || b === deadEnd) console.log(`    ${a}-${b} 计数${cnt}`);
    }
    console.log(`  含死端的三角形:`);
    for (let t = 0; t < I.length / 3; t++) {
      const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
      if (ids.includes(deadEnd)) console.log(`    tri${t}: ${ids.map((i) => i + fv(i)).join(' ')} onPlane:${ids.map((i) => (onP(i) ? 'Y' : 'n')).join('')}`);
    }
  }
}
