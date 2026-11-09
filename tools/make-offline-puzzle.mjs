// 把 万象归形 打包成单文件离线 HTML（file:// 直接打开，零服务器零网络）
//
// 做法：ESM 模块按依赖序拼接为单文件（零外部依赖）：
//   1) three.module.min.js 结尾的 export{...} 用胶水代码转成全局 THREE（IIFE 包裹，
//      内部压缩变量不外泄）；
//   2) 游戏模块按依赖序拼接并剥掉 import/export：
//      models → puzzle → progress → settings → sfx → main（按依赖序；VRButton 独立）；
//   3) style.css 内联，并在页脚加入离线提示。
//
// 用法: node tools\make-offline-puzzle.mjs → dist/WanxiangGuixing-offline.html
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..', '..');
const PUB = path.join(ROOT, 'public');
const stripBom = (s) => s.replace(/^\uFEFF/, '');
const read = (...p) => stripBom(fs.readFileSync(path.join(...p), 'utf8'));

// ---------- 1) three.js → 全局 THREE ----------
const threeSrc = read(PUB, 'vendor', 'three.module.min.js');
const exportMatch = threeSrc.match(/export\{([^}]+)\};?\s*$/);
if (!exportMatch) { console.error('three.js 导出表解析失败'); process.exit(1); }
const names = exportMatch[1].split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => (s.includes(' as ') ? s.split(/\s+as\s+/) : [s, s]));
const glue = names.map(([local, pub]) => `THREE.${pub}=${local};`).join('');
const threeScript = `// three.js r160 (C) 2010-2023 Three.js Authors · MIT · 离线内联版
var THREE = {};
(function(){
${threeSrc.replace(/export\{[^}]+\};?\s*$/, glue)}
})();
`;

// ---------- 2) 游戏模块拼接 ----------
function stripModule(src) {
  return src
    .replace(/^\s*import\s+[^;]*?from\s*['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*import\s+['"][^'"]+['"];?\s*$/gm, '')
    .replace(/^\s*export\s+(?=(const|let|var|function|class|async)\s)/gm, '')
    .replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '')
    .replace(/^\s*export\s+default\s+/gm, '');
}

const vrButtonSrc = stripModule(read(PUB, 'vendor', 'VRButton.js'));
const gameSrc = [
  'js/models.mjs',
  'js/progress.mjs',
  'js/settings.mjs',
  'js/puzzle.mjs',
  'js/sfx.mjs',
  'js/main.js',
].map((rel) => `// ===== ${rel} =====\n${stripModule(read(PUB, ...rel.split('/')))}`).join('\n');

// 兜底：拼接后不应残留任何 import/export 语句（残留说明解析漏了，必须报错而不是产出坏包）
const leftover = gameSrc.match(/^\s*(import|export)\s/m);
if (leftover) { console.error('拼接后仍有 import/export 残留，请检查 stripModule：', leftover[0]); process.exit(1); }

// ---------- 3) 页面组装 ----------
let html = read(PUB, 'index.html');
const css = read(PUB, 'style.css');
html = html.replace(/<link[^>]+href="style\.css"[^>]*>/, `<style>\n${css}\n</style>`);
html = html.replace(/<script[^>]+src="js\/main\.js"[^>]*><\/script>/,
  `<script>\n${threeScript}\n</script>\n<script>\n${vrButtonSrc}\n</script>\n<script>\n${gameSrc}\n</script>`);
// 离线版页脚提示（无外部依赖）
html = html.replace('</body>', '<div style="position:fixed;bottom:16px;left:0;right:0;text-align:center;z-index:9;opacity:.55;font-size:12px">单文件离线版 · 全部资源已内联 · 无需网络</div></body>');
if (!html.includes('单文件离线版')) { console.error('页脚替换失败（index.html 结构变了？）'); process.exit(1); }

fs.mkdirSync(path.join(ROOT, 'dist'), { recursive: true });
const out = path.join(ROOT, 'dist', 'WanxiangGuixing-offline.html');
fs.writeFileSync(out, html, 'utf8');
console.log('写出:', out, `${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
