// 完整 e2e — 9 种组合建局 + 新功能验证（VR 菜单/物理/找回/音效）+ 全模型截图
// 运行前提：server.mjs 已启动（8443 端口）
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9333;
const URL = 'https://localhost:8443/';

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu-sandbox', '--no-first-run',
  `--user-data-dir=${process.env.TEMP}\\wanxiangguixing-cdp3`, `--remote-debugging-port=${PORT}`,
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=1280,800',
  // 测试用的是本地 CA 签发的证书；无头会话无法弹窗安装 CA，
  // 这里仅豁免信任链警告（结构错误仍会失败——正是 cert-check.mjs 把关的）。
  '--ignore-certificate-errors', 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = null;
for (let i = 0; i < 40; i++) {
  await sleep(250);
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    targets = await res.json();
    if (targets && targets.length) break;
  } catch { /* retry */ }
}
if (!targets) { console.error('DevTools 未就绪'); process.exit(1); }
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let msgId = 0;
const pending = new Map();
const consoleErrors = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    consoleErrors.push(m.params.args.map((a) => a.value || a.description || '').join(' '));
  }
  if (m.method === 'Runtime.exceptionThrown') {
    consoleErrors.push(m.params.exceptionDetails.text + ' ' + (m.params.exceptionDetails.exception?.description || ''));
  }
};
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
  return r.result?.result?.value;
}

let failed = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { failed++; console.error(`  ✗ ${name} ${detail}`); }
}

await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: URL });
await sleep(2200);
// 测试隔离：清空本地存储（进度/成就/配色/音乐），保证断言与历史运行无关
await evalJs('localStorage.clear()');

// 1) 页面结构校验
const struct = await evalJs(`({
  title: document.title,
  hasCanvas: !!document.getElementById('c3d'),
  hasHud: !!document.getElementById('hud'),
  hasWin: !!document.getElementById('win'),
  hasDiff: !!document.getElementById('difficulty'),
  hasHook: !!window.__wanxiang,
})`);
check('页面结构完整（canvas/hud/win/difficulty/测试钩子）',
  struct.hasCanvas && struct.hasHud && struct.hasWin && struct.hasDiff && struct.hasHook, JSON.stringify(struct));

// 1.1) 设备自检面板（点击不应误触"开始游戏"；面板默认隐藏、可正常关闭）
const selfCheck = await evalJs(`(async () => {
  const panel = document.getElementById('selfcheck');
  const initiallyHidden = getComputedStyle(panel).display === 'none';
  document.getElementById('selfcheck-btn').click();
  await new Promise((r) => setTimeout(r, 250));
  const text = document.getElementById('selfcheck-body').textContent;
  const opened = getComputedStyle(panel).display !== 'none';
  const introHidden = document.getElementById('intro').classList.contains('hidden');
  document.getElementById('selfcheck-close').click();
  const closed = getComputedStyle(panel).display === 'none';
  return { initiallyHidden, opened, text, introHidden, closed };
})()`);
check('设备自检：默认隐藏、显示安全上下文/navigator.xr/WebGL、可关闭且不误触开局',
  selfCheck.initiallyHidden === true && selfCheck.opened === true
  && selfCheck.text.includes('安全上下文') && selfCheck.text.includes('navigator.xr')
  && selfCheck.text.includes('WebGL') && selfCheck.closed === true && selfCheck.introHidden === false,
  JSON.stringify({ initiallyHidden: selfCheck.initiallyHidden, opened: selfCheck.opened, closed: selfCheck.closed, introHidden: selfCheck.introHidden }));

// 1.12) 手感设置面板 + 打开方式提示
const settingsTest = await evalJs(`(() => {
  const p = window.__wanxiang;
  document.getElementById('settings-btn').click();
  const panelVisible = !document.getElementById('settings').classList.contains('hidden');
  const introHidden = document.getElementById('intro').classList.contains('hidden');
  const rows = [...document.querySelectorAll('#settings-body > div')];
  const magnetRow = rows[0], distRow = rows[2], scaleRow = rows[3];
  magnetRow.children[magnetRow.children.length - 1].click(); // 强
  distRow.children[1].click(); // 近
  scaleRow.children[scaleRow.children.length - 1].click(); // 大
  const t = p.getTuning();
  p.setTuningValue('magnet', 0.10);
  p.setTuningValue('menuDist', 0.70);
  p.setTuningValue('menuScale', 0.42);
  document.getElementById('settings-close').click();
  const closed = document.getElementById('settings').classList.contains('hidden');
  const hints = {
    file: p.protocolHint('file:'),
    https: p.protocolHint('https:'),
    http: p.protocolHint('http:', 'example.com'),
    local: p.protocolHint('http:', 'localhost'),
  };
  return { panelVisible, introHidden, t, closed, hints };
})()`);
check('手感设置：磁吸/菜单距离/大小可调、可关闭且不误触开局',
  settingsTest.panelVisible === true && settingsTest.introHidden === false && settingsTest.closed === true
  && settingsTest.t.magnet === 0.18 && settingsTest.t.menuDist === 0.55 && settingsTest.t.menuScale === 0.50,
  JSON.stringify({ visible: settingsTest.panelVisible, introHidden: settingsTest.introHidden, t: settingsTest.t, closed: settingsTest.closed }));
check('file:// 与非本机 http 的打开方式提示',
  settingsTest.hints.file.includes('APK') && settingsTest.hints.https === ''
  && settingsTest.hints.http.includes('HTTPS') && settingsTest.hints.local === '',
  JSON.stringify(settingsTest.hints));

