// 静态检查：JS 语法 / HTML 重复 ID / 本地资源引用 / 必需文件
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, 'public');
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${detail}`); }
};

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const jsFiles = walk(path.join(PUBLIC, 'js')).filter((f) => /\.(mjs|js)$/.test(f));
let syntaxFail = 0;
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'ignore' }); }
  catch (e) { syntaxFail++; console.log(`    syntax error: ${path.relative(ROOT, f)}`); }
}
check(`JS 语法检查（${jsFiles.length} 个文件）`, syntaxFail === 0, `失败 ${syntaxFail}`);

const html = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
check('HTML ID 唯一', dup.length === 0, dup.join(','));

const required = ['index.html', 'style.css', 'js/main.js', 'js/models.mjs', 'js/puzzle.mjs', 'js/progress.mjs', 'js/settings.mjs', 'js/i18n.mjs', 'js/sfx.mjs'];
const missing = required.filter((f) => !fs.existsSync(path.join(PUBLIC, f)));
check('必需文件存在', missing.length === 0, missing.join(','));

// 本地 src/href 引用（忽略外链、锚点、data:、blob:）
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
  .filter((u) => !/^(https?:|#|data:|blob:|mailto:|javascript:)/i.test(u));
const badRefs = [];
for (const u of refs) {
  const clean = u.split('?')[0].split('#')[0];
  if (!clean) continue;
  const p = path.resolve(PUBLIC, clean);
  if (!p.startsWith(PUBLIC) || !fs.existsSync(p)) badRefs.push(u);
}
check(`本地资源引用（${refs.length} 个）`, badRefs.length === 0, badRefs.join(','));

// 模块顺序：settings/i18n 必须在 main 之前被离线打包
const offlineTool = fs.readFileSync(path.join(ROOT, 'tools/make-offline-puzzle.mjs'), 'utf8');
check('离线打包包含 settings/i18n', offlineTool.includes("'js/settings.mjs'") && offlineTool.includes("'js/i18n.mjs'"));

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
