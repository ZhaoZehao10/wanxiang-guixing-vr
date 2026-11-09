// 设置与存档序列化（纯逻辑，无 DOM 依赖，可 Node 单测）
//
// - 设置：渲染比例 / 星空开关 / 桌面高度 / 音乐与音效音量
// - 存档导出/导入：进度 + 成就 + 设置 + 手感参数，格式带 app 标识与 schema 版本
// - 所有输入都做范围/类型清洗，损坏数据回退默认值，保证不崩溃

export const SETTINGS_KEY = 'wanxiang.settings';
export const EXPORT_SCHEMA = 1;

export const DEFAULT_SETTINGS = Object.freeze({
  renderScale: 1.0,   // 0.6 ~ 1.2
  stars: true,        // 星空开关
  tableY: 0,          // 桌面高度偏移（米），-0.2 ~ 0.2
  musicVol: 0.22,     // 0 ~ 1
  sfxVol: 1.0,        // 0 ~ 1
});

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function clampSettings(raw = {}) {
  const out = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return out;
  if (Number.isFinite(raw.renderScale)) out.renderScale = clamp(raw.renderScale, 0.6, 1.2);
  if (typeof raw.stars === 'boolean') out.stars = raw.stars;
  if (Number.isFinite(raw.tableY)) out.tableY = clamp(raw.tableY, -0.2, 0.2);
  if (Number.isFinite(raw.musicVol)) out.musicVol = clamp(raw.musicVol, 0, 1);
  if (Number.isFinite(raw.sfxVol)) out.sfxVol = clamp(raw.sfxVol, 0, 1);
  return out;
}

export function loadSettings(store = null) {
  try {
    if (!store) return { ...DEFAULT_SETTINGS };
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return clampSettings(JSON.parse(raw));
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(store, settings) {
  try {
    if (!store) return false;
    store.setItem(SETTINGS_KEY, JSON.stringify(clampSettings(settings)));
    return true;
  } catch (e) {
    return false;
  }
}

// 进度条目清洗：只保留 "modelKey|n" 形式的键，数值范围受限，Top3 升序去重
export function sanitizeProgress(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, v] of Object.entries(raw)) {
    if (!/^[a-z][a-z0-9]*\|\d+$/.test(key)) continue;
    if (!v || typeof v !== 'object') continue;
    const stars = Number.isFinite(v.stars) ? clamp(Math.round(v.stars), 0, 3) : 0;
    const bestTime = Number.isFinite(v.bestTime) && v.bestTime >= 0 ? Math.round(v.bestTime) : 0;
    const plays = Number.isFinite(v.plays) && v.plays >= 0 ? Math.round(v.plays) : 0;
    const hints = Number.isFinite(v.hints) && v.hints >= 0 ? Math.round(v.hints) : 0;
    let top = Array.isArray(v.top)
      ? v.top.filter((t) => Number.isFinite(t) && t >= 0).map((t) => Math.round(t))
      : [];
    top = [...new Set(top)].sort((a, b) => a - b).slice(0, 3);
    out[key] = { stars, bestTime, plays, hints, top };
  }
  return out;
}

export function buildExport({ progress = {}, achievements = [], settings = {}, tuning = {} } = {}, meta = {}) {
  return {
    app: 'wanxiang-guixing',
    schema: EXPORT_SCHEMA,
    exportedAt: new Date().toISOString(),
    ...meta,
    progress: sanitizeProgress(progress),
    achievements: Array.isArray(achievements) ? achievements.filter((x) => typeof x === 'string') : [],
    settings: clampSettings(settings),
    tuning: (tuning && typeof tuning === 'object') ? { ...tuning } : {},
  };
}

export function parseExport(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: '不是有效的 JSON 文件' };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: '存档格式错误' };
  if (data.app !== 'wanxiang-guixing') return { ok: false, error: '不是「万象归形」的存档文件' };
  if (!Number.isFinite(data.schema) || data.schema > EXPORT_SCHEMA) {
    return { ok: false, error: '存档版本过新，请升级游戏后再试' };
  }
  return {
    ok: true,
    data: {
      progress: sanitizeProgress(data.progress),
      achievements: Array.isArray(data.achievements) ? data.achievements.filter((x) => typeof x === 'string') : [],
      settings: clampSettings(data.settings),
      tuning: (data.tuning && typeof data.tuning === 'object') ? data.tuning : {},
    },
  };
}

// 导入采用"覆盖同关卡"策略：保留本机已有、导入文件里的同关卡覆盖
export function mergeProgress(current, imported) {
  return { ...(current || {}), ...sanitizeProgress(imported) };
}
