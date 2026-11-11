// 中英双语（核心界面）。语言存 settings.lang，默认跟随浏览器语言，可手动切换。
const DICT = {
  'app.title': { zh: '万象归形', en: 'Wanxiang Guixing' },
  'intro.sub': { zh: '把散落的碎片拼回完整模型 · Pico Neo3 WebXR', en: 'Rebuild shattered models piece by piece · Pico Neo3 WebXR' },
  'intro.grab': { zh: '扣动扳机抓住面前的碎片，握着走动、放近了会自动吸附', en: 'Pull the trigger to grab a piece; move it close to snap automatically' },
  'intro.release': { zh: '释放扳机放下碎片，没对上就留在原地', en: 'Release the trigger to drop it; it stays where you leave it' },
  'intro.both': { zh: '左右手柄都能抓，可以一次拿两块', en: 'Both controllers can grab — hold two pieces at once' },
  'intro.area': { zh: '碎片散在身前的斜坡上，虚影立在斜坡顶端', en: 'Pieces are scattered on the slope; the ghost stands at the top' },
  'intro.selfcheck': { zh: '🔍 设备自检', en: '🔍 Device Check' },
  'intro.settings': { zh: '⚙️ 手感设置', en: '⚙️ Settings' },
  'menu.title': { zh: '选择模型与难度', en: 'Select Model & Difficulty' },
  'menu.summary': { zh: '总进度 {done}/{total} 关 · 星星 {stars}/{maxStars} · 成就 {ach}/{achTotal}', en: 'Progress {done}/{total} · Stars {stars}/{maxStars} · Achievements {ach}/{achTotal}' },
  'menu.daily': { zh: '🎯 今日挑战 · {name} · {n} 块', en: '🎯 Daily Challenge · {name} · {n} pcs' },
  'menu.dailySub': { zh: '{date} · 每天自动更换', en: '{date} · Changes daily' },
  'menu.board': { zh: '🏆 排行榜 · 当前模型前三成绩', en: '🏆 Leaderboard · Top 3 for this model' },
  'menu.gallery': { zh: '🖼️ 模型图鉴 · 收集进度', en: '🖼️ Model Gallery · Collection' },
  'menu.duel': { zh: '👥 双人轮流 · 同头显对战', en: '👥 Two Players · Pass & Play' },
  'menu.pieces': { zh: '{n} 块', en: '{n} pcs' },
  'menu.assist': { zh: '磁吸辅助：{state}', en: 'Magnet Assist: {state}' },
  'menu.practice': { zh: '练习模式：{state}', en: 'Practice Mode: {state}' },
  'menu.random': { zh: '随机模式：{state}', en: 'Random Mode: {state}' },
  'menu.on': { zh: '开', en: 'On' },
  'menu.off': { zh: '关', en: 'Off' },
  'menu.achLabel': { zh: '成就 {n}/{total}', en: 'Achievements {n}/{total}' },
  'btn.start': { zh: '开始', en: 'Start' },
  'btn.hint': { zh: '提示', en: 'Hint' },
  'btn.palette': { zh: '配色', en: 'Palette' },
  'btn.music': { zh: '音乐', en: 'Music' },
  'btn.progress': { zh: '进度', en: 'Progress' },
  'btn.close': { zh: '关闭', en: 'Close' },
  'btn.export': { zh: '📤 导出存档', en: '📤 Export Save' },
  'btn.import': { zh: '📥 导入存档', en: '📥 Import Save' },
  'btn.diag': { zh: '🩺 复制诊断信息', en: '🩺 Copy Diagnostics' },
  'settings.title': { zh: '⚙️ 手感设置', en: '⚙️ Settings' },
  'settings.magnet': { zh: '磁吸强度', en: 'Magnet Strength' },
  'settings.haptic': { zh: '震动强度', en: 'Haptics' },
  'settings.menuDist': { zh: 'VR 菜单距离', en: 'VR Menu Distance' },
  'settings.menuScale': { zh: 'VR 菜单大小', en: 'VR Menu Size' },
  'settings.renderScale': { zh: '渲染比例', en: 'Render Scale' },
  'settings.stars': { zh: '星空背景', en: 'Starfield' },
  'settings.tableY': { zh: '桌面高度', en: 'Table Height' },
  'settings.musicVol': { zh: '音乐音量', en: 'Music Volume' },
  'settings.sfxVol': { zh: '音效音量', en: 'SFX Volume' },
  'settings.note': { zh: '磁吸/震动/菜单距离立即生效；渲染比例与星空影响画质；桌面高度适合坐姿玩家。', en: 'Magnet/haptics/menu distance apply immediately; render scale & starfield affect quality; table height suits seated play.' },
  'data.exportTitle': { zh: '📤 导出存档', en: '📤 Export Save' },
  'data.importTitle': { zh: '📥 导入存档', en: '📥 Import Save' },
  'data.hintExport': { zh: '保存或复制下方 JSON，可在其他设备导入。', en: 'Save or copy the JSON below to import on another device.' },
  'data.hintImport': { zh: '粘贴 JSON 或选择文件，然后点「导入存档」。', en: 'Paste JSON or choose a file, then click Import.' },
  'btn.download': { zh: '下载文件', en: 'Download' },
  'btn.copy': { zh: '复制内容', en: 'Copy' },
  'btn.pick': { zh: '选择文件…', en: 'Choose File…' },
  'btn.import': { zh: '导入存档', en: 'Import' },
  'gallery.cleared': { zh: '已通关 {done}/{total}', en: 'Cleared {done}/{total}' },
  'settings.lang': { zh: '语言', en: 'Language' },
  'settings.uiScale': { zh: '界面缩放', en: 'UI Scale' },
  'settings.menuSide': { zh: '菜单位置', en: 'Menu Side' },
  'tutorial.title': { zh: '🧩 上手 4 步', en: '🧩 Quick Start' },
  'tutorial.ok': { zh: '知道了，开始拼图', en: 'Got it — Start' },
  'win.title': { zh: '🎉 拼图完成！', en: '🎉 Puzzle Complete!' },
  'win.again': { zh: '再来一局', en: 'Play Again' },
  'win.poster': { zh: '🖼️ 保存海报', en: '🖼️ Save Poster' },
  'duel.title': { zh: '👥 双人轮流', en: '👥 Two Players' },
  'gallery.title': { zh: '🖼️ 模型图鉴', en: '🖼️ Model Gallery' },
  'board.title': { zh: '🏆 本地排行', en: '🏆 Local Leaderboard' },
  'HUD.hint': { zh: '扣扳机抓碎片 · 松手放下 · 靠近虚影自动吸附', en: 'Trigger to grab · Release to drop · Move close to snap' },
};

