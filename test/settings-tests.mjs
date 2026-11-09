// 设置与存档序列化单元测试 — node test/settings-tests.mjs
import {
  DEFAULT_SETTINGS, SETTINGS_KEY, clampSettings, loadSettings, saveSettings,
  sanitizeProgress, buildExport, parseExport, mergeProgress,
} from '../public/js/settings.mjs';

let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

console.log('=== 默认与清洗 ===');
check('默认设置完整', DEFAULT_SETTINGS.renderScale === 1 && DEFAULT_SETTINGS.stars === true && DEFAULT_SETTINGS.musicVol > 0);
const c = clampSettings({ renderScale: 9, tableY: -9, musicVol: 2, sfxVol: -1, stars: 'yes' });
check('越界值被夹紧', c.renderScale === 1.2 && c.tableY === -0.2 && c.musicVol === 1 && c.sfxVol === 0, JSON.stringify(c));
check('非法 stars 回退默认', c.stars === true);
check('null 输入回退默认', JSON.stringify(clampSettings(null)) === JSON.stringify(DEFAULT_SETTINGS));

console.log('=== 读写 ===');
{
  const store = memStore();
  const saved = saveSettings(store, { renderScale: 0.7, stars: false, tableY: 0.1, musicVol: 0.3, sfxVol: 0.5 });
  check('保存成功并写入键', saved === true && store.getItem(SETTINGS_KEY) !== null);
  const loaded = loadSettings(store);
  check('读回与保存一致', loaded.renderScale === 0.7 && loaded.stars === false && loaded.tableY === 0.1, JSON.stringify(loaded));
  store.setItem(SETTINGS_KEY, '{bad json');
  check('损坏 JSON 回退默认', loadSettings(store).renderScale === 1);
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  check('存储抛错时读取安全', loadSettings(throwing).renderScale === 1);
  check('存储抛错时保存返回 false', saveSettings(throwing, {}) === false);
}

console.log('=== 进度清洗 ===');
{
  const raw = {
    'rocket|2': { stars: 9, bestTime: -5, plays: 3, hints: -1, top: [300, 200, 200, 100] },
    'bad key!': { stars: 3 },
    'x|1': 'nope',
    'fish|4': { stars: 2, bestTime: 120.6, plays: 1, top: ['a', 150] },
  };
  const s = sanitizeProgress(raw);
  check('非法键被丢弃', !('bad key!' in s) && !('x|1' in s));
  check('星级/时间被夹紧', s['rocket|2'].stars === 3 && s['rocket|2'].bestTime === 0 && s['rocket|2'].plays === 3);
  check('Top3 去重升序且最多 3 条', JSON.stringify(s['rocket|2'].top) === JSON.stringify([100, 200, 300]), JSON.stringify(s['rocket|2'].top));
  check('小数时间取整、坏 top 过滤', s['fish|4'].bestTime === 121 && JSON.stringify(s['fish|4'].top) === JSON.stringify([150]));
}

console.log('=== 导出 / 导入 ===');
{
  const progress = { 'rocket|2': { stars: 3, bestTime: 70, plays: 2, hints: 0, top: [70, 90] } };
  const settings = { renderScale: 0.85, stars: true, tableY: 0, musicVol: 0.4, sfxVol: 1 };
  const payload = buildExport({ progress, achievements: ['first_win', 'first_8'], settings, tuning: { magnet: 0.18 } }, { version: '1.4.1' });
  check('导出结构完整', payload.app === 'wanxiang-guixing' && payload.schema === 1 && payload.version === '1.4.1');
  check('导出进度被清洗', payload.progress['rocket|2'].stars === 3);
  const parsed = parseExport(JSON.stringify(payload));
  check('导出→解析往返一致', parsed.ok && parsed.data.progress['rocket|2'].bestTime === 70 && parsed.data.achievements.length === 2 && parsed.data.tuning.magnet === 0.18, JSON.stringify(parsed));
  check('拒绝非 JSON', parseExport('not json').ok === false);
  check('拒绝非本游戏存档', parseExport(JSON.stringify({ app: 'other', schema: 1 })).ok === false);
  check('拒绝过新 schema', parseExport(JSON.stringify({ app: 'wanxiang-guixing', schema: 99 })).ok === false);
  const merged = mergeProgress({ 'rocket|2': { stars: 1, bestTime: 200, plays: 1, top: [] }, 'castle|4': { stars: 2, bestTime: 300, plays: 1, top: [] } }, parsed.data.progress);
  check('导入覆盖同关卡、保留其他关卡', merged['rocket|2'].stars === 3 && merged['castle|4'].stars === 2, JSON.stringify(merged));
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
