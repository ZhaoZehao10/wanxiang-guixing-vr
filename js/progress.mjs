// 进度、星级与成就 — 纯逻辑模块（不依赖 DOM，可直接单测）
//
// 设计要点：
//   - 进度/成就都存 localStorage；读写在调用处注入 store（测试可传内存实现）
//   - 星级只与用时和难度有关；成就在每次通关后增量评估
//   - 关卡键 = `${modelKey}|${块数}`，共 10 模型 × 4 难度 = 40 关
import { MODELS } from './models.mjs';

export const DIFFICULTY = [2, 3, 4, 6];
export const DIFFICULTY_NAME = { 2: '入门', 3: '进阶', 4: '挑战', 6: '大师' };
export const MODEL_KEYS = Object.keys(MODELS);

export const PROGRESS_KEY = 'pico3d.progress.v1';
export const ACHIEVE_KEY = 'pico3d.achievements.v1';

export function levelKey(modelKey, n) { return modelKey + '|' + n; }

// 三星线：2 块 90s / 3 块 160s / 4 块 260s / 6 块 380s；超过 1.6 倍降为 1 星
export function parTime(n) { return ({ 2: 90, 3: 160, 4: 260, 6: 380 })[n] || 120; }
export function starsFor(secs, n) {
  const par = parTime(n);
  if (secs <= par) return 3;
  if (secs <= par * 1.6) return 2;
  return 1;
}

export function loadProgress(store) {
  try { return JSON.parse(store.getItem(PROGRESS_KEY) || '{}'); } catch (e) { return {}; }
}
export function saveProgress(store, p) {
  try { store.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch (e) { /* 隐私模式忽略 */ }
}
export function loadAchievements(store) {
  try { return JSON.parse(store.getItem(ACHIEVE_KEY) || '[]'); } catch (e) { return []; }
}
export function saveAchievements(store, list) {
  try { store.setItem(ACHIEVE_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
}

// 写入一次通关结果（原地更新 progress 对象），返回本次星级与新记录
export function recordResult(progress, modelKey, n, secs, hints) {
  const k = levelKey(modelKey, n);
  const cur = progress[k] || { bestTime: 0, stars: 0, plays: 0, hints: 0 };
  const stars = starsFor(secs, n);
  cur.plays = (cur.plays || 0) + 1;
  cur.stars = Math.max(cur.stars || 0, stars);
  if (!cur.bestTime || secs < cur.bestTime) cur.bestTime = secs;
  cur.hints = (cur.hints || 0) + (hints || 0);
  progress[k] = cur;
  return { rec: cur, stars };
}

// ---------------- 成就 ----------------
// test(progress) → 是否达成；modelKeys 用于"覆盖全部模型"类成就
export const ACHIEVEMENTS = [
  {
    id: 'first_win', name: '初次拼合', desc: '完成任意一关',
    test: (p) => Object.values(p).some((r) => r.stars > 0),
  },
  {
    id: 'all_easy', name: '入门全通', desc: '全部 10 个模型完成 2 块难度',
    test: (p) => MODEL_KEYS.every((mk) => (p[levelKey(mk, 2)] || {}).stars > 0),
  },
  {
    id: 'collector', name: '模型收藏家', desc: '10 个模型各通关至少一次',
    test: (p) => MODEL_KEYS.every((mk) => DIFFICULTY.some((n) => (p[levelKey(mk, n)] || {}).stars > 0)),
  },
  {
    id: 'thinker', name: '独立思考', desc: '全程不用提示完成任意 6 块关卡',
    test: (p) => Object.entries(p).some(([k, r]) => k.endsWith('|6') && r.stars > 0 && (r.hints || 0) === 0),
  },
  {
    id: 'speedrun', name: '极速拼手', desc: '6 块关卡 300 秒内完成',
    test: (p) => Object.entries(p).some(([k, r]) => k.endsWith('|6') && r.bestTime > 0 && r.bestTime <= 300),
  },
  {
    id: 'all_master', name: '大师挑战', desc: '全部 10 个模型完成 6 块难度',
    test: (p) => MODEL_KEYS.every((mk) => (p[levelKey(mk, 6)] || {}).stars > 0),
  },
  {
    id: 'perfectionist', name: '完美主义', desc: '同一难度集齐 10 个三星',
    test: (p) => DIFFICULTY.some((n) => MODEL_KEYS.every((mk) => (p[levelKey(mk, n)] || {}).stars === 3)),
  },
];

// 返回本次新解锁的成就 id 列表（不改动传入数组）
export function evaluateAchievements(progress, unlockedIds) {
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (unlockedIds.includes(a.id)) continue;
    try {
      if (a.test(progress)) newly.push(a.id);
    } catch (e) { /* 单个成就判定异常不影响其他 */ }
  }
  return newly;
}

// 统计概览（菜单展示用）
export function summarize(progress) {
  let done = 0, stars = 0, bestTotal = 0;
  for (const mk of MODEL_KEYS) {
    for (const n of DIFFICULTY) {
      const r = progress[levelKey(mk, n)];
      if (r && r.stars > 0) { done++; stars += r.stars; bestTotal += r.bestTime || 0; }
    }
  }
  return { done, total: MODEL_KEYS.length * DIFFICULTY.length, stars, maxStars: MODEL_KEYS.length * DIFFICULTY.length * 3, bestTotal };
}
