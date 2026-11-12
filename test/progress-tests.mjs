// 进度 / 星级 / 成就 纯逻辑单元测试 — node test/progress-tests.mjs
// 用内存 store 模拟 localStorage，不依赖浏览器。
import {
  DIFFICULTY, MODEL_KEYS, ACHIEVEMENTS, PROGRESS_KEY, ACHIEVE_KEY,
  levelKey, parTime, starsFor, recordResult, evaluateAchievements, summarize,
  loadProgress, saveProgress, loadAchievements, saveAchievements,
} from '../public/js/progress.mjs';

let passed = 0, failed = 0;
const check = (name, cond, detail = '') => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
};
const memStore = () => {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), _m: m };
};

// ---------------- 星级阈值 ----------------
console.log('\n=== 星级阈值 ===');
for (const n of DIFFICULTY) {
  const par = parTime(n);
  check(`${n} 块：par=${par}s → 3 星`, starsFor(par, n) === 3);
  check(`${n} 块：par+1s → 2 星`, starsFor(par + 1, n) === 2);
  check(`${n} 块：1.6×par+1s → 1 星`, starsFor(Math.floor(par * 1.6) + 1, n) === 1);
}
check('levelKey 格式', levelKey('rocket', 4) === 'rocket|4');
check('模型数/难度数正确（22 模型 × 5 难度，106 关）', MODEL_KEYS.length === 22 && DIFFICULTY.length === 5);

// ---------------- 成绩写入 ----------------
console.log('\n=== 成绩写入 ===');
{
  const p = {};
  const r1 = recordResult(p, 'rocket', 4, 300, 0); // 4 块 par=260s → 2 星
  check('首通：plays=1 / bestTime / 星级按用时', r1.rec.plays === 1 && r1.rec.bestTime === 300 && r1.stars === 2, JSON.stringify(r1));
  const r2 = recordResult(p, 'rocket', 4, 400, 1); // 更慢 → 星级/最佳不变
  check('更慢一次：星级保留、bestTime 不变、plays=2、提示累计',
    r2.rec.stars === 2 && r2.rec.bestTime === 300 && r2.rec.plays === 2 && r2.rec.hints === 1, JSON.stringify(r2.rec));
  const r3 = recordResult(p, 'rocket', 4, 100, 0);
  check('更快的成绩刷新 bestTime 并升星', r3.rec.bestTime === 100 && r3.rec.stars === 3, JSON.stringify(r3.rec));
}

// ---------------- Top3 排行榜 ----------------
console.log('\n=== Top3 排行榜 ===');
{
  const p = {};
  recordResult(p, 'rocket', 2, 300, 0);
  recordResult(p, 'rocket', 2, 200, 0);
  recordResult(p, 'rocket', 2, 400, 0);
  recordResult(p, 'rocket', 2, 150, 0);
  const rec = p['rocket|2'];
  check('Top3 升序保留前 3、plays 累计',
    JSON.stringify(rec.top) === JSON.stringify([150, 200, 300]) && rec.plays === 4 && rec.bestTime === 150,
    JSON.stringify(rec));
}

