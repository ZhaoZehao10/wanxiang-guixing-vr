// 检查 gemplanet 第一刀（x=0.30）后前侧壳的边流形性
process.env.PUZZLE_DEBUG = '1';
import { debugCutPass, parseObj } from '../public/js/puzzle.mjs';
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

const { back, front } = debugCutPass(V, I0, 0, 0.30);
console.log('back 顶点数:', back.V.length / 6, '三角形:', back.I.length / 3);
console.log('front 顶点数:', front.V.length / 6, '三角形:', front.I.length / 3);

function shellCensus(reg, label) {
  const m = new Map();
  const onP = (i) => Math.abs(reg.V[i * 6] - 0.30) < 1e-9;
  for (let t = 0; t < reg.I.length / 3; t++) {
    const ids = [reg.I[t * 3], reg.I[t * 3 + 1], reg.I[t * 3 + 2]];
    for (let k = 0; k < 3; k++) {
      const a = ids[k], b = ids[(k + 1) % 3];
      const key = Math.min(a, b) + '_' + Math.max(a, b);
      let e = m.get(key);
      if (!e) { e = { n: 0, onA: onP(a), onB: onP(b), pa: [reg.V[a * 6], reg.V[a * 6 + 1], reg.V[a * 6 + 2]], pb: [reg.V[b * 6], reg.V[b * 6 + 1], reg.V[b * 6 + 2]] }; m.set(key, e); }
      e.n++;
    }
  }
  let b1 = 0, b2 = 0, bad = 0;
  for (const [key, e] of m) {
    if (e.onA && e.onB) { if (e.n === 1) b1++; else if (e.n === 2) b2++; }
    else if (e.n !== 2) { bad++; if (bad <= 6) console.log(label, '非切面边异常:', key, 'x' + e.n, e.pa.map((x) => x.toFixed(4)), e.pb.map((x) => x.toFixed(4))); }
  }
  console.log(`${label}: 切面边 1次=${b1} 2次=${b2} | 非切面边异常=${bad}`);
}
shellCensus(back, 'back');
shellCensus(front, 'front');
