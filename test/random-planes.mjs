import { generateRandomPlanes, splitWithPlanes, isWatertight } from "../public/js/puzzle.mjs";
let pass=0, fail=0;
const check=(n,c,x="")=>{ if(c){pass++;console.log(`  ✓ ${n}`);}else{fail++;console.log(`  ✗ ${n} ${x}`);} };
for (const [m,n] of [["rocket",4],["rocket",8],["penguin",6],["coffee",8],["pumpkin",4]]) {
  for (let k=0;k<2;k++){
    const planes = generateRandomPlanes(m,n);
    const r = splitWithPlanes(m,planes);
    check(`${m} x${n} 随机 #${k+1}: ${planes.length} 刀 / ${r.pieces.length} 片 / 水密`,
      planes.length===n-1 && r.pieces.length===n && r.pieces.every(p=>isWatertight(p).ok));
  }
}
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail?1:0);