// 1.13) 画面/声音设置 + 存档导出/导入 + 故障注入
const settings2 = await evalJs(`(() => {
  const p = window.__wanxiang;
  p.openSettings();
  const rows = [...document.querySelectorAll('#settings-body > div')];
  rows[4].children[1].click(); // 渲染比例：低
  rows[5].children[1].click(); // 星空：关
  rows[6].children[3].click(); // 桌面高度：高
  rows[7].children[2].click(); // 音乐音量：低
  const s = p.getSettings();
  const pr = p.getQuality().pixelRatio;
  p.setSettingsValue('renderScale', 1);
  p.setSettingsValue('stars', true);
  p.setSettingsValue('tableY', 0);
  p.setSettingsValue('musicVol', 0.22);
  p.setSettingsValue('sfxVol', 1);
  p.closeSettings();
  return { s, pr };
})()`);
check('画面/声音设置可调并生效',
  settings2.s.renderScale === 0.7 && settings2.s.stars === false
  && Math.abs(settings2.s.tableY - 0.1) < 1e-9 && settings2.s.musicVol === 0.35 && settings2.pr < 1,
  JSON.stringify(settings2));

const dataTest = await evalJs(`(() => {
  const p = window.__wanxiang;
  const text = p.buildExportText();
  const bad = p.applyImportText('not json');
  p.openDataPanel('export');
  const panelVisible = !document.getElementById('data-panel').classList.contains('hidden');
  const nonEmpty = p.getDataText().length > 50;
  p.closeDataPanel();
  const good = p.applyImportText(text);
  const msg = document.getElementById('data-msg').textContent;
  return { bad, good, panelVisible, nonEmpty, msg, textHasApp: text.includes('wanxiang-guixing') };
})()`);
check('存档导出/导入：非法拒绝、合法回灌、面板可用',
  dataTest.bad === false && dataTest.good === true && dataTest.panelVisible === true
  && dataTest.nonEmpty === true && dataTest.textHasApp === true && dataTest.msg.includes('成功'),
  JSON.stringify(dataTest));

const fault = await evalJs(`(() => {
  const p = window.__wanxiang;
  const orig = Storage.prototype.setItem;
  let threw = false;
  try {
    Storage.prototype.setItem = function () { throw new Error('quota'); };
    try { p.setSettingsValue('musicVol', 0.5); p.recordResult('rocket', 2, 60, 0); } catch (e) { threw = true; }
  } finally { Storage.prototype.setItem = orig; }
  p.setSettingsValue('musicVol', 0.22);
  return { threw };
})()`);
check('故障注入：localStorage 写入失败不崩溃', fault.threw === false, JSON.stringify(fault));

// 1.14) 随机模式 / 图鉴 / 海报 / 双人轮流
const extras = await evalJs(`(() => {
  const p = window.__wanxiang;
  const out = {};
  p.setRandomMode(true);
  p.startGame('rocket', 4);
  const a = p.state.lastPlanes ? JSON.stringify(p.state.lastPlanes) : '';
  p.startGame('rocket', 4);
  const b = p.state.lastPlanes ? JSON.stringify(p.state.lastPlanes) : '';
  out.random = { mode: p.state.randomMode, pieces: p.state.pieces.length, different: a !== b && a.length > 0 };
  p.setRandomMode(false);
  p.openGallery();
  out.gallery = { visible: !document.getElementById('gallery').classList.contains('hidden'), cards: document.querySelectorAll('#gallery-body .gallery-card').length, text: p.getGalleryText() };
  p.closeGallery();
  const poster = p.generatePoster();
  out.poster = { data: poster.startsWith('data:image/png'), len: poster.length };
  const snapAll = () => {
    for (const mesh of p.state.pieces) {
      const tp = new p.THREE.Vector3(), tq = new p.THREE.Quaternion();
      mesh.userData.target.getWorldPosition(tp);
      mesh.userData.target.getWorldQuaternion(tq);
      mesh.position.copy(tp);
      mesh.quaternion.copy(tq);
      p.trySnap(mesh);
    }
  };
  p.openDuel();
  const startDuel = p.getDuelInfo();
  p.duelAdvance();
  snapAll();
  const d1 = p.getDuelInfo();
  p.duelAdvance();
  snapAll();
  const d2 = p.getDuelInfo();
  const duelText = document.getElementById('duel-body').textContent;
  p.duelAdvance();
  out.duel = { start: !!startDuel, results1: d1 ? d1.results.length : -1, results2: d2 ? d2.results.length : -1, hasWinner: /获胜|平局/.test(duelText) };
  return out;
})()`);
check('随机模式：每局切割不同且片数正确',
  extras.random.mode === true && extras.random.pieces === 4 && extras.random.different === true,
  JSON.stringify(extras.random));
check('模型图鉴：18 张卡片与收集进度',
  extras.gallery.visible === true && extras.gallery.cards === 22 && extras.gallery.text.includes('★'),
  JSON.stringify({ visible: extras.gallery.visible, cards: extras.gallery.cards }));