// ---------------- 成就判定 ----------------
console.log('\n=== 成就判定 ===');
{
  // 空进度：无成就
  check('空进度不解锁任何成就', evaluateAchievements({}, []).length === 0);

  // 单关通关：first_win
  const p1 = {};
  recordResult(p1, 'rocket', 2, 60, 0);
  const u1 = evaluateAchievements(p1, []);
  check('单关通关 → first_win', u1.length === 1 && u1[0] === 'first_win', JSON.stringify(u1));

  // 全部 2 块 + 三星 → all_easy / collector / perfectionist
  const p2 = {};
  for (const mk of MODEL_KEYS) recordResult(p2, mk, 2, 30, 0);
  const u2 = evaluateAchievements(p2, ['first_win']);
  check('全部 2 块三星 → all_easy + collector + perfectionist',
    ['all_easy', 'collector', 'perfectionist'].every((id) => u2.includes(id)), JSON.stringify(u2));

  // 6 块无提示 + 300 秒内
  const p3 = {};
  recordResult(p3, 'gift', 6, 250, 0);
  const u3 = evaluateAchievements(p3, []);
  check('6 块 250s 无提示 → thinker + speedrun',
    u3.includes('thinker') && u3.includes('speedrun'), JSON.stringify(u3));

  // 6 块用了提示 → 不应解锁 thinker
  const p4 = {};
  recordResult(p4, 'gift', 6, 250, 2);
  const u4 = evaluateAchievements(p4, []);
  check('6 块用了提示 → 不解锁 thinker', !u4.includes('thinker') && u4.includes('speedrun'), JSON.stringify(u4));

  // 全部 6 块 → all_master
  const p5 = {};
  for (const mk of MODEL_KEYS) recordResult(p5, mk, 6, 400, 1);
  const u5 = evaluateAchievements(p5, []);
  check('全部 6 块 → all_master + collector', u5.includes('all_master') && u5.includes('collector'), JSON.stringify(u5));

  // 幂等：已解锁的不再返回
  const u6 = evaluateAchievements(p2, ['first_win', 'all_easy', 'collector', 'perfectionist', 'star_50']);
  check('已解锁成就不会重复返回', u6.length === 0, JSON.stringify(u6));

  // 8 块成就（极限档）
  const p8a = {};
  recordResult(p8a, 'rocket', 8, 600, 0);
  check('完成 8 块 → first_8', evaluateAchievements(p8a, []).includes('first_8'), JSON.stringify(evaluateAchievements(p8a, [])));
  const p8b = {};
  for (const mk of MODEL_KEYS.slice(0, 8)) recordResult(p8b, mk, 8, 700, 0);
  check('8 个模型完成 8 块 → eight_master', evaluateAchievements(p8b, []).includes('eight_master'), JSON.stringify(evaluateAchievements(p8b, [])));
  // 新成就：50 星 / 8 块三星 ×3
  const pStar = {};
  for (const mk of MODEL_KEYS.slice(0, 10)) recordResult(pStar, mk, 2, 40, 0); // 10 关 × 3 星 = 30
  check('累计不足 50 星不解锁', !evaluateAchievements(pStar, []).includes('star_50'));
  for (const mk of MODEL_KEYS.slice(10, 17)) recordResult(pStar, mk, 2, 40, 0); // +7 关 = 51 星
  check('累计 ≥50 星 → star_50', evaluateAchievements(pStar, []).includes('star_50'), JSON.stringify(evaluateAchievements(pStar, [])));
  const p8c = {};
  for (const mk of MODEL_KEYS.slice(0, 3)) recordResult(p8c, mk, 8, 500, 0); // 500s → 3 星
  check('3 个模型 8 块三星 → eight_three', evaluateAchievements(p8c, []).includes('eight_three'), JSON.stringify(evaluateAchievements(p8c, [])));
  // 百星 / 大师全三星
  const p100 = {};
  for (const mk of MODEL_KEYS) recordResult(p100, mk, 2, 40, 0); // 20×3 = 60 星
  for (const mk of MODEL_KEYS) recordResult(p100, mk, 4, 40, 0); // +60 = 120 星
  check('累计 30 天每日挑战 → daily_30', evaluateAchievements({}, [], { dailyDays: 30 }).includes('daily_30'));
  check('累计 100 天每日挑战 → daily_100', evaluateAchievements({}, [], { dailyDays: 100 }).includes('daily_100'));
  check('累计 ≥100 星 → star_100', evaluateAchievements(p100, []).includes('star_100'), JSON.stringify(evaluateAchievements(p100, []).filter((x) => x === 'star_100')));
  const pM6 = {};
  for (const mk of MODEL_KEYS) recordResult(pM6, mk, 6, 40, 0); // 每关 3 星
  check('全部模型 6 块三星 → all_perfect_6', evaluateAchievements(pM6, []).includes('all_perfect_6'), JSON.stringify(evaluateAchievements(pM6, []).filter((x) => x === 'all_perfect_6')));
  check('成就总数 = 15', ACHIEVEMENTS.length === 15);
}

// ---------------- 统计概览 ----------------
console.log('\n=== 统计概览 ===');
{
  const p = {};
  recordResult(p, 'rocket', 2, 30, 0); // 3 星
  recordResult(p, 'gift', 4, 300, 0);   // 2 星
  const s = summarize(p, 106);
  check('summarize：2 关 / 5 星 / 总关数与满星按传入总数计算',
    s.done === 2 && s.stars === 5 && s.total === 106 && s.maxStars === 318, JSON.stringify(s));
  check('summarize 空进度全 0', summarize({}).done === 0 && summarize({}).stars === 0);
}

// ---------------- 存储往返 ----------------
console.log('\n=== 存储往返（内存 store 模拟 localStorage） ===');
{
  const store = memStore();
  const p = {};
  recordResult(p, 'castle', 6, 500, 3);
  saveProgress(store, p);
  const back = loadProgress(store);
  check('进度保存/读取一致', JSON.stringify(back) === JSON.stringify(p));
  saveAchievements(store, ['first_win']);
  check('成就保存/读取一致', JSON.stringify(loadAchievements(store)) === JSON.stringify(['first_win']));
  store.setItem(PROGRESS_KEY, '{bad json');
  store.setItem(ACHIEVE_KEY, 'not json');
  check('损坏数据回退为空对象/空数组', JSON.stringify(loadProgress(store)) === '{}' && loadAchievements(store).length === 0);
  const empty = memStore();
  check('空存储读取安全', Object.keys(loadProgress(empty)).length === 0 && loadAchievements(empty).length === 0);
}

console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
process.exit(failed ? 1 : 0);
