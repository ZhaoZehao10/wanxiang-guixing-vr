// 抓 v14 附近的边界簿记状态（gemplanet 两刀后 back 壳）
process.env.PUZZLE_DEBUG = '1';
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
const reg = c2.back;
const v = reg.V, I = reg.I;
const fv = (i) => '(' + [v[i * 6], v[i * 6 + 1], v[i * 6 + 2]].map((x) => x.toFixed(4)).join(',') + ')';

for (const [ax, pl] of [['x', 0.30], ['z', 0.30]]) {
  const axis = AXIS[ax];
  const onP = (i) => Math.abs(v[i * 6 + axis] - pl) < 1e-9;
  const und = new Map();
  for (let t = 0; t < I.length / 3; t++) {
    const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    for (let k = 0; k < 3; k++) {
      const p = ids[k], q = ids[(k + 1) % 3];
      if (onP(p) && onP(q)) { const key = Math.min(p, q) + '_' + Math.max(p, q); und.set(key, (und.get(key) || 0) + 1); }
    }
  }
  // v14 的全部邻边
  console.log(`\n=== ${ax}=${pl} 平面上 v14=${fv(14)} 的邻边 ===`);
  for (const [key, cnt] of und) {
    const [a, b] = key.split('_').map(Number);
    if (a === 14 || b === 14) console.log(`  边 ${a}-${b} 计数${cnt}  A=${fv(a)} B=${fv(b)}`);
  }
  // 包含 v14 的三角形
  console.log('包含 v14 的三角形:');
  for (let t = 0; t < I.length / 3; t++) {
    const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    if (ids.includes(14)) console.log(`  tri${t}: ${ids.map(fv).join(' ')}  (onPlane: ${ids.map((i) => onP(i) ? 'Y' : 'n').join('')})`);
  }
}