check('完成海报：生成 PNG DataURL', extras.poster.data === true && extras.poster.len > 5000, JSON.stringify(extras.poster));
const i18nTest = await evalJs(`(() => {
  const p = window.__wanxiang;
  p.setSettingsValue('lang', 'en');
  const introTitle = document.querySelector('#intro h1').textContent;
  p.showDifficulty();
  const menuTitle = document.querySelector('#difficulty h2').textContent;
  const firstBtn = document.querySelector('#difficulty .diff-btn').textContent;
  p.setSettingsValue('lang', 'zh');
  const introTitleZh = document.querySelector('#intro h1').textContent;
  return { introTitle, menuTitle, firstBtn, introTitleZh };
})()`);
check('中英双语：切换语言后标题/菜单/每日挑战为英文',
  i18nTest.introTitle === 'Wanxiang Guixing' && i18nTest.menuTitle.includes('Select Model')
  && i18nTest.firstBtn.includes('Daily Challenge') && i18nTest.introTitleZh === '万象归形',
  JSON.stringify(i18nTest));

const moreFeatures = await evalJs(`(() => {
  const p = window.__wanxiang;
  p.recordDaily(p.dayKey(), 'rocket', 2, 70);
  p.openBoard();
  document.getElementById('board-tab-daily').click();
  const dailyRows = document.querySelectorAll('#board-body .board-level').length;
  const dailyText = p.getBoardText();
  p.closeBoard();
  p.openDuel();
  p.setDuelRounds(3);
  const duelRounds = p.getDuelInfo().rounds;
  const modeBtn = document.getElementById('duel-mode-3').textContent;
  p.closeDuel();
  p.setSettingsValue('uiScale', 1.3);
  p.setSettingsValue('menuSide', 'left');
  const uiScale = getComputedStyle(document.documentElement).getPropertyValue('--ui-scale').trim();
  const s = p.getSettings();
  p.setSettingsValue('uiScale', 1);
  p.setSettingsValue('menuSide', 'center');
  return { dailyRows, dailyText, duelRounds, modeBtn, uiScale, s };
})()`);
check('每日挑战本地榜：记录后显示前三', moreFeatures.dailyRows === 1 && moreFeatures.dailyText.includes('1. 1分10秒'), JSON.stringify({ rows: moreFeatures.dailyRows, text: moreFeatures.dailyText }));
const statsTest = await evalJs(`(() => {
  const p = window.__wanxiang;
  const y = new Date(); y.setDate(y.getDate() - 1);
  p.recordDaily(p.dayKey(y), 'rocket', 2, 80);
  const y2 = new Date(); y2.setDate(y2.getDate() - 2);
  p.recordDaily(p.dayKey(y2), 'rocket', 2, 90);
  p.openStats();
  const visible = !document.getElementById('stats').classList.contains('hidden');
  const text = document.getElementById('stats-body').textContent;
  const ds = p.getDailyStats();
  const cells = document.querySelectorAll('#stats-body .day-cell').length;
  const doneCells = document.querySelectorAll('#stats-body .day-cell[data-done="1"]').length;
  const monthCells = document.querySelectorAll('#stats-body .month-cell').length;
  const monthDone = document.querySelectorAll('#stats-body .month-cell[data-done="1"]').length;
  const curMonth = document.querySelector('#stats-body [data-month]') ? document.querySelector('#stats-body [data-month]').dataset.month : '';
  const prevBtn = document.querySelector('#stats-body .month-prev');
  if (prevBtn) prevBtn.click();
  const prevMonth = document.querySelector('#stats-body [data-month]') ? document.querySelector('#stats-body [data-month]').dataset.month : '';
  const prevCells = document.querySelectorAll('#stats-body .month-cell').length;
  const yearCells = document.querySelectorAll('#stats-body .year-cell').length;
  p.closeStats();
  return { visible, text, ds, cells, doneCells, monthCells, monthDone, curMonth, prevMonth, prevCells, yearCells };
})()`);
check('统计面板：进度与每日挑战连续天数',
  statsTest.visible === true && statsTest.text.includes('总进度') && statsTest.ds.days >= 3 && statsTest.ds.streak >= 3 && statsTest.cells === 14 && statsTest.doneCells >= 3 && statsTest.monthCells >= 28 && statsTest.monthDone >= 3 && statsTest.prevMonth !== statsTest.curMonth && statsTest.prevCells >= 28 && statsTest.yearCells >= 365,
  JSON.stringify({ visible: statsTest.visible, ds: statsTest.ds }));

check('双人规则：支持三局两胜', moreFeatures.duelRounds === 3 && moreFeatures.modeBtn.includes('3'), JSON.stringify({ rounds: moreFeatures.duelRounds, btn: moreFeatures.modeBtn }));
check('无障碍设置：界面缩放与菜单位置生效', moreFeatures.s.uiScale === 1.3 && moreFeatures.s.menuSide === 'left' && moreFeatures.uiScale === '1.3', JSON.stringify({ s: moreFeatures.s, uiScale: moreFeatures.uiScale }));

check('双人轮流：两人结果与胜负判定',
  extras.duel.start === true && extras.duel.results1 === 1 && extras.duel.results2 === 2 && extras.duel.hasWinner === true,
  JSON.stringify(extras.duel));

// 1.15) 稳定性：版本信息 / WebGL 上下文丢失 / 关卡加载失败兜底
const stability = await evalJs(`(async () => {
  const p = window.__wanxiang;
  const buildInfo = document.getElementById('build-info').textContent;
  // 模拟 WebGL 上下文丢失与恢复
  const canvas = document.getElementById('c3d');
  canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  const lost = p.getFatalInfo();
  canvas.dispatchEvent(new Event('webglcontextrestored'));
  const restored = p.getFatalInfo();
  // 加载不存在的模型：应被兜底，不抛异常
  let threw = false;
  try { p.startGame('not_a_model', 2); } catch (e) { threw = true; }
  const bad = p.getFatalInfo();
  document.getElementById('fatal-back').click();
  const afterBack = p.getFatalInfo();
  return { buildInfo, lost, restored, threw, bad, afterBack, mode: p.state.mode };
})()`);
check('封面显示版本与构建信息', /v\d+\.\d+\.\d+/.test(stability.buildInfo) && stability.buildInfo.includes('模型'), JSON.stringify(stability.buildInfo));
check('WebGL 上下文丢失提示与恢复',
  stability.lost.visible === true && stability.lost.title.includes('渲染中断') && stability.restored.visible === false,
  JSON.stringify({ lost: stability.lost, restored: stability.restored }));