export const MODEL_EN = {
  rocket: 'Rocket', mushroom: 'Mushroom House', gemplanet: 'Gem Planet', castle: 'Dream Castle',
  penguin: 'Cute Penguin', gift: 'Gift Box', car: 'Mini Racer', xmas: 'Christmas Tree',
  rabbit: 'Cute Bunny', globe: 'Blue Earth', pumpkin: 'Jack-o-Lantern', turtle: 'Little Turtle',
  pig: 'Little Pig', heli: 'Helicopter', coffee: 'Coffee Cup', fish: 'Little Fish',
  cat: 'Little Cat', cactus: 'Cactus', frog: 'Little Frog', donut: 'Donut',
};

function detectLang() {
  try {
    const nav = (navigator.language || 'zh').toLowerCase();
    return nav.startsWith('zh') ? 'zh' : 'en';
  } catch (e) { return 'zh'; }
}

let lang = detectLang();
export function setLang(l) { lang = l === 'en' ? 'en' : 'zh'; }
export function getLang() { return lang; }
export function t(key, vars = {}) {
  const entry = DICT[key];
  let s = entry ? (entry[lang] || entry.zh) : key;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}
export function modelName(key, fallback) {
  if (lang !== 'en') return fallback;
  return MODEL_EN[key] || fallback;
}
export const PALETTE_EN = { classic: 'Classic', neon: 'Neon', warm: 'Warm Winter', mono: 'Cool Silver', festive: 'Festive', ocean: 'Ocean', contrast: 'High Contrast' };
export function paletteName(k, f) { return lang === 'en' ? (PALETTE_EN[k] || f) : f; }
export const THEME_EN = { night: 'Night Sky', snow: 'Snow Night', sunset: 'Sunset', dawn: 'Sakura', sea: 'Deep Sea', dusk: 'Dusk', nebula: 'Nebula' };
export function themeName(key, fallback) { return lang === 'en' ? (THEME_EN[key] || fallback) : fallback; }
export function optLabel(z) {
  if (lang !== 'en') return z;
  const m = { '关': 'Off', '弱': 'Low', '中': 'Mid', '强': 'High', '低': 'Low', '标准': 'Default', '高': 'High', '左': 'Left', '右': 'Right', '大': 'Large', '特大': 'XL', '小': 'Small', '中文': '中文', 'English': 'English' };
  return m[z] || z;
}
export const DIFFICULTY_EN = { 2: 'Easy', 3: 'Medium', 4: 'Hard', 6: 'Master', 8: 'Extreme' };
export function diffName(n, fallback) { return lang === 'en' ? (DIFFICULTY_EN[n] || fallback) : fallback; }
export const ACH_EN = {
  first_win: ['First Assembly', 'Complete any level'],
  all_easy: ['Easy Clear', 'Complete 2-piece mode for all 12 models'],
  collector: ['Model Collector', 'Clear every model at least once'],
  thinker: ['Thinker', 'Complete a 6-piece level without hints'],
  speedrun: ['Speed Runner', 'Finish a 6-piece level within 300 s'],
  all_master: ['Master Challenge', 'Complete 6-piece mode for all 12 models'],
  first_8: ['Extreme First', 'Complete any 8-piece level'],
  eight_master: ['Extreme Master', 'Complete 8-piece mode on 8 models'],
  star_50: ['Star Collector', 'Collect 50 stars'],
  eight_three: ['Extreme Trio', 'Get 3 stars on 8-piece mode for 3 models'],
  star_100: ['Star Hoarder', 'Collect 100 stars'],
  all_perfect_6: ['Master Perfection', '3-star every model in 6-piece mode'],
  perfectionist: ['Perfectionist', 'Get 12 three-star levels in one difficulty'],
};
export function achName(id, fallback) { return lang === 'en' ? ((ACH_EN[id] && ACH_EN[id][0]) || fallback) : fallback; }
export function achDesc(id, fallback) { return lang === 'en' ? ((ACH_EN[id] && ACH_EN[id][1]) || fallback) : fallback; }
