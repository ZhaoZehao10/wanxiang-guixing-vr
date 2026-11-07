// 检查第一刀 front 壳里角点 (0.30, -0.4546, 0.30) 附近的边界结构
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
const f = c1.front;
const onX = (i) => Math.abs(f.V[i * 6] - 0.30) < 1e-9;

// 最近的顶点
let best = -1, bd = 1e9;
for (let i = 0; i < f.V.length / 6; i++) {
  const dx = f.V[i * 6] - 0.30, dy = f.V[i * 6 + 1] - (-0.454559), dz = f.V[i * 6 + 2] - 0.30;
  const dd = Math.hypot(dx, dy, dz);
  if (dd < bd) { bd = dd; best = i; }
}
console.log('front1 最近 v' + best, '(' + f.V[best * 6].toExponential(4), f.V[best * 6 + 1].toExponential(4), f.V[best * 6 + 2].toExponential(4) + ') 距离 ' + bd.toExponential(3));

// x=0.30 平面上的边界边
const und = new Map();
for (let t = 0; t < f.I.length / 3; t++) {
  const ids = [f.I[t * 3], f.I[t * 3 + 1], f.I[t * 3 + 2]];
  for (let k = 0; k < 3; k++) {
    const p = ids[k], q = ids[(k + 1) % 3];
    if (onX(p) && onX(q)) { const key = Math.min(p, q) + '_' + Math.max(p, q); und.set(key, (und.get(key) || 0) + 1); }
  }
}
const outE = new Map();
for (let t = 0; t < f.I.length / 3; t++) {
  const ids = [f.I[t * 3], f.I[t * 3 + 1], f.I[t * 3 + 2]];
  for (let k = 0; k < 3; k++) {
    const p = ids[k], q = ids[(k + 1) % 3];
    if (!(onX(p) && onX(q))) continue;
    if (und.get(Math.min(p, q) + '_' + Math.max(p, q)) !== 1) continue;
    outE.set(p, q);
  }
}
// 行走
const seen = new Set();
for (const [t0, h0] of outE) {
  if (seen.has(t0)) continue;
  const ring = [t0]; seen.add(t0);
  let c = h0, closed = false, dead = -1;
  for (let g = 0; g < 100000; g++) {
    if (c === t0) { closed = true; break; }
    if (seen.has(c)) break;
    ring.push(c); seen.add(c);
    const nx = outE.get(c);
    if (nx === undefined) { dead = c; break; }
    c = nx;
  }
  console.log('front1 边界链 len=' + ring.length, closed ? '闭环' : '开弧 死端 v' + dead + ' (' + f.V[dead * 6].toFixed(6) + ',' + f.V[dead * 6 + 1].toFixed(6) + ',' + f.V[dead * 6 + 2].toFixed(6) + ')');
}
