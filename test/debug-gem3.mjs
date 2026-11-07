// gemplanet n=3 中间片重复边定位
process.env.PUZZLE_DEBUG = '1';
import { splitIntoPieces } from '../public/js/puzzle.mjs';

const r = splitIntoPieces('gemplanet', 3);
const p = r.pieces[1];
const I = p.indices, P = p.positions;
const map = new Map();
for (let t = 0; t < I.length / 3; t++) {
  const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
  for (let k = 0; k < 3; k++) {
    const key = ids[k] + '_' + ids[(k + 1) % 3];
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(t);
  }
}
const v = (i) => '(' + [P[i * 6], P[i * 6 + 1], P[i * 6 + 2]].map((x) => x.toFixed(4)).join(',') + ')';
let shown = 0;
for (const [key, tris] of map) {
  if (tris.length !== 1) {
    console.log('EDGE', key, 'x' + tris.length);
    for (const t of tris) console.log('  tri' + t + ':', [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]].map(v).join('  '));
    if (++shown >= 6) break;
  }
}
if (!shown) console.log('piece1: 无重复边');