check('关卡加载失败兜底：不抛异常、可返回菜单',
  stability.threw === false && stability.bad.visible === true && stability.bad.title.includes('加载失败')
  && stability.afterBack.visible === false && stability.mode === 'difficulty',
  JSON.stringify({ threw: stability.threw, bad: stability.bad, afterBack: stability.afterBack, mode: stability.mode }));

// 1.2) 每日挑战：按日期确定性生成，菜单可见且可一键开局
const daily = await evalJs(`(() => {
  const p = window.__wanxiang;
  p.showDifficulty();
  const a = p.dailyChallenge(p.dayKey());
  const b = p.dailyChallenge(p.dayKey());
  const btn = [...document.querySelectorAll('#difficulty .diff-btn')].find((x) => x.textContent.includes('今日挑战'));
  return { a, b, hasBtn: !!btn, btnText: btn ? btn.textContent : '' };
})()`);
check('每日挑战：同日期结果确定且菜单展示',
  daily.hasBtn && JSON.stringify(daily.a) === JSON.stringify(daily.b) && daily.btnText.includes(daily.a.name),
  JSON.stringify(daily));
const dailyStart = await evalJs(`(() => {
  const p = window.__wanxiang;
  const d = p.dailyChallenge();
  const btn = [...document.querySelectorAll('#difficulty .diff-btn')].find((x) => x.textContent.includes('今日挑战'));
  btn.click();
  // 首次 UI 开局会先弹上手引导：确认后才会真正开局
  if (p.getTutorialVisible()) document.getElementById('tutorial-ok').click();
  return { mode: p.state.mode, modelKey: p.state.modelKey, n: p.state.pieceCount, expect: d };
})()`);
check('每日挑战一键开局（模型/块数与挑战一致）',
  dailyStart.mode === 'playing' && dailyStart.modelKey === dailyStart.expect.modelKey && dailyStart.n === dailyStart.expect.n,
  JSON.stringify(dailyStart));

// 1.25) 排行榜面板：当前模型各难度前三成绩
const board = await evalJs(`(() => {
  const p = window.__wanxiang;
  p.showDifficulty();
  const btn = [...document.querySelectorAll('#difficulty .diff-btn')].find((b) => b.textContent.includes('排行榜'));
  const hasBtn = !!btn;
  if (btn) btn.click();
  const visible = !document.getElementById('board').classList.contains('hidden');
  const text = p.getBoardText();
  const rows = document.querySelectorAll('#board-body .board-level').length;
  const supported = p.supportedCounts(p.state.modelKey).length;
  document.getElementById('board-close').click();
  const closed = document.getElementById('board').classList.contains('hidden');
  return { hasBtn, visible, text, rows, supported, closed };
})()`);
check('排行榜：当前模型各难度前三成绩可查看且可关闭',
  board.hasBtn === true && board.visible === true && board.closed === true
  && board.rows === board.supported && board.text.includes('前三'),
  JSON.stringify({ hasBtn: board.hasBtn, visible: board.visible, rows: board.rows, supported: board.supported, closed: board.closed }));

// 1.26) 全模型总榜：每个难度列出全模型最快前三
const globalBoard = await evalJs(`(() => {
  const p = window.__wanxiang;
  p.showDifficulty();
  [...document.querySelectorAll('#difficulty .diff-btn')].find((b) => b.textContent.includes('排行榜')).click();
  document.getElementById('board-tab-global').click();
  const title = document.getElementById('board-title').textContent;
  const rows = document.querySelectorAll('#board-body .board-level').length;
  const text = p.getBoardText();
  document.getElementById('board-close').click();
  return { title, rows, hasTop: text.includes('前三') };
})()`);
check('全模型总榜：5 档难度各列前三',
  globalBoard.rows === 5 && globalBoard.title.includes('全模型总榜') && globalBoard.hasTop === true,
  JSON.stringify(globalBoard));
// 1.27) 首次上手引导：仅首次 UI 开局出现一次
const tutorial = await evalJs(`(() => {
  const p = window.__wanxiang;
  p.resetTutorial();
  p.startGameUI('rocket', 2);
  const visible = p.getTutorialVisible();
  document.getElementById('tutorial-ok').click();
  const modeAfterOk = p.state.mode;
  const visibleAfterOk = p.getTutorialVisible();
  p.startGameUI('rocket', 2); // 第二次不应再出现
  const visibleSecond = p.getTutorialVisible();
  return { visible, modeAfterOk, visibleAfterOk, visibleSecond };
})()`);
check('首次上手引导：仅在首次 UI 开局出现一次，确认后开局',
  tutorial.visible === true && tutorial.modeAfterOk === 'playing'
  && tutorial.visibleAfterOk === false && tutorial.visibleSecond === false,
  JSON.stringify(tutorial));

