// 在第一刀 front 壳中搜索 x=0.30 的切割点里 y 最接近 -0.4546 的
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
const c1 = cutPass(V, I0, 0, 0.30);
const f = c1.front;
console.log('front1 中 x=0.30 且 |y+0.454559|<0.001 的顶点:');
for (let i = 0; i < f.V.length / 6; i++) {
  if (Math.abs(f.V[i * 6] - 0.30) < 1e-9 && Math.abs(f.V[i * 6 + 1] + 0.454559) < 0.001) {
    console.log(`  v${i} (${f.V[i * 6].toFixed(8)}, ${f.V[i * 6 + 1].toFixed(8)}, ${f.V[i * 6 + 2].toFixed(8)})`);
  }
}
// 这些顶点是否恰好 z=0.30？
console.log('\nfront1 中 z=0.30 且 x=0.30 的顶点（双面点）:');
for (let i = 0; i < f.V.length / 6; i++) {
  if (Math.abs(f.V[i * 6] - 0.30) < 1e-9 && Math.abs(f.V[i * 6 + 2] - 0.30) < 1e-9) {
    console.log(`  v${i} (${f.V[i * 6].toFixed(8)}, ${f.V[i * 6 + 1].toFixed(8)}, ${f.V[i * 6 + 2].toFixed(8)})`);
  }
}
