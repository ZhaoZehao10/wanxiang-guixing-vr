// 旧存档迁移 / 导入兼容测试 — node test/save-migration.mjs
import { buildExport, parseExport, sanitizeProgress, mergeProgress, clampSettings } from '../public/js/settings.mjs';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};

// 模拟 1.3.x 旧存档：没有 top 字段、字段命名一致
const legacy = {
  'rocket|2': { stars: 3, bestTime: 80, plays: 4, hints: 1 },
  'rocket|4': { stars: 2, bestTime: 300, plays: 2 },
  'penguin|6': { stars: 1, bestTime: 600, plays: 1 },
};

console.log('=== 旧存档清洗与迁移 ===');
const migrated = sanitizeProgress(legacy);
check('旧条目全部保留', Object.keys(migrated).length === 3);
check('缺失 top 补空数组', Array.isArray(migrated['rocket|2'].top) && migrated['rocket|2'].top.length === 0);
check('缺失 hints 补 0', migrated['rocket|4'].hints === 0);
check('旧字段值不变', migrated['rocket|2'].stars === 3 && migrated['rocket|2'].bestTime === 80);

console.log('=== 旧存档导出 → 新版本导入 ===');
const exported = buildExport({ progress: legacy, achievements: ['first_win'], settings: { musicVol: 0.5 }, tuning: {} }, { version: '1.3.0' });
const parsed = parseExport(JSON.stringify(exported));
check('旧版本导出可被解析', parsed.ok === true, JSON.stringify(parsed));
check('关卡成绩完整迁移', parsed.data.progress['penguin|6'].bestTime === 600 && parsed.data.progress['rocket|4'].stars === 2);
const emptyCurrent = {};
const imported = mergeProgress(emptyCurrent, parsed.data.progress);
check('导入空进度得到全部关卡', Object.keys(imported).length === 3);
check('原对象未被修改', Object.keys(emptyCurrent).length === 0);

console.log('=== 合并策略 ===');
const current = { 'rocket|2': { stars: 1, bestTime: 150, plays: 9, top: [150] }, 'castle|2': { stars: 3, bestTime: 90, plays: 2, top: [90] } };
const merged = mergeProgress(current, { 'rocket|2': { stars: 3, bestTime: 70, plays: 2, top: [70, 80] } });
check('同关卡以导入为准', merged['rocket|2'].stars === 3 && merged['rocket|2'].bestTime === 70);
check('未导入关卡保留本机记录', merged['castle|2'].stars === 3 && merged['castle|2'].bestTime === 90);

console.log('=== 设置与异常 ===');
check('缺失设置字段补默认', clampSettings({ musicVol: 0.4 }).renderScale === 1 && clampSettings({ musicVol: 0.4 }).sfxVol === 1);
check('未知字段忽略', clampSettings({ hack: 123 }).hack === undefined);
check('损坏文件给出错误而非抛异常', parseExport('{bad').ok === false && !!parseExport('{bad').error);

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