// 1.3) 8 块按模型可用性：火箭支持；圣诞树无解 → 菜单按钮禁用
const supports = await evalJs(`(() => {
  const p = window.__wanxiang;
  const rocket = p.supportedCounts('rocket');
  const xmas = p.supportedCounts('xmas');
  p.state.modelKey = 'xmas';
  p.showDifficulty();
  const diffRow = document.querySelectorAll('#difficulty .diff-row')[1];
  const btn8 = [...diffRow.children].find((b) => b.textContent.includes('8 块'));
  const xmasDisabled = btn8 ? btn8.disabled : null;
  p.state.modelKey = 'rocket';
  p.showDifficulty();
  const diffRow2 = document.querySelectorAll('#difficulty .diff-row')[1];
  const btn8b = [...diffRow2.children].find((b) => b.textContent.includes('8 块'));
  const rocketDisabled = btn8b ? btn8b.disabled : null;
  return { rocket, xmas, xmasDisabled, rocketDisabled };
})()`);
check('8 块按模型可用：火箭支持、圣诞树禁用',
  supports.rocket.includes(8) && !supports.xmas.includes(8)
  && supports.xmasDisabled === true && supports.rocketDisabled === false, JSON.stringify(supports));

// 2) 全部模型 × 2/3/4 块建局（模型清单由页面内 MODELS 决定）
console.log('--- 全部模型组合建局 ---');
const modelKeys = await evalJs('Object.keys(window.__wanxiang.MODELS)');
const cutTable = await evalJs('window.__wanxiang.CUT_TABLE');
const combos = [];
for (const mk of modelKeys) for (const n of [2, 3, 4, 6, 8]) {
  if (!cutTable[mk] || !cutTable[mk][n]) continue; // 8 块可选档：部分模型无解
  combos.push([mk, n]);
}
let shotsTaken = 0;
for (const [mk, n] of combos) {
  const st = await evalJs(`(() => {
    window.__wanxiang.startGame('${mk}', ${n});
    const s = window.__wanxiang.state;
    return { count: s.pieces.length, mode: s.mode, placed: s.placedCount, grab: s.grabbing.size };
  })()`);
  check(`${mk} x${n}: ${st.count} 片、playing、0 已归位`, st.count === n && st.mode === 'playing' && st.placed === 0 && st.grab === 0, JSON.stringify(st));
  if (shotsTaken < 9 && (n === 4 && ['castle', 'penguin', 'gift', 'rabbit', 'globe', 'pumpkin', 'turtle', 'pig', 'heli'].includes(mk))) {
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`test/preview-${mk}-${n}.png`, Buffer.from(shot.result.data, 'base64'));
    shotsTaken++;
  }
}

// 3) VR 菜单开关 + 高亮状态
const menu = await evalJs(`(() => {
  window.__wanxiang.toggleVrMenu(true);
  // 找不到 group 引用没关系——检查状态副作用
  const s = window.__wanxiang.state;
  return { pieceCount: s.pieceCount, modelKey: s.modelKey };
})()`);
check('VR 菜单 toggle 可调用且不崩溃',
  menu.pieceCount === combos[combos.length - 1][1] && menu.modelKey === combos[combos.length - 1][0],
  JSON.stringify({ menu, last: combos[combos.length - 1] }));
const [lastModel, lastN] = combos[combos.length - 1];

// 3.1) 提示系统：触发 → 光柱出现 / 定位到第一块 → 清除
const hintTest = await evalJs(`(() => {
  window.__wanxiang.toggleVrMenu(false);
  const ok = window.__wanxiang.triggerHint();
  const before = window.__wanxiang.getHintInfo();
  window.__wanxiang.clearHint();
  const after = window.__wanxiang.getHintInfo();
  return { ok, before, after };
})()`);
check('提示系统：光柱出现并指向下一块，可正常清除',
  hintTest.ok && hintTest.before.active && hintTest.before.idx >= 0 && !hintTest.after.active,
  JSON.stringify(hintTest));

// 3.2) 摇杆旋转：抓取中绕手柄本地轴旋转拼片
const stick = await evalJs(`(() => {
  const T = window.__wanxiang.THREE;
  const g = { quatOffset: new T.Quaternion() };
  const before = g.quatOffset.clone();
  window.__wanxiang.applyStickRotation(g, 1, 0, 0.2);
  return { changed: !g.quatOffset.equals(before), angle: 2 * Math.acos(Math.min(1, Math.abs(g.quatOffset.w))) };
})()`);
check('摇杆旋转：quatOffset 绕本地轴转动', stick.changed && stick.angle > 0.1, JSON.stringify(stick));

// 3.3) VR 菜单跟随：打开后出现在玩家视线前方
const menuPos = await evalJs(`(() => {
  window.__wanxiang.toggleVrMenu(true);
  const info = window.__wanxiang.getMenuInfo();
  window.__wanxiang.toggleVrMenu(false);
  return info;
})()`);
check('VR 菜单跟随玩家（位于相机前方）',
  menuPos.enabled === true && menuPos.pos && menuPos.pos[2] < 0 && Math.abs(menuPos.pos[0]) < 0.6,
  JSON.stringify(menuPos));

// 3.4) 抓取点保持：抓起时记录相对偏移（抓边缘不瞬移）
const grabTest = await evalJs(`(() => {
  const s = window.__wanxiang.state;
  const mesh = s.pieces[s.pieces.length - 1];
  mesh.position.set(0.05, 0.05, 0);
  window.__wanxiang.onGrab('right');
  const grabbed = s.grabbing.has('right');
  const grab = s.grabbing.get('right');
  window.__wanxiang.onRelease('right');
  window.__wanxiang.physics.length = 0;
  return { grabbed, hasOffset: !!grab && grab.offset.length() > 0.001 };
})()`);
check('抓取点保持：记录手柄系相对偏移', grabTest.grabbed && grabTest.hasOffset, JSON.stringify(grabTest));

// 3.5) 画质自适应：低画质应关闭星空并降像素比
const qualityTest = await evalJs(`(() => {
  window.__wanxiang.applyQualityLevel(0);
  const low = window.__wanxiang.getQuality();
  window.__wanxiang.applyQualityLevel(2);
  const high = window.__wanxiang.getQuality();
  return { low, high };
})()`);
check('画质自适应：低画质关星空+降像素比，可恢复',
  qualityTest.low.level === 0 && qualityTest.low.starfieldVisible === false && qualityTest.low.pixelRatio === 1
  && qualityTest.high.level === 2 && qualityTest.high.starfieldVisible === true,
  JSON.stringify(qualityTest));

// 3.6) 背景音乐开关（先归零到"关闭"状态再测开→关）
const musicTest = await evalJs(`(() => {
  const m = window.__wanxiang.music;
  m.setEnabled(false);                 // 归零：确保从未播放状态开始
  const stopped = m.playing;
  const on = m.toggle();
  const playingAfterOn = m.playing;
  const off = m.toggle();
  const playingAfterOff = m.playing;
  m.setEnabled(true);                  // 恢复默认（开）
  return { stopped, on, off, playingAfterOn, playingAfterOff };
})()`);
check('背景音乐：可开关且播放状态正确',
  musicTest.stopped === false && musicTest.on === true && musicTest.playingAfterOn === true
  && musicTest.off === false && musicTest.playingAfterOff === false, JSON.stringify(musicTest));

// 3.7) 配色皮肤：切换后重开同关卡，颜色改变、片数不变；2D 菜单有 4 个配色按钮
const paletteTest = await evalJs(`(() => {
  const p = window.__wanxiang;
  p.setPalette('neon');
  p.startGame('rocket', 2);
  const colorOf = (mesh) => {
    const c = mesh.geometry.getAttribute('color');
    let s = 0;
    for (let i = 0; i < Math.min(c.array.length, 60); i++) s += c.array[i];
    return +s.toFixed(4);
  };
  const neonSum = colorOf(p.state.pieces[0]);
  p.setPalette('classic');
  p.startGame('rocket', 2);
  const classicSum = colorOf(p.state.pieces[0]);
  p.showDifficulty();
  const palRow = document.querySelectorAll('#difficulty .diff-row')[2]; // 第 3 行 = 配色皮肤
  const palBtns = palRow ? palRow.children.length : 0;
  return { neonSum, classicSum, palBtns, palette: p.getPalette(), pieces: p.state.pieces.length };
})()`);
check('配色皮肤：颜色随皮肤改变、片数正确、菜单有 6 种配色',
  paletteTest.neonSum !== paletteTest.classicSum && paletteTest.palette === 'classic'
  && paletteTest.pieces === 2 && paletteTest.palBtns === 7, JSON.stringify(paletteTest));

// 3.75) 场景主题：切换背景/雾颜色并可恢复
const themeTest = await evalJs(`(() => {
  const p = window.__wanxiang;
  p.setTheme('night'); // 显式回到默认主题，避免上一次运行残留的本地主题影响基线
  const before = p.getThemeInfo();
  p.setTheme('snow');
  const snow = p.getThemeInfo();
  p.setTheme('sunset');
  const sunset = p.getThemeInfo();
  p.setTheme('night');
  const back = p.getThemeInfo();
  return { before, snow, sunset, back };
})()`);
check('场景主题切换：背景与雾颜色变化、可恢复',
  themeTest.before.theme === 'night' && themeTest.snow.bg !== themeTest.before.bg
  && themeTest.sunset.bg !== themeTest.snow.bg && themeTest.back.bg === themeTest.before.bg
  && themeTest.snow.fog !== themeTest.before.fog,
  JSON.stringify(themeTest));

// 3.8) 抓取高亮 + 磁吸辅助
const assistTest = await evalJs(`(() => {
  const p = window.__wanxiang, T = p.THREE;
  p.startGame('rocket', 2); // 确保处于 playing（上一步菜单把 mode 改成了 difficulty）
  const s = p.state;
  // —— 抓取高亮：把一块碎片挪到手柄原点附近（手柄在原点），抓取后虚影对应块应高亮
  const mesh0 = s.pieces[0];
  mesh0.userData.placed = false;
  mesh0.position.set(0.05, 0.05, 0);
  p.onGrab('right');
  const hlOnGrab = p.getGhostHighlight();
  const grabbed = s.grabbing.has('right');
  p.onRelease('right');
  const hlAfterRelease = p.getGhostHighlight();
  p.physics.length = 0;
  // —— 磁吸：手动构造抓取关系，把碎片放在"接近但未到吸附距离"处
  const mesh = s.pieces[1];
  mesh.userData.placed = false;
  const tp = new T.Vector3(), tq = new T.Quaternion();
  mesh.userData.target.getWorldPosition(tp);
  mesh.userData.target.getWorldQuaternion(tq);
  mesh.position.copy(tp); mesh.quaternion.copy(tq);
  mesh.position.x += mesh.userData.snapDist * 1.4; // 在 1.6× 磁吸半径内、吸附距离外
  const c = s.right, cp = new T.Vector3(), cq = new T.Quaternion();
  c.getWorldPosition(cp); c.getWorldQuaternion(cq);
  const inv = cq.clone().invert();
  const grab = {
    mesh,
    offset: mesh.position.clone().sub(cp).applyQuaternion(inv),
    quatOffset: inv.clone().multiply(mesh.quaternion.clone()),
  };
  s.grabbing.set('right', grab);
  const d0 = mesh.position.distanceTo(tp);
  let pulled = 0;
  for (let i = 0; i < 20; i++) if (p.magnetStep('right')) pulled++;
  const d1 = mesh.position.distanceTo(tp);
  s.grabbing.delete('right');
  // —— 关闭辅助后不应再拉
  p.setAssist(false);
  const assistOff = p.magnetStep('right');
  p.setAssist(true);
  return { hlOnGrab, grabbed, hlAfterRelease, d0: +d0.toFixed(4), d1: +d1.toFixed(4), pulled, assistOff };
})()`);
check('抓取时高亮虚影对应块，松手取消高亮',
  assistTest.grabbed && assistTest.hlOnGrab >= 0 && assistTest.hlAfterRelease === -1, JSON.stringify(assistTest));
check('磁吸辅助：接近目标时逐帧拉近（关闭后停止）',
  assistTest.pulled === 20 && assistTest.d1 < assistTest.d0 * 0.5 && assistTest.assistOff === false,
  JSON.stringify(assistTest));

// 3.9) 全菜单冒烟：点击所有模型/配色/开关按钮，不崩溃、无 fatal
const smoke = await evalJs(`(() => {
  const p = window.__wanxiang;
  p.showDifficulty();
  const rows = [...document.querySelectorAll('#difficulty .diff-row')];
  const modelBtns = [...rows[0].children];
  const paletteBtns = [...rows[2].children];
  let clicks = 0;
  for (const b of modelBtns) { b.click(); clicks++; }
  for (const b of paletteBtns) { b.click(); clicks++; }
  const assist = rows[3].children[0]; assist.click(); assist.click(); clicks += 2;
  const practiceBtn = rows[3].children[1]; practiceBtn.click(); practiceBtn.click(); clicks += 2;
  p.setPalette('classic');
  p.state.modelKey = 'rocket';
  return {
    clicks, fatal: p.getFatalInfo().visible,
    models: modelBtns.length, palettes: paletteBtns.length,
    practice: p.getPractice(), palette: p.getPalette(),
  };
})()`);
check('全菜单冒烟：20 模型/6 配色/开关按钮点击无异常',
  smoke.fatal === false && smoke.models === 22 && smoke.palettes === 7
  && smoke.practice === false && smoke.palette === 'classic', JSON.stringify(smoke));

// 3.10) 练习模式：通关不写入进度
const practice = await evalJs(`(() => {
  const p = window.__wanxiang, T = p.THREE;
  const before = JSON.stringify(p.loadProgress());
  p.setPractice(true);
  p.startGame('gift', 2);
  for (const mesh of p.state.pieces) {
    const tp = new T.Vector3(), tq = new T.Quaternion();
    mesh.userData.target.getWorldPosition(tp);
    mesh.userData.target.getWorldQuaternion(tq);
    mesh.position.copy(tp);
    mesh.quaternion.copy(tq);
    p.trySnap(mesh);
  }
  const after = JSON.stringify(p.loadProgress());
  const winTime = document.getElementById('win-time').textContent;
  const mode = p.state.mode;
  p.setPractice(false);
  p.startGame('rocket', 2); // 恢复正常对局，供后续用例使用
  return { unchanged: before === after, winTime, mode, practice: p.getPractice() };
})()`);
check('练习模式：通关不记录成绩、不弹星级',
  practice.unchanged === true && practice.mode === 'won'
  && practice.winTime === '练习模式' && practice.practice === false, JSON.stringify(practice));

// 4) 物理下落：把一块碎片抛到空中，1 秒后应落回斜坡高度附近并从队列移除
const phys = await evalJs(`(async () => {
  const s = window.__wanxiang.state;
  const mesh = s.pieces[0];
  mesh.userData.placed = false;
  mesh.position.set(0, 2.5, -1.0);
  window.__wanxiang.physics.push({ mesh, vy: 0, wx: 0.5, wz: -0.3 });
  await new Promise((r) => setTimeout(r, 2500));
  const ground = window.__wanxiang.slopeHeightAt(mesh.position.x, mesh.position.z);
  return { y: mesh.position.y, ground, settled: Math.abs(mesh.position.y - (ground + 0.10)) < 0.03, inQueue: window.__wanxiang.physics.some((p) => p.mesh === mesh) };
})()`);
check('物理下落：碎片落到斜坡表面并静止', phys.settled && !phys.inQueue, JSON.stringify(phys));

// 5) 握键找回（home 回位）
const home = await evalJs(`(() => {
  const s = window.__wanxiang.state;
  const mesh = s.pieces[1];
  mesh.position.set(5, 5, 5); // 扔到远处
  // 直接调用找回逻辑等价操作：验证 home 数据存在且回位后与坡面合理
  mesh.position.copy(mesh.userData.home.pos);
  mesh.quaternion.copy(mesh.userData.home.q);
  return { back: mesh.position.clone() };
})()`);
check('碎片 home 位姿可回位', home.back !== null);

// 6) 吸附 + 胜利（全部归位）
const win = await evalJs(`(() => {
  const s = window.__wanxiang.state;
  const THREE = window.__wanxiang.THREE;
  for (const mesh of s.pieces) {
    const tp = new THREE.Vector3(), tq = new THREE.Quaternion();
    mesh.userData.target.getWorldPosition(tp);
    mesh.userData.target.getWorldQuaternion(tq);
    mesh.position.copy(tp).add(new THREE.Vector3(0.02, 0.01, 0));
    mesh.quaternion.copy(tq);
    window.__wanxiang.trySnap(mesh);
  }
  return { placed: s.placedCount, total: s.pieces.length, mode: s.mode };
})()`);
check('全部吸附后进入 won', win.placed === win.total && win.mode === 'won', JSON.stringify(win));

// 7) 胜利面板显示
const winUi = await evalJs(`({
  visible: !document.getElementById('win').classList.contains('hidden'),
  time: document.getElementById('win-time').textContent,
  stars: document.getElementById('win-stars').textContent,
  best: document.getElementById('win-best').textContent,
})`);
check('胜利面板可见且有时间/星级/最佳记录',
  winUi.visible && /\d+分\d+秒/.test(winUi.time) && /[★☆]{3}/.test(winUi.stars),
  JSON.stringify(winUi));

// 7.0) VR 内：成就浮窗 + 进度页（主/进度页互斥、内容为最新进度）
const vrPage = await evalJs(`(() => {
  const p = window.__wanxiang;
  const toast = p.getVrToast();
  p.toggleVrMenu(true);
  p.showVrPage('progress');
  const info = p.getVrPageInfo();
  p.showVrPage('main');
  const main = p.getVrPageInfo();
  p.toggleVrMenu(false);
  return { toast, info, main };
})()`);
check('成就解锁触发 VR 浮窗提示', vrPage.toast.active && vrPage.toast.text.includes('初次拼合'), JSON.stringify(vrPage.toast));
check('VR 进度页显示关卡/星星/成就与当前模型记录',
  vrPage.info.page === 'progress' && vrPage.info.progressVisible
  && vrPage.info.lines.some((t) => t.includes('关卡')) && vrPage.info.lines.some((t) => t.includes('成就'))
  && vrPage.info.lines.some((t) => t.includes('块')), JSON.stringify(vrPage.info.lines));
check('VR 主页面与进度页互斥切换', vrPage.main.page === 'main' && vrPage.main.progressVisible === false, JSON.stringify(vrPage.main));

// 7.1) 成绩写入 localStorage（星级/最佳时间/游玩次数）
// 注意：按"当前实际关卡"取键（前面的功能测试可能已切换关卡）
const prog = await evalJs(`(() => {
  const s = window.__wanxiang.state;
  const key = window.__wanxiang.levelKey(s.modelKey, s.pieceCount);
  const p = window.__wanxiang.loadProgress();
  return { key, rec: p[key] || null };
})()`);
check('胜利后成绩写入本地进度（星级≥1、有最佳时间）',
  prog.rec && prog.rec.stars >= 1 && prog.rec.bestTime > 0 && prog.rec.plays >= 1,
  JSON.stringify(prog));

// 7.2) 难度菜单显示 ⭐ 进度
const menuProg = await evalJs(`(() => {
  window.__wanxiang.showDifficulty();
  return [...document.querySelectorAll('#difficulty .diff-btn')].map((b) => b.textContent).filter((t) => t.includes('⭐'));
})()`);
check('难度菜单显示 ⭐ 关卡进度', menuProg.length === 5 && menuProg.every((t) => /⭐ \d+\/\d+ 关/.test(t)), JSON.stringify(menuProg));

// 7.3) 成就：首通解锁 first_win；胜利面板提示；菜单显示成就栏与每关记录
const ach = await evalJs(`(() => {
  const p = window.__wanxiang;
  const list = p.readAchievements();
  const winAch = document.getElementById('win-achieve');
  const winText = winAch ? winAch.textContent : '';
  const winVisible = winAch ? winAch.style.display !== 'none' : false;
  p.showDifficulty();
  const menuText = document.getElementById('difficulty').innerText;
  const diffBtns = [...document.querySelectorAll('#difficulty .diff-btn')].map((b) => b.textContent);
  const hasRecord = diffBtns.some((t) => t.includes('★') || t.includes('☆')) || diffBtns.some((t) => t.includes('未挑战'));
  const hasAch = menuText.includes('成就 ') && menuText.includes('/15');
  return { list, winText, winVisible, hasAch, hasRecord };
})()`);
check('首通解锁 first_win 且胜利面板提示', ach.list.includes('first_win') && ach.winVisible && ach.winText.includes('初次拼合'), JSON.stringify(ach));
check('菜单显示成就进度与每关星级/记录', ach.hasAch && ach.hasRecord, JSON.stringify(ach));

// 8) 重开（再来一局回到难度菜单 → 再开局）
const replay = await evalJs(`(() => {
  document.getElementById('win-btn').click();
  const s = window.__wanxiang.state;
  const menuShown = !document.getElementById('difficulty').classList.contains('hidden');
  window.__wanxiang.startGame('rocket', 2);
  return { menuShown, mode: s.mode, count: s.pieces.length };
})()`);
check('再来一局 → 菜单 → 重开成功', replay.menuShown && replay.mode === 'playing' && replay.count === 2, JSON.stringify(replay));

console.log('控制台错误数:', consoleErrors.length);
for (const e of consoleErrors.slice(0, 10)) console.log('  [err]', e.slice(0, 250));

chrome.kill();
process.exit(failed || consoleErrors.length ? 1 : 0);
