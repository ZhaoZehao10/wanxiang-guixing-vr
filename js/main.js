// 万象归形 — 主程序
// Three.js r160 + WebXR。适配 Pico Neo3（Pico 浏览器，4DoF/6DoF 手柄）。
//
// 玩法：碎片散落在身前斜坡上，目标虚影浮在斜坡上方。扣扳机抓取、松手放下，
// 碎片接近其目标位姿（平移 + 旋转都接近）时自动吸附；全部归位即胜利。
import * as THREE from '../vendor/three.module.min.js';
import { VRButton } from '../vendor/VRButton.js';
import { splitIntoPieces, CUT_TABLE } from './puzzle.mjs';
import { MODELS, PALETTES } from './models.mjs';
import { sfx, music } from './sfx.mjs';
import {
  DIFFICULTY, DIFFICULTY_NAME, MODEL_KEYS, ACHIEVEMENTS,
  levelKey, parTime, starsFor, summarize,
  loadProgress, saveProgress, loadAchievements, saveAchievements,
  recordResult, evaluateAchievements,
} from './progress.mjs';

// ---------------- 常量 ----------------

const APP_VERSION = '1.4.0';
const BUILD_INFO = '18 模型 · 88 关 · 6 配色 · 5 主题';

// 各模型实际支持的难度（8 块为可选档：圣诞树无解，其余 11 个模型支持）
const supportedCounts = (mk) => Object.keys(CUT_TABLE[mk] || {}).map(Number).sort((a, b) => a - b);
const totalLevels = () => MODEL_KEYS.reduce((s, mk) => s + supportedCounts(mk).length, 0);

const PIECE_SCALE = 0.42;      // 模型 → 拼图整体缩放（拼图直径约 0.5~0.95m）
const SNAP_DIST = 0.30;        // 位置吸附距离（米）
const SNAP_COS = 0.90;         // 旋转吸附余弦阈值（约 25°）
const GRAB_REACH = 0.85;       // 手柄到碎片的抓取半径（米）
const SLOPE_PIECES = 9;        // 散落碎片数上限（多于碎片数时随机会重复取用）

// ---------------- 全局状态 ----------------

// 配色皮肤持久化（只影响顶点颜色，不影响几何与切割表）
const PALETTE_KEY = 'wanxiang.palette';
function loadPalette() {
  try {
    const v = localStorage.getItem(PALETTE_KEY);
    if (v && PALETTES[v]) return v;
  } catch (e) { /* ignore */ }
  return 'classic';
}
function savePalette(p) {
  try { localStorage.setItem(PALETTE_KEY, p); } catch (e) { /* ignore */ }
}

// 磁吸辅助（默认开）：持有碎片接近目标位姿时轻拉对齐，降低精细对准难度
const ASSIST_KEY = '{{SECRET_k8d2m9xq}}';
function loadAssist() {
  try { return localStorage.getItem(ASSIST_KEY) !== '0'; } catch (e) { return true; }
}
function saveAssist(on) {
  try { localStorage.setItem(ASSIST_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
}

// 练习模式（默认关）：不计时、不记录成绩与成就，纯休闲拼图
const PRACTICE_KEY = '{{SECRET_nt2f8rwm}}';
function loadPractice() {
  try { return localStorage.getItem(PRACTICE_KEY) === '1'; } catch (e) { return false; }
}
function savePractice(on) {
  try { localStorage.setItem(PRACTICE_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
}

// 手感参数（磁吸强度/震动强度/菜单距离与大小），持久化到本地
const TUNING_KEY = '{{SECRET_3zq9w4rt}}';
const DEFAULT_TUNING = { magnet: 0.10, haptic: 1, menuDist: 0.70, menuScale: 0.42 };
function loadTuning() {
  try {
    const v = JSON.parse(localStorage.getItem(TUNING_KEY) || '{}');
    return { ...DEFAULT_TUNING, ...v };
  } catch (e) { return { ...DEFAULT_TUNING }; }
}
function saveTuning(t) {
  try { localStorage.setItem(TUNING_KEY, JSON.stringify(t)); } catch (e) { /* ignore */ }
}

// 场景主题（背景/雾/灯光/地面色调），只影响视觉不影响玩法
const THEME_KEY = 'wanxiang.theme';
function loadTheme() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    if (v && SCENE_THEMES[v]) return v;
  } catch (e) { /* ignore */ }
  return 'night';
}
function saveTheme(k) {
  try { localStorage.setItem(THEME_KEY, k); } catch (e) { /* ignore */ }
}
const SCENE_THEMES = {
  night: { name: '夜空', emoji: '🌙', bg: 0x0b1020, fog: 0x0b1020, floor: 0x1a2340, slope: 0x27335e, hemiSky: 0xbfd8ff, hemiGround: 0x3a2f2a, dir: 0xffffff, dir2: 0x88aaff, rim: 0xb18cff, starOpacity: 0.95 },
  snow: { name: '雪夜', emoji: '❄️', bg: 0x101b2e, fog: 0x101b2e, floor: 0x27405f, slope: 0x33507a, hemiSky: 0xd8e8ff, hemiGround: 0x4a5568, dir: 0xffffff, dir2: 0x99c4ff, rim: 0x88aaff, starOpacity: 0.45 },
  sunset: { name: '日落', emoji: '🌇', bg: 0x2a1630, fog: 0x2a1630, floor: 0x3a2440, slope: 0x4a2c4a, hemiSky: 0xffd0a8, hemiGround: 0x5a3040, dir: 0xffe0b0, dir2: 0xff9a70, rim: 0xff7aa0, starOpacity: 0.35 },
  dawn: { name: '樱花', emoji: '🌸', bg: 0x2b1e2c, fog: 0x2b1e2c, floor: 0x3d2a42, slope: 0x50355a, hemiSky: 0xffd8ea, hemiGround: 0x5c4050, dir: 0xffe8f2, dir2: 0xff9ec9, rim: 0xff7ab0, starOpacity: 0.5 },
  sea: { name: '深海', emoji: '🌊', bg: 0x062029, fog: 0x062029, floor: 0x0c3a44, slope: 0x155a66, hemiSky: 0xbff4ff, hemiGround: 0x0e2c34, dir: 0xffffff, dir2: 0x66e0ff, rim: 0x2fd6b0, starOpacity: 0.25 },
};

const state = {
  mode: 'intro',        // intro | difficulty | playing | won
  modelKey: 'rocket',
  pieceCount: 2,        // 当前难度（块数），VR 菜单高亮/重开用
  palette: loadPalette(), // 配色皮肤键（PALETTES）
  assist: loadAssist(),   // 磁吸辅助开关
  practice: loadPractice(), // 练习模式（不记录成绩）
  theme: loadTheme(),      // 场景主题（night/snow/sunset）
  tuning: loadTuning(),    // 手感参数（磁吸/震动/菜单距离与大小）
  pieces: [],           // mesh 本体（userData 挂 target/placed/home 等）
  placedCount: 0,
  startTime: 0,
  winTime: 0,
  grabbing: new Map(),  // controller.userData.hand -> piece
};

// 松手物理：未吸附的碎片做简化自由落体 + 地面/斜坡弹跳（视觉合理即可）
const physics = []; // [{mesh, vy, wx, wz}]
const GRAVITY = -4.5;     // 略弱于真实重力，碎片下落更"轻盈"可拾取
const RESTITUTION = 0.25;
const FRAME_DT = 1 / 72; // Pico Neo3 刷新率 72Hz；物理是视觉性的，用固定步长足够

let renderer, scene, camera, ghostGroup, envReady = false;
const sceneRefs = {}; // 主题可修改的场景对象引用（灯光/地面/斜坡）
let targetRig = null; // 承载目标位姿的锚点（放在斜坡上方）

// ---------------- DOM ----------------

const $ = (id) => document.getElementById(id);

// 致命错误 / 渲染中断覆盖层（真机切换应用后 WebGL 上下文可能丢失）
function showFatal(title, msg) {
  const el = $('fatal');
  if (!el) return;
  const t = $('fatal-title'), m = $('fatal-msg');
  if (t) t.textContent = title;
  if (m) m.textContent = msg;
  el.classList.remove('hidden');
}
function hideFatal() {
  const el = $('fatal');
  if (el) el.classList.add('hidden');
}

// ---------------- 场景搭建 ----------------

function initScene() {
  renderer = new THREE.WebGLRenderer({ canvas: $('c3d'), antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // WebGL 上下文丢失保护：Pico 浏览器切到其他应用再回来时常见，给出明确恢复引导
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showFatal('渲染中断', '浏览器回收了 WebGL 上下文（常见于切换到其他应用后返回）。点击「重新加载」即可恢复游戏，进度已保存在本地。');
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => hideFatal());

  // 给 VR 按钮设置 id，便于样式定位到右下角（避免遮挡菜单底部成就行）
  const vrBtn = VRButton.createButton(renderer);
  vrBtn.id = 'vr-button';
  document.body.appendChild(vrBtn);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);
  scene.fog = new THREE.FogExp2(0x0b1020, 0.022); // 轻微景深雾，远处地面融入背景

  // 环境反射：程序化画一张等距柱状渐变天空（含两处灯箱高光），PMREM 生成 IBL。
  // 金属/粗糙度材质的质感来源于此；零外部贴图。
  try {
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const cx2 = cv.getContext('2d');
    const grd = cx2.createLinearGradient(0, 0, 0, 128);
    grd.addColorStop(0.0, '#2b3f78');
    grd.addColorStop(0.45, '#141b34');
    grd.addColorStop(0.56, '#3a2058');
    grd.addColorStop(1.0, '#080b14');
    cx2.fillStyle = grd; cx2.fillRect(0, 0, 256, 128);
    const lamp = (x, y, r, color) => {
      const rg = cx2.createRadialGradient(x, y, 2, x, y, r);
      rg.addColorStop(0, color); rg.addColorStop(1, 'rgba(0,0,0,0)');
      cx2.fillStyle = rg; cx2.fillRect(0, 0, 256, 128);
    };
    lamp(70, 38, 52, 'rgba(190,220,255,0.95)');
    lamp(196, 62, 40, 'rgba(255,205,150,0.65)');
    const envTex = new THREE.CanvasTexture(cv);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    envTex.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(envTex).texture;
    envReady = true;
    pmrem.dispose();
    envTex.dispose();
  } catch (e) { /* 环境贴图失败不影响可玩性 */ }

  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 60);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(0, 0.72, -1.45); // 桌面预览俯视游戏区；VR 中由头显位姿接管

  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a2f2a, 0.85);
  scene.add(hemi);
  sceneRefs.hemi = hemi;
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(2, 4, 2);
  scene.add(dir);
  sceneRefs.dir = dir;
  const dir2 = new THREE.DirectionalLight(0x88aaff, 0.45);
  dir2.position.set(-3, 2, -2);
  scene.add(dir2);
  sceneRefs.dir2 = dir2;
  const rim = new THREE.DirectionalLight(0xb18cff, 0.35); // 背侧紫色轮廓光
  rim.position.set(0, 1.5, -4);
  scene.add(rim);
  sceneRefs.rim = rim;
  sceneRefs.scene = scene;

  buildStarfield();
  buildWorld();
  buildControllers();
  buildVrMenu();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function buildWorld() {
  // 地面
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(9, 48),
    new THREE.MeshStandardMaterial({ color: 0x1a2340, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  sceneRefs.floor = floor;

  // 环形网格线（低调装饰）
  const grid = new THREE.PolarGridHelper(9, 12, 6, 48, 0x2a3a66, 0x223055);
  grid.position.y = 0.002;
  scene.add(grid);

  // 斜坡（碎片散落其上）：从玩家脚前向远处抬高（展示架式，碎片正面朝玩家）
  const slope = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.1, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x27335e, roughness: 0.8 })
  );
  slope.position.set(0, 0.55, -0.95);
  slope.rotation.x = SLOPE_TILT;
  scene.add(slope);
  sceneRefs.slope = slope;

  // 目标锚点：斜坡上方的空中
  targetRig = new THREE.Object3D();
  targetRig.position.set(0, 1.15, -1.6);
  scene.add(targetRig);
}

// ---------------- 星空背景 ----------------
let starfield = null;
function buildStarfield() {
  const N = 900;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    // 均匀分布在大球壳上（半径 22~38），避开玩家正前方的近场
    const u = Math.random() * 2 - 1;
    const th = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 22 + Math.random() * 16;
    pos[i * 3] = s * Math.cos(th) * r;
    pos[i * 3 + 1] = u * r * 0.6 + 6;
    pos[i * 3 + 2] = s * Math.sin(th) * r;
    const tint = 0.72 + Math.random() * 0.28;
    const blueish = Math.random() < 0.3;
    col[i * 3] = blueish ? 0.65 * tint : tint;
    col[i * 3 + 1] = blueish ? 0.8 * tint : tint;
    col[i * 3 + 2] = tint;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({
    size: 0.16, vertexColors: true, transparent: true, opacity: 0.95,
    sizeAttenuation: true, depthWrite: false, fog: false,
  });
  starfield = new THREE.Points(g, m);
  scene.add(starfield);
}

// 应用场景主题：只改颜色/雾/星空透明度，不触碰几何与玩法
function applyTheme(key) {
  const t = SCENE_THEMES[key] || SCENE_THEMES.night;
  state.theme = SCENE_THEMES[key] ? key : 'night';
  saveTheme(state.theme);
  if (!sceneRefs.scene) return; // 场景尚未初始化（启动早期调用）
  sceneRefs.scene.background.setHex(t.bg);
  if (sceneRefs.scene.fog) sceneRefs.scene.fog.color.setHex(t.fog);
  sceneRefs.hemi.color.setHex(t.hemiSky);
  sceneRefs.hemi.groundColor.setHex(t.hemiGround);
  sceneRefs.dir.color.setHex(t.dir);
  sceneRefs.dir2.color.setHex(t.dir2);
  sceneRefs.rim.color.setHex(t.rim);
  sceneRefs.floor.material.color.setHex(t.floor);
  sceneRefs.slope.material.color.setHex(t.slope);
  if (starfield && starfield.material) starfield.material.opacity = t.starOpacity;
}

// ---------------- 画质自适应 ----------------
// 目标：Pico Neo3 72Hz 面板下稳定 72fps；检测到掉帧就逐级降载，恢复后再升回。
//   level 2（高）：像素比 = min(dpr,2)，星空开
//   level 1（中）：像素比 = 1.25，星空开
//   level 0（低）：像素比 = 1，星空关
const quality = {
  level: 2,
  frames: 0,
  lastCheck: 0,
  lowStreak: 0,
  highStreak: 0,
  auto: true,
};

function applyQualityLevel(level) {
  quality.level = Math.max(0, Math.min(2, level));
  const dpr = window.devicePixelRatio || 1;
  const pr = quality.level === 2 ? Math.min(dpr, 2) : quality.level === 1 ? Math.min(dpr, 1.25) : 1;
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (starfield) starfield.visible = quality.level >= 1;
  if (quality.level === 0) clearHint();
}

// 每 2 秒检查一次帧率：连续偏低降压，连续偏高升压（带滞回，避免抖动）
function tickQuality(nowMs) {
  if (!quality.auto) return;
  quality.frames++;
  if (!quality.lastCheck) { quality.lastCheck = nowMs; return; }
  const elapsed = nowMs - quality.lastCheck;
  if (elapsed < 2000) return;
  const fps = (quality.frames * 1000) / elapsed;
  quality.frames = 0;
  quality.lastCheck = nowMs;
  if (fps < 58) {
    quality.lowStreak++;
    quality.highStreak = 0;
    if (quality.lowStreak >= 2 && quality.level > 0) {
      applyQualityLevel(quality.level - 1);
      quality.lowStreak = 0;
    }
  } else if (fps > 70) {
    quality.highStreak++;
    quality.lowStreak = 0;
    if (quality.highStreak >= 5 && quality.level < 2) {
      applyQualityLevel(quality.level + 1);
      quality.highStreak = 0;
    }
  } else {
    quality.lowStreak = 0;
    quality.highStreak = 0;
  }
}

// ---------------- 视觉特效（吸附光环 / 胜利彩带 / 碎片投影） ----------------

const fxList = [];            // { obj, t, life, kind, ... }
let blobShadowTex = null;

function getBlobShadowTex() {
  if (blobShadowTex) return blobShadowTex;
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 128;
  const c2 = cv.getContext('2d');
  const rg = c2.createRadialGradient(64, 64, 4, 64, 64, 62);
  rg.addColorStop(0, 'rgba(0,0,0,0.55)');
  rg.addColorStop(0.55, 'rgba(0,0,0,0.28)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  c2.fillStyle = rg; c2.fillRect(0, 0, 128, 128);
  blobShadowTex = new THREE.CanvasTexture(cv);
  return blobShadowTex;
}

function addBlobShadow(mesh, radius) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: getBlobShadowTex(), transparent: true, depthWrite: false, opacity: 0.9 })
  );
  m.rotation.x = -Math.PI / 2;
  m.scale.setScalar(radius * 2.6);
  m.renderOrder = 2;
  scene.add(m);
  mesh.userData.shadow = m;
  return m;
}

function spawnSnapRing(pos) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.05, 0.075, 40),
    new THREE.MeshBasicMaterial({ color: 0x6dffa8, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.position.copy(pos);
  scene.add(ring);
  fxList.push({ obj: ring, t: 0, life: 0.55, kind: 'ring' });
}

function spawnWinBurst(center) {
  const N = 260;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const vel = [];
  const palette = [[1, 0.85, 0.3], [0.4, 0.95, 0.8], [0.7, 0.5, 1], [1, 0.5, 0.6], [0.55, 0.75, 1]];
  for (let i = 0; i < N; i++) {
    pos[i * 3] = center.x; pos[i * 3 + 1] = center.y; pos[i * 3 + 2] = center.z;
    const c = palette[i % palette.length];
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    const sp = 0.8 + Math.random() * 2.0;
    vel.push(new THREE.Vector3(Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp + 1.2, Math.sin(ph) * Math.sin(th) * sp));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, opacity: 1, depthWrite: false });
  const points = new THREE.Points(g, mat);
  scene.add(points);
  fxList.push({ obj: points, t: 0, life: 2.6, kind: 'burst', vel });
}

// ---------------- 提示系统 ----------------
// 触发方式：VR 菜单里的「提示」按钮；或卡住 25 秒自动触发。
// 效果：下一块的目标位置升起青色光柱 + 虚影对应部分高亮 + 碎片本身发光。
const hint = { pillar: null, until: 0, idx: -1 };

function triggerHint(duration = 7000) {
  const next = state.pieces.find((p) => !p.userData.placed);
  if (!next) return false;
  clearHint();
  const idx = next.userData.pieceIndex;
  const tp = new THREE.Vector3();
  next.userData.target.getWorldPosition(tp);
  const geo = new THREE.CylinderGeometry(0.03, 0.14, 0.6, 20, 1, true);
  const mat = new THREE.MeshBasicMaterial({ color: 0x6dffa8, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false });
  const pillar = new THREE.Mesh(geo, mat);
  pillar.position.copy(tp);
  pillar.position.y += 0.34;
  scene.add(pillar);
  hint.pillar = pillar;
  hint.until = performance.now() + duration;
  hint.idx = idx;
  next.userData.hintUntil = hint.until;
  // 虚影对应片高亮（ghostGroup.children 与 pieces 同序）
  if (ghostGroup && ghostGroup.children[idx]) {
    const gm = ghostGroup.children[idx];
    gm.userData.savedMat = gm.material;
    gm.material = new THREE.MeshStandardMaterial({
      color: 0x6dffa8, transparent: true, opacity: 0.6,
      emissive: 0x2a7f4a, emissiveIntensity: 1.2, depthWrite: false, side: THREE.DoubleSide,
    });
  }
  if (state.mode === 'playing') state.hintsUsed = (state.hintsUsed || 0) + 1;
  sfx.ui();
  return true;
}

function clearHint() {
  if (hint.pillar) {
    scene.remove(hint.pillar);
    hint.pillar.geometry.dispose();
    hint.pillar.material.dispose();
    hint.pillar = null;
  }
  if (hint.idx >= 0 && ghostGroup && ghostGroup.children[hint.idx] && ghostGroup.children[hint.idx].userData.savedMat) {
    const gm = ghostGroup.children[hint.idx];
    gm.material = gm.userData.savedMat;
    delete gm.userData.savedMat;
  }
  hint.idx = -1;
  hint.until = 0;
}

// ---------------- 抓取高亮：手里的碎片对应虚影的哪一块 ----------------
// 抓起来时把虚影中对应块点亮成青绿色，玩家一眼知道该往哪放。
const ghostHighlight = { idx: -1, savedMat: null };

function setGhostHighlight(idx) {
  if (ghostHighlight.idx === idx) return;
  clearGhostHighlight();
  if (idx >= 0 && ghostGroup && ghostGroup.children[idx]) {
    const gm = ghostGroup.children[idx];
    ghostHighlight.idx = idx;
    ghostHighlight.savedMat = gm.material;
    gm.material = new THREE.MeshStandardMaterial({
      color: 0x7dffc0, transparent: true, opacity: 0.5,
      emissive: 0x2fbf6a, emissiveIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide,
    });
  }
}

function clearGhostHighlight() {
  if (ghostHighlight.idx >= 0 && ghostGroup && ghostGroup.children[ghostHighlight.idx]) {
    const gm = ghostGroup.children[ghostHighlight.idx];
    if (ghostHighlight.savedMat) gm.material = ghostHighlight.savedMat;
  }
  ghostHighlight.idx = -1;
  ghostHighlight.savedMat = null;
}

// ---------------- 磁吸辅助 ----------------
// 持握时若已接近目标位姿（位置 ≤1.6×吸附距离、朝向差 ≤~41°），每帧朝目标轻拉 10%，
// 并把结果写回抓取偏移（否则下一帧会被手柄拉回原位）。吸附判定阈值本身不变。
function magnetStep(hand, rate = (state.tuning ? state.tuning.magnet : 0.10)) {
  if (!state.assist || rate <= 0) return false;
  const grab = state.grabbing.get(hand);
  const c = state[hand];
  if (!grab || !c) return false;
  const mesh = grab.mesh;
  if (mesh.userData.placed) return false;
  const tp = new THREE.Vector3(), tq = new THREE.Quaternion();
  mesh.userData.target.getWorldPosition(tp);
  mesh.userData.target.getWorldQuaternion(tq);
  const dist = mesh.position.distanceTo(tp);
  const dot = Math.abs(mesh.quaternion.dot(tq));
  if (dist > mesh.userData.snapDist * 1.6 || dot < 0.75) return false;
  mesh.position.lerp(tp, rate);
  mesh.quaternion.slerp(tq, rate);
  // 同步回抓取偏移，保持"磁吸后的位姿"作为下一帧基准
  c.getWorldPosition(_tp);
  c.getWorldQuaternion(_tq);
  const inv = _tq.clone().invert();
  grab.offset.copy(mesh.position).sub(_tp).applyQuaternion(inv);
  grab.quatOffset.copy(inv).multiply(mesh.quaternion);
  return true;
}

// ---------------- 关卡进度与星级（逻辑在 progress.mjs，可单测） ----------------

// 进度读写都带上 localStorage；纯逻辑在 progress.mjs（无 DOM 依赖）
function readProgress() { return loadProgress(localStorage); }
function writeProgress(p) { saveProgress(localStorage, p); }
function readAchievements() { return loadAchievements(localStorage); }
function writeAchievements(list) { saveAchievements(localStorage, list); }

// 通关结算：写入成绩 → 评估成就 → 返回星级/最佳/新解锁成就
function commitResult(modelKey, n, secs, hints) {
  const p = readProgress();
  const r = recordResult(p, modelKey, n, secs, hints);
  writeProgress(p);
  const unlocked = readAchievements();
  const newly = evaluateAchievements(p, unlocked);
  if (newly.length) writeAchievements(unlocked.concat(newly));
  return { ...r, newly };
}


// ---------------- 拼片构建 ----------------

function buildGhostAndPieces(modelKey, n) {
  // 清理旧对象（state.pieces 里存的就是 mesh 本身；投影是独立对象要一起删）
  clearGhostHighlight(); // 虚影即将重建，先恢复被高亮/提示替换过的材质
  if (ghostGroup) { targetRig.remove(ghostGroup); ghostGroup = null; }
  for (const p of state.pieces) {
    scene.remove(p);
    if (p.userData.shadow) scene.remove(p.userData.shadow);
  }
  state.pieces = [];
  state.placedCount = 0;
  state.grabbing.clear();

  const result = splitIntoPieces(modelKey, n, state.palette);

  // 目标虚影：半透明完整模型
  ghostGroup = new THREE.Group();
  const ghostMat = new THREE.MeshStandardMaterial({
    color: 0x6cd0ff, transparent: true, opacity: 0.24,
    roughness: 0.25, metalness: 0.2, depthWrite: true, side: THREE.DoubleSide,
    emissive: 0x1a4a66, emissiveIntensity: 0.55,
  });
  // 用全部拼片的几何拼出完整形状（省得再写一个合并器）
  for (const piece of result.pieces) {
    const g = new THREE.BufferGeometry();
    const { pos, col } = unpackPiece(piece);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(piece.indices, 1));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, ghostMat);
    ghostGroup.add(m);
  }
  ghostGroup.scale.setScalar(PIECE_SCALE);
  ghostGroup.position.y = 0.05;
  targetRig.add(ghostGroup);

  // 目标位姿锚点（不可见）：每片的 target 放在 ghost 对应位置
  // 由于拼片几何以模型中心为原点，piece.center 是其包围盒中心，
  // target.position = PIECE_SCALE * piece.center（ghost 组内坐标）。
  // 拼片 mesh 自身 position = 散落点；吸附判定 = mesh 变换到 target 系下的偏差。

  // 真实拼片
  const maxR = Math.max(...result.pieces.map((p) => p.radius * PIECE_SCALE));
  const dropPts = scatterPoints(result.pieces.length, Math.max(0.55, maxR * 1.45));
  result.pieces.forEach((piece, i) => {
    const g = new THREE.BufferGeometry();
    const { pos, col } = unpackPiece(piece);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(piece.indices, 1));
    g.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.34, metalness: 0.22, envMapIntensity: 1.35,
      side: THREE.DoubleSide, // 封盖三角形万一会挑剔缠绕方向，双面保证可见性
    });
    const mesh = new THREE.Mesh(g, mat);
    mesh.scale.setScalar(PIECE_SCALE);
    mesh.castShadow = false;
    mesh.userData.pieceIndex = i;

    // target：ghost 内的静态锚点
    const target = new THREE.Object3D();
    target.position.set(piece.center[0] * PIECE_SCALE, piece.center[1] * PIECE_SCALE, piece.center[2] * PIECE_SCALE);
    target.quaternion.identity();
    ghostGroup.add(target);

    // 散落位姿：位置在斜坡上，朝向随机
    const pt = dropPts[i % dropPts.length];
    mesh.position.copy(pt.pos);
    mesh.quaternion.copy(pt.q);
    mesh.userData.home = { pos: pt.pos.clone(), q: pt.q.clone() };
    mesh.userData.target = target;
    mesh.userData.placed = false;
    mesh.userData.snapDist = piece.radius * PIECE_SCALE * 0.9 + 0.06; // 按拼片大小缩放的吸附半径
    mesh.userData.snapCos = 0.86;

    scene.add(mesh);
    addBlobShadow(mesh, piece.radius * PIECE_SCALE); // 柔和投影，增强立体感
    state.pieces.push(mesh);
  });
  physics.length = 0;

  $('model-name').innerHTML = `${result.emoji} ${result.name}<small>目标：斜坡上方的蓝色虚影</small>`;
  $('placed-counter').textContent = `0 / ${result.pieces.length}`;
}

const SLOPE_TILT = Math.atan(0.25); // 斜坡倾角（与 slopeHeightAt 保持一致）

// 拼片缓冲区解交错：positions 是 [x,y,z,r,g,b]×N 交错排列，GPU 需要分开的
// 紧凑 xyz 与 rgb 数组（直接传交错数组会把颜色当坐标，几何完全乱掉）
function unpackPiece(piece) {
  const n = piece.positions.length / 6;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = piece.positions[i * 6];
    pos[i * 3 + 1] = piece.positions[i * 6 + 1];
    pos[i * 3 + 2] = piece.positions[i * 6 + 2];
    col[i * 3] = piece.positions[i * 6 + 3];
    col[i * 3 + 1] = piece.positions[i * 6 + 4];
    col[i * 3 + 2] = piece.positions[i * 6 + 5];
  }
  return { pos, col };
}

// 斜坡上的散落点（网格排布 + 抖动 + 随机朝向，略高于表面防 z-fighting）
// spacing 随拼片尺寸自适应：大模型（城堡/企鹅）碎片不会被摆得互相穿插
function scatterPoints(count, spacing = 0.55) {
  const pts = [];
  const cols = Math.ceil(Math.sqrt(count * 1.5));
  for (let i = 0; i < count + 2; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const x = (col - (cols - 1) / 2) * spacing + (Math.random() - 0.5) * spacing * 0.18;
    const z = -0.75 - row * spacing * 0.87 + (Math.random() - 0.5) * spacing * 0.18;
    const y = slopeHeightAt(x, z) + 0.14 + Math.random() * 0.08; // 拼片半径较大，抬高防埋进坡里
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
      (Math.random() - 0.5) * Math.PI, (Math.random() - 0.5) * Math.PI * 2, (Math.random() - 0.5) * Math.PI
    ));
    pts.push({ pos: new THREE.Vector3(x, y, z), q });
  }
  return pts;
}

// 斜坡表面高度（与 buildWorld 的 slope 一致：中心 y=0.55，rotation.x=SLOPE_TILT，
// 绕 X 正角 = 远端（z 更小）抬不起来……实际上 rotation.x=正角使近端(z大)下降。
// 直接用盒中心与半厚推表面点：表面法向偏移 0.05。
function slopeHeightAt(x, z) {
  // 盒中心 (0, 0.55, -0.95)，绕 X 旋转 SLOPE_TILT。表面上一点满足：
  // y = 0.55 + 0.05*cos(t) + (-(z - zc)) * tan? —— 用旋转矩阵推导：
  // 局部点 (x, 0.05, lz) 旋转后：y = 0.55 + 0.05*cos(t) - lz*sin(t),
  // z = -0.95 + lz*cos(t) + 0.05*sin(t) → lz = ((z+0.95) - 0.05*sin(t)) / cos(t)
  const c = Math.cos(SLOPE_TILT), s = Math.sin(SLOPE_TILT);
  const lz = ((z - (-0.95)) - 0.05 * s) / c;
  return 0.55 + 0.05 * c - lz * s;
}

// ---------------- 手柄 ----------------

function buildControllers() {
  const rig = new THREE.Group();
  scene.add(rig);

  for (const handed of ['left', 'right']) {
    const c = renderer.xr.getController(handed === 'left' ? 0 : 1);
    c.userData.hand = handed;
    c.userData.selecting = false;
    c.userData.inputSource = null;

    // 记录 XRInputSource（震动需要 gamepad.hapticActuators；摇杆需要 gamepad.axes）
    c.addEventListener('connected', (e) => { c.userData.inputSource = e.data || null; });
    c.addEventListener('disconnected', () => { c.userData.inputSource = null; });

    const rayGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const ray = new THREE.Line(rayGeo, new THREE.LineBasicMaterial({ color: 0x6cd0ff, transparent: true, opacity: 0.5 }));
    ray.scale.z = 0.25;
    c.add(ray);
    c.userData.ray = ray;

    const tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.018, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xb18cff })
    );
    tip.position.z = -0.02;
    c.add(tip);
    c.userData.tip = tip;

    c.addEventListener('selectstart', () => onGrab(handed));
    c.addEventListener('selectend', () => onRelease(handed));
    c.addEventListener('squeezestart', () => onSqueeze(handed));
    rig.add(c);
    state[handed] = c;
  }
}

// 手柄震动（haptics）：Pico 手柄支持 gamepad.hapticActuators，不支持时静默忽略
function haptic(hand, intensity = 0.5, ms = 50) {
  try {
    const k = state.tuning && typeof state.tuning.haptic === 'number' ? state.tuning.haptic : 1;
    if (k <= 0) return;
    const c = state[hand];
    const gp = c && c.userData.inputSource && c.userData.inputSource.gamepad;
    const act = gp && gp.hapticActuators && gp.hapticActuators[0];
    if (act && typeof act.pulse === 'function') act.pulse(Math.min(1, intensity * k), Math.round(ms * k));
  } catch (e) { /* 部分浏览器/手柄不支持震动 */ }
}

const _tp = new THREE.Vector3();
const _tq = new THREE.Quaternion();

function onGrab(hand) {
  sfx.unlock(); // 手势内激活 AudioContext
  if (vrMenu.enabled) { vrMenuClick(hand); return; } // 菜单打开时扳机 = 点击
  if (state.mode !== 'playing') { vrMenuClick(hand); return; }
  const c = state[hand];
  if (!c) return;
  let best = null, bestD = Infinity;
  c.getWorldPosition(_tp);
  for (const mesh of state.pieces) {
    if (mesh.userData.placed) continue;
    const d = mesh.position.distanceTo(_tp);
    if (d < GRAB_REACH && d < bestD) { best = mesh; bestD = d; }
  }
  if (best) {
    // 从物理队列摘除
    const pi = physics.findIndex((p) => p.mesh === best);
    if (pi >= 0) physics.splice(pi, 1);
    // 抓取点保持：记录手柄局部坐标系下的相对位置与朝向，抓边缘不再瞬移，
    // 转动手腕时碎片自然跟随（之前是碎片中心直接贴到手柄位置）
    c.getWorldPosition(_tp);
    c.getWorldQuaternion(_tq);
    const inv = _tq.clone().invert();
    const offset = best.position.clone().sub(_tp).applyQuaternion(inv);
    const quatOffset = inv.clone().multiply(best.quaternion.clone());
    state.grabbing.set(hand, { mesh: best, offset, quatOffset });
    best.userData.grabbedBy = hand;
    c.userData.tip.material.color.set(0x6dffa8);
    // 高亮虚影中对应的那一块（先清提示态，避免两套材质替换互相踩）
    clearHint();
    setGhostHighlight(best.userData.pieceIndex);
    sfx.grab();
    haptic(hand, 0.45, 45);
  }
}

function onRelease(hand) {
  const c = state[hand];
  const grab = state.grabbing.get(hand);
  if (grab) {
    const mesh = grab.mesh;
    state.grabbing.delete(hand);
    mesh.userData.grabbedBy = null;
    clearGhostHighlight();
    if (c) c.userData.tip.material.color.set(0xb18cff);
    sfx.drop();
    const placed = trySnap(mesh, hand);
    if (!placed) {
      physics.push({ mesh, vy: 0, wx: (Math.random() - 0.5) * 1.2, wz: (Math.random() - 0.5) * 1.2 });
      haptic(hand, 0.18, 30);
    }
  }
}

// 握键（squeeze）：
//   拿着碎片 → 送回散落点（找回，防止掉到够不着的地方）
//   空手     → 打开/关闭跟随玩家的 VR 菜单
function onSqueeze(hand) {
  const c = state[hand];
  if (!c) return;
  const grab = state.grabbing.get(hand);
  if (grab) {
    const mesh = grab.mesh;
    state.grabbing.delete(hand);
    mesh.userData.grabbedBy = null;
    clearGhostHighlight();
    if (c) c.userData.tip.material.color.set(0xb18cff);
    const pi = physics.findIndex((p) => p.mesh === mesh);
    if (pi >= 0) physics.splice(pi, 1);
    mesh.position.copy(mesh.userData.home.pos);
    mesh.quaternion.copy(mesh.userData.home.q);
    sfx.drop();
    haptic(hand, 0.3, 35);
    return;
  }
  if (state.mode === 'playing' || state.mode === 'won') {
    toggleVrMenu(!vrMenu.enabled);
    sfx.ui();
    haptic(hand, 0.25, 30);
  }
}

// 摇杆旋转（抓取中）：左/右 = 绕手柄本地 Y 轴旋转；上/下 = 绕本地 X 轴俯仰。
// 直接改 quatOffset（不碰手柄姿态），松手后旋转结果保留。
const STICK_DEAD = 0.15, STICK_YAW = 1.9, STICK_PITCH = 1.2;
function applyStickRotation(grab, x, y, dt) {
  if (Math.abs(x) < STICK_DEAD && Math.abs(y) < STICK_DEAD) return;
  const yaw = (Math.abs(x) > STICK_DEAD ? x - Math.sign(x) * STICK_DEAD : 0) * STICK_YAW * dt;
  const pitch = (Math.abs(y) > STICK_DEAD ? y - Math.sign(y) * STICK_DEAD : 0) * STICK_PITCH * dt;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
  grab.quatOffset.premultiply(q).normalize();
}

// 吸附判定：位置接近 + 朝向接近 → 平滑吸附到目标。返回是否吸附成功。
function trySnap(mesh, hand) {
  const target = mesh.userData.target;
  const tp = new THREE.Vector3(), tq = new THREE.Quaternion();
  target.getWorldPosition(tp);
  target.getWorldQuaternion(tq);
  const dist = mesh.position.distanceTo(tp);
  const dot = Math.abs(mesh.quaternion.dot(tq)); // 四元数双覆盖：|dot| 表示旋转差
  if (dist < mesh.userData.snapDist && dot > mesh.userData.snapCos) {
    mesh.userData.placed = true;
    state.placedCount++;
    state.lastPlacement = performance.now();
    if (hint.idx === mesh.userData.pieceIndex) clearHint(); // 提示目标已归位
    $('placed-counter').textContent = `${state.placedCount} / ${state.pieces.length}`;
    // 平滑吸附动画
    const from = mesh.position.clone(), fromQ = mesh.quaternion.clone();
    const t0 = performance.now();
    const anim = () => {
      const k = Math.min(1, (performance.now() - t0) / 220);
      const e = 1 - Math.pow(1 - k, 3);
      mesh.position.lerpVectors(from, tp, e);
      mesh.quaternion.slerpQuaternions(fromQ, tq, e);
      if (k < 1) requestAnimationFrame(anim);
    };
    anim();
    sfx.snap();
    spawnSnapRing(tp.clone());
    if (hand) haptic(hand, 0.9, 90);
    if (state.placedCount === state.pieces.length) winGame();
    return true;
  }
  return false;
}

// 胜利后按扳机重新打开菜单（开始按钮 = 再来一局）
function winGame() {
  state.mode = 'won';
  state.winTime = performance.now();
  const secs = Math.round((state.winTime - state.startTime) / 1000);
  $('win-time').textContent = state.practice ? '练习模式' : `${Math.floor(secs / 60)}分${secs % 60}秒`;
  $('win-model').textContent = `${ghostName()} · ${state.pieces.length} 块${state.practice ? ' · 练习' : ''}`;
  // 成绩入库 + 成就评估（练习模式跳过，不污染记录）
  const res = state.practice
    ? { stars: 0, rec: { bestTime: 0, plays: 0 }, newly: [] }
    : commitResult(state.modelKey, state.pieceCount, secs, state.hintsUsed || 0);
  const starsEl = $('win-stars');
  if (starsEl) starsEl.textContent = state.practice ? '—' : '★'.repeat(res.stars) + '☆'.repeat(3 - res.stars);
  const bestEl = $('win-best');
  if (bestEl) {
    bestEl.textContent = state.practice
      ? '练习模式 · 不计时、不记录成绩'
      : `最佳记录 ${Math.floor(res.rec.bestTime / 60)}分${res.rec.bestTime % 60}秒 · 已玩 ${res.rec.plays} 次`
        + (res.rec.top && res.rec.top.length ? ` · 前三 ${res.rec.top.map((t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`).join(' / ')}` : '');
  }
  // 新解锁成就展示（2D 结算面板 + VR 内浮窗提示）
  const achEl = $('win-achieve');
  const newNames = res.newly.map((id) => {
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    return a ? a.name : id;
  });
  if (newNames.length) showVrToast(`🏆 解锁成就：${newNames.join('、')}`);
  if (achEl) {
    if (newNames.length) {
      achEl.textContent = `🏆 解锁成就：${newNames.join('、')}`;
      achEl.style.display = 'block';
    } else {
      achEl.style.display = 'none';
    }
  }
  $('win').classList.remove('hidden');
  clearHint();
  sfx.win();
  // 胜利彩带：从虚影中心炸开
  if (ghostGroup) {
    const center = new THREE.Vector3();
    ghostGroup.getWorldPosition(center);
    spawnWinBurst(center);
  }
  // 虚影点亮
  if (ghostGroup) ghostGroup.traverse((o) => {
    if (o.isMesh) { o.material.opacity = 0.45; o.material.color.set(0x6dffa8); }
  });
}

let ghostNameCache = '';
function ghostName() {
  if (ghostNameCache) return ghostNameCache;
  const def = MODELS[state.modelKey];
  return def ? `${def.emoji} ${def.name}` : '模型';
}

// ---------------- 游戏流程 ----------------

function startGame(modelKey, n) {
  try { if (music.isEnabled()) music.start(); } catch (e) { /* 音频不可用 */ }
  if (!MODELS[modelKey]) {
    showFatal('关卡加载失败', `未知模型「${modelKey}」。请返回菜单重新选择。`);
    return;
  }
  if (!CUT_TABLE[modelKey] || !CUT_TABLE[modelKey][n]) {
    showFatal('关卡不可用', `「${MODELS[modelKey].name}」不支持 ${n} 块难度（8 块为可选档，部分模型无解）。请选择其他难度。`);
    return;
  }
  state.modelKey = modelKey;
  state.pieceCount = n;
  state.mode = 'playing';
  state.startTime = performance.now();
  state.lastPlacement = state.startTime;
  state.hintsUsed = 0;
  clearHint();
  $('intro').classList.add('hidden');
  $('difficulty').classList.add('hidden');
  $('win').classList.add('hidden');
  $('hud').classList.remove('hidden');
  const otherLink = $('other-game-link');
  if (otherLink) otherLink.style.display = 'none'; // 游戏中隐藏"随机游走"入口，避免遮挡视野
  ghostNameCache = MODELS[modelKey] ? `${MODELS[modelKey].emoji} ${MODELS[modelKey].name}` : '';
  try {
    buildGhostAndPieces(modelKey, n);
  } catch (err) {
    // 切割/几何异常不应让页面白屏：回菜单并给出明确错误
    console.error('[startGame]', err);
    state.mode = 'difficulty';
    showFatal('关卡加载失败', `「${modelKey}」${n} 块加载失败：${err.message}。请返回菜单选择其他关卡。`);
  }
}

// ---------------- 每日挑战 ----------------
// 按日期确定性选模型 + 难度（无需联网）：同一天所有人/所有设备拿到同一个组合。
function dayKey(d = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function dailyChallenge(dateStr = dayKey()) {
  let h = 2166136261 >>> 0; // FNV-1a
  for (const ch of dateStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  // 只在"该模型实际支持的难度"里抽，避免抽到圣诞树 × 8 块这种无解组合
  const combos = [];
  for (const mk of Object.keys(MODELS)) {
    for (const n of DIFFICULTY) {
      if (CUT_TABLE[mk] && CUT_TABLE[mk][n]) combos.push([mk, n]);
    }
  }
  const [modelKey, n] = combos[h % combos.length];
  return { date: dateStr, modelKey, name: MODELS[modelKey].name, emoji: MODELS[modelKey].emoji, n };
}

function showDifficulty() {
  state.mode = 'difficulty';
  $('intro').classList.add('hidden');
  // 页脚"随机游走"链接只在封面显示；菜单内容较长，隐藏避免遮挡成就行
  const otherLink = $('other-game-link');
  if (otherLink) otherLink.style.display = 'none';
  const box = $('difficulty');
  box.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'diff-card';
  const progNow = readProgress();
  const sum = summarize(progNow, totalLevels());
  const unlocked = readAchievements();
  card.innerHTML = `<h2>选择模型与难度</h2>`
    + `<p class="sub" style="color:#8b96b8;font-size:13px;margin:6px 0 10px">`
    + `总进度 ${sum.done}/${sum.total} 关 · 星星 ${sum.stars}/${sum.maxStars} · 成就 ${unlocked.length}/${ACHIEVEMENTS.length}</p>`;

  // 每日挑战（按日期确定性生成）
  const dc = dailyChallenge();
  const dcBtn = document.createElement('button');
  dcBtn.className = 'diff-btn';
  dcBtn.style.cssText = 'width:100%;margin-bottom:10px;border-color:#ffd24d;background:rgba(255,210,77,.10)';
  dcBtn.innerHTML = `<b style="font-size:15px">🎯 今日挑战 · ${dc.emoji} ${dc.name} · ${dc.n} 块</b>`
    + `<span style="font-size:12px;color:#8b96b8">${dc.date} · 每天自动更换</span>`;
  dcBtn.onclick = () => startGameUI(dc.modelKey, dc.n);
  card.appendChild(dcBtn);

  // 排行榜入口：当前模型各难度的本地前三成绩
  const boardBtn = document.createElement('button');
  boardBtn.className = 'diff-btn';
  boardBtn.style.cssText = 'width:100%;margin-bottom:10px;padding:8px 12px';
  boardBtn.innerHTML = '<b style="font-size:14px">🏆 排行榜 · 当前模型前三成绩</b>';
  boardBtn.onclick = () => { sfx.ui(); openBoard(); };
  card.appendChild(boardBtn);

  const row1 = document.createElement('div');
  row1.className = 'diff-row';
  for (const [key, def] of Object.entries(MODELS)) {
    const b = document.createElement('button');
    b.className = 'diff-btn';
    // 星数进度：该模型所有支持难度的星级合计（帮助挑"还没玩过的模型"）
    const modelStars = supportedCounts(key).reduce((s, n) => s + (((progNow[levelKey(key, n)] || {}).stars) || 0), 0);
    const modelMax = supportedCounts(key).length * 3;
    b.innerHTML = `<b style="font-size:22px">${def.emoji}</b><span>${def.name}</span>`
      + `<small style="display:block;color:#ffd24d;font-size:11px;margin-top:2px">★ ${modelStars}/${modelMax}</small>`;
    if (key === state.modelKey) b.style.borderColor = '#6cd0ff';
    b.onclick = () => {
      state.modelKey = key;
      [...row1.children].forEach((x) => (x.style.borderColor = ''));
      b.style.borderColor = '#6cd0ff';
      refreshDiffRows(); // 难度按钮显示"当前模型"每关的星级与最佳时间
      sfx.ui();
    };
    row1.appendChild(b);
  }
  card.appendChild(row1);

  // 难度行：每档显示全模型通关数 + 当前模型的星级/最佳时间
  const row2 = document.createElement('div');
  row2.className = 'diff-row';
  row2.style.marginTop = '10px';
  const diffBtns = [];
  const refreshDiffRows = () => {
    const prog = readProgress();
    for (const { b, n } of diffBtns) {
      const supported = supportedCounts(state.modelKey).includes(n);
      const supportCount = MODEL_KEYS.filter((mk) => supportedCounts(mk).includes(n)).length;
      const done = MODEL_KEYS.filter((mk) => ((prog[levelKey(mk, n)] || {}).stars || 0) > 0).length;
      const rec = prog[levelKey(state.modelKey, n)];
      const recTxt = !supported
        ? '该模型无此难度'
        : (rec && rec.stars > 0
          ? `${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)} ${Math.floor(rec.bestTime / 60)}分${rec.bestTime % 60}秒`
          : '未挑战');
      b.disabled = !supported;
      b.style.opacity = supported ? '1' : '0.45';
      b.style.cursor = supported ? 'pointer' : 'not-allowed';
      b.onclick = supported ? () => startGameUI(state.modelKey, n) : null;
      b.innerHTML = `<b style="font-size:18px">${n} 块</b><span>${DIFFICULTY_NAME[n]}</span>`
        + `<small style="display:block;color:#ffd24d;font-size:12px;margin-top:3px">⭐ ${done}/${supportCount} 关</small>`
        + `<small style="display:block;color:#9fb0d8;font-size:11px;margin-top:2px">${recTxt}</small>`;
    }
  };
  for (const n of DIFFICULTY) {
    const b = document.createElement('button');
    b.className = 'diff-btn';
    b.onclick = () => startGameUI(state.modelKey, n);
    row2.appendChild(b);
    diffBtns.push({ b, n });
  }
  card.appendChild(row2);
  refreshDiffRows();

  // 配色皮肤行
  const palLabel = document.createElement('p');
  palLabel.className = 'sub';
  palLabel.style.cssText = 'color:#8b96b8;font-size:13px;margin:12px 0 6px';
  palLabel.textContent = '配色皮肤';
  card.appendChild(palLabel);
  const row3 = document.createElement('div');
  row3.className = 'diff-row';
  for (const [pkey, pdef] of Object.entries(PALETTES)) {
    const b = document.createElement('button');
    b.className = 'diff-btn';
    b.style.cssText = 'min-width:86px;padding:8px 12px';
    b.innerHTML = `<b style="font-size:16px">${pdef.emoji}</b><span>${pdef.name}</span>`;
    if (pkey === state.palette) b.style.borderColor = '#6cd0ff';
    b.onclick = () => {
      state.palette = pkey;
      savePalette(pkey);
      sfx.ui();
      [...row3.children].forEach((x) => (x.style.borderColor = ''));
      b.style.borderColor = '#6cd0ff';
    };
    row3.appendChild(b);
  }
  card.appendChild(row3);

  // 场景主题（背景/雾/灯光色调）
  const row3b = document.createElement('div');
  row3b.className = 'diff-row';
  row3b.style.marginTop = '8px';
  const themeBtns = [];
  for (const [tkey, tdef] of Object.entries(SCENE_THEMES)) {
    const b = document.createElement('button');
    b.className = 'diff-btn';
    b.style.cssText = 'min-width:80px;padding:8px 10px';
    b.innerHTML = `<b style="font-size:16px">${tdef.emoji}</b><span>${tdef.name}</span>`;
    if (tkey === state.theme) b.style.borderColor = '#6cd0ff';
    b.onclick = () => {
      applyTheme(tkey);
      themeBtns.forEach((x) => (x.style.borderColor = ''));
      b.style.borderColor = '#6cd0ff';
      sfx.ui();
    };
    themeBtns.push(b);
    row3b.appendChild(b);
  }
  card.appendChild(row3b);

  // 磁吸辅助开关（接近目标时轻拉对齐，降低精细对准难度）
  const row4 = document.createElement('div');
  row4.className = 'diff-row';
  row4.style.marginTop = '8px';
  const assistBtn = document.createElement('button');
  assistBtn.className = 'diff-btn';
  assistBtn.style.cssText = 'min-width:170px;padding:8px 12px';
  const refreshAssistBtn = () => {
    assistBtn.innerHTML = `<b style="font-size:14px">磁吸辅助：${state.assist ? '开' : '关'}</b>`
      + `<span style="font-size:12px;color:#8b96b8">接近目标时轻拉对齐</span>`;
    assistBtn.style.borderColor = state.assist ? '#6cd0ff' : '';
  };
  refreshAssistBtn();
  assistBtn.onclick = () => {
    state.assist = !state.assist;
    saveAssist(state.assist);
    refreshAssistBtn();
    sfx.ui();
  };
  row4.appendChild(assistBtn);

  // 练习模式开关（不计时、不记录成绩，纯休闲）
  const practiceBtn = document.createElement('button');
  practiceBtn.className = 'diff-btn';
  practiceBtn.style.cssText = 'min-width:170px;padding:8px 12px';
  const refreshPracticeBtn = () => {
    practiceBtn.innerHTML = `<b style="font-size:14px">练习模式：${state.practice ? '开' : '关'}</b>`
      + `<span style="font-size:12px;color:#8b96b8">不计时、不记录成绩</span>`;
    practiceBtn.style.borderColor = state.practice ? '#6cd0ff' : '';
  };
  refreshPracticeBtn();
  practiceBtn.onclick = () => {
    state.practice = !state.practice;
    savePractice(state.practice);
    refreshPracticeBtn();
    sfx.ui();
  };
  row4.appendChild(practiceBtn);
  card.appendChild(row4);

  // 成就栏（🔒 未解锁 / 🏆 已解锁，悬停看条件）
  const achLabel = document.createElement('p');
  achLabel.className = 'sub';
  achLabel.style.cssText = 'color:#8b96b8;font-size:13px;margin:12px 0 4px';
  achLabel.textContent = `成就 ${unlocked.length}/${ACHIEVEMENTS.length}`;
  card.appendChild(achLabel);
  const achRow = document.createElement('div');
  achRow.className = 'diff-row';
  achRow.style.cssText = 'gap:6px;font-size:12px';
  for (const a of ACHIEVEMENTS) {
    const got = unlocked.includes(a.id);
    const s = document.createElement('span');
    s.title = a.desc;
    s.style.cssText = `padding:4px 8px;border-radius:8px;border:1px solid ${got ? 'rgba(255,210,77,.5)' : 'rgba(140,165,255,.18)'};`
      + `color:${got ? '#ffd24d' : '#6b7699'};background:${got ? 'rgba(255,210,77,.10)' : 'transparent'}`;
    s.textContent = `${got ? '🏆' : '🔒'} ${a.name}`;
    achRow.appendChild(s);
  }
  card.appendChild(achRow);

  box.appendChild(card);
  box.classList.remove('hidden');
}

// ---------------- VR 内菜单（3D 面板 + 手柄射线点击） ----------------
// 菜单跟随玩家：每次打开时出现在视线前方 0.8m，打开期间平滑跟随头部，
// 玩家走动后不用回头找。按钮 = 发光小方块网格；扳机射线命中即点击。
const vrMenu = { group: null, buttons: [], enabled: false };

function buildVrMenu() {
  const g = new THREE.Group();

  const BG_W = 1.16, BG_H = 1.02;
  const bg = new THREE.Mesh(
    new THREE.BoxGeometry(BG_W, BG_H, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x141b33, roughness: 0.7, transparent: true, opacity: 0.96 })
  );
  g.add(bg);

  const title = makeTextSprite('选择模型与难度', { size: 56, color: '#dfe7ff' });
  fitSprite(title, 0.92, 0.13);
  title.position.set(0, 0.425, 0.02);
  g.add(title);

  // 模型网格：每行 4 个，共 2 行（8 模型）
  const modelDefs = Object.entries(MODELS);
  const COLS = 4;
  modelDefs.forEach(([key, def], i) => {
    const b = makeVrButton(def.emoji, () => {
      state.modelKey = key;
      refreshVrMenu();
      sfx.ui();
    });
    const col = i % COLS, row = Math.floor(i / COLS);
    // 模型数可能增长（当前 10 个 → 4 列 3 行），行距 0.135 保证按钮不重叠
    b.position.set((col - (COLS - 1) / 2) * 0.275, 0.30 - row * 0.135, 0.02);
    b.userData.modelKey = key;
    g.add(b);
    vrMenu.buttons.push(b);
  });

  // 块数行（2/3/4/6/8，5 个窄按钮）
  DIFFICULTY.forEach((n, i) => {
    const b = makeVrButton(`${n}块`, () => {
      if (!supportedCounts(state.modelKey).includes(n)) {
        showVrToast(`「${MODELS[state.modelKey].name}」不支持 ${n} 块`);
        return;
      }
      state.pieceCount = n;
      refreshVrMenu();
      sfx.ui();
    }, 0.19);
    b.position.set((i - (DIFFICULTY.length - 1) / 2) * 0.205, -0.10, 0.02);
    b.userData.count = n;
    g.add(b);
    vrMenu.buttons.push(b);
  });

  // 底部一行：开始 / 提示 / 配色 / 音乐 / 进度（5 个窄按钮，等距排布）
  const bottomY = -0.31;
  const BOTTOM_W = 0.20;
  const bottomX = (i) => (i - 2) * 0.215;

  const start = makeVrButton('开始', () => {
    sfx.ui();
    startGameUI(state.modelKey, state.pieceCount);
    toggleVrMenu(false);
  }, BOTTOM_W);
  start.position.set(bottomX(0), bottomY, 0.02);
  start.userData.action = 'start';
  g.add(start);
  vrMenu.buttons.push(start);

  const hintBtn = makeVrButton('提示', () => {
    sfx.ui();
    triggerHint();
    refreshVrMenu();
  }, BOTTOM_W);
  hintBtn.position.set(bottomX(1), bottomY, 0.02);
  hintBtn.userData.action = 'hint';
  g.add(hintBtn);
  vrMenu.buttons.push(hintBtn);

  // 配色：循环切换皮肤；游戏中切换会以新配色重开当前关卡（几何不变，切割表通用）
  const paletteKeys = Object.keys(PALETTES);
  const paletteBtn = makeVrButton('配色', () => {
    const idx = Math.max(0, paletteKeys.indexOf(state.palette));
    state.palette = paletteKeys[(idx + 1) % paletteKeys.length];
    savePalette(state.palette);
    sfx.ui();
    if (state.mode === 'playing') {
      startGameUI(state.modelKey, state.pieceCount); // 立即以新配色重开
      toggleVrMenu(false);
    }
  }, BOTTOM_W);
  paletteBtn.position.set(bottomX(2), bottomY, 0.02);
  paletteBtn.userData.action = 'palette';
  g.add(paletteBtn);
  vrMenu.buttons.push(paletteBtn);

  const musicBtn = makeVrButton('音乐', () => {
    const on = music.toggle();
    updateMusicButton();
    sfx.ui();
    if (on) music.start();
  }, BOTTOM_W);
  musicBtn.position.set(bottomX(3), bottomY, 0.02);
  musicBtn.userData.action = 'music';
  g.add(musicBtn);
  vrMenu.buttons.push(musicBtn);

  // 进度页入口（VR 内查看关卡星级与成就）
  const progressBtn = makeVrButton('进度', () => {
    sfx.ui();
    showVrPage('progress');
  }, BOTTOM_W);
  progressBtn.position.set(bottomX(4), bottomY, 0.02);
  progressBtn.userData.action = 'progress';
  g.add(progressBtn);
  vrMenu.buttons.push(progressBtn);

  // 进度页（默认隐藏；与主页面互斥显示）
  const progressPage = new THREE.Group();
  progressPage.visible = false;
  g.add(progressPage);
  vrMenu.progressPage = progressPage;

  // VR 面板整体缩小 0.42 倍：1.16m 宽面板放在 0.7m 处视场占比过大（约 80°），
  // 缩小后约 38°，接近 VR 菜单的舒适视角
  g.scale.setScalar((state.tuning && state.tuning.menuScale) || 0.42);
  vrMenu.group = g;
  g.visible = false;
  scene.add(g); // 场景级：位置每次打开时按玩家头部姿态计算
}

// 主页面 ⇄ 进度页
function showVrPage(pageName) {
  const g = vrMenu.group;
  if (!g || !vrMenu.progressPage) return;
  vrMenu.page = pageName;
  if (pageName === 'progress') refreshVrProgress();
  for (const c of g.children) {
    c.visible = pageName === 'progress' ? c === vrMenu.progressPage : c !== vrMenu.progressPage;
  }
}

// 重建进度页内容（每次打开都刷新，保证数值是最新的）
function refreshVrProgress() {
  const page = vrMenu.progressPage;
  if (!page) return;
  for (let i = page.children.length - 1; i >= 0; i--) {
    const c = page.children[i];
    page.remove(c);
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      if (c.material.map) c.material.map.dispose();
      c.material.dispose();
    }
  }
  const lines = [];
  const bg = new THREE.Mesh(
    new THREE.BoxGeometry(1.16, 1.32, 0.02),
    new THREE.MeshStandardMaterial({ color: 0x141b33, roughness: 0.7, transparent: true, opacity: 0.97 })
  );
  page.add(bg);
  const addText = (text, y, opts = {}) => {
    const sp = makeTextSprite(text, { size: opts.size || 44, color: opts.color || '#dfe7ff' });
    fitSprite(sp, opts.w || 0.95, opts.h || 0.085);
    sp.position.set(opts.x || 0, y, 0.02);
    page.add(sp);
    lines.push(text);
  };

  const prog = readProgress();
  const sum = summarize(prog);
  const unlocked = readAchievements();
  addText('进度总览', 0.56, { size: 56, w: 0.66, h: 0.10 });
  addText(`关卡 ${sum.done}/${sum.total} · 星星 ${sum.stars}/${sum.maxStars}`, 0.43, { color: '#9fd8ff' });
  addText(`成就 ${unlocked.length}/${ACHIEVEMENTS.length}`, 0.34, { color: '#ffd24d' });
  const def = MODELS[state.modelKey] || { emoji: '🧩', name: '模型' };
  addText(`${def.emoji} ${def.name}`, 0.23, { size: 48 });
  DIFFICULTY.forEach((n, i) => {
    const supported = supportedCounts(state.modelKey).includes(n);
    const rec = prog[levelKey(state.modelKey, n)];
    const has = rec && rec.stars > 0;
    const txt = !supported
      ? `${n} 块（该模型不支持）`
      : (has
        ? `${n} 块 ${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}  ${Math.floor(rec.bestTime / 60)}:${String(rec.bestTime % 60).padStart(2, '0')}`
        : `${n} 块 未挑战`);
    addText(txt, 0.135 - i * 0.075, { size: 32, color: has ? '#dfe7ff' : '#7c88a8', w: 0.55, h: 0.05 });
  });
  ACHIEVEMENTS.forEach((a, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const got = unlocked.includes(a.id);
    addText(`${got ? '🏆' : '🔒'} ${a.name}`, -0.27 - row * 0.082, {
      size: 28, color: got ? '#ffd24d' : '#6b7699', x: col ? 0.24 : -0.24, w: 0.40, h: 0.048,
    });
  });
  const back = makeVrButton('返回', () => { sfx.ui(); showVrPage('main'); }, 0.22);
  back.position.set(0, -0.6, 0.02);
  page.add(back);
  vrMenu.progressLines = lines;
}

// ---------------- VR 内浮窗提示（成就解锁等） ----------------
const vrToast = { sprite: null, until: 0, text: '' };
function clearVrToast() {
  if (vrToast.sprite) {
    scene.remove(vrToast.sprite);
    if (vrToast.sprite.material.map) vrToast.sprite.material.map.dispose();
    vrToast.sprite.material.dispose();
    vrToast.sprite = null;
  }
  vrToast.until = 0;
  vrToast.text = '';
}
function showVrToast(text, seconds = 3.2) {
  clearVrToast();
  const sp = makeTextSprite(text, { size: 44, color: '#ffd24d' });
  fitSprite(sp, 0.80, 0.09);
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const cp = new THREE.Vector3(); cam.getWorldPosition(cp);
  const cq = new THREE.Quaternion(); cam.getWorldQuaternion(cq);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cq);
  sp.position.copy(cp).addScaledVector(fwd, 0.75);
  sp.position.y -= 0.06;
  scene.add(sp);
  vrToast.sprite = sp;
  vrToast.text = text;
  vrToast.until = performance.now() + seconds * 1000;
}

// 把菜单摆到玩家视线前方：沿视线方向 0.7m，俯仰限幅 [-0.5, -0.05]——
// 往下看桌子时不会把菜单沉到桌面，平视时略低于视线，始终在视野内。
function positionMenuInFront(snap = false) {
  if (!vrMenu.group) return;
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const cp = new THREE.Vector3();
  cam.getWorldPosition(cp);
  const cq = new THREE.Quaternion();
  cam.getWorldQuaternion(cq);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cq);
  dir.y = Math.max(-0.5, Math.min(-0.05, dir.y));
  dir.normalize();
  const dist = (state.tuning && state.tuning.menuDist) || 0.70;
  const target = cp.clone().addScaledVector(dir, dist);
  if (snap) {
    vrMenu.group.position.copy(target);
  } else {
    vrMenu.group.position.lerp(target, 0.18);
  }
  vrMenu.group.lookAt(cp.x, cp.y, cp.z); // 面板始终正对玩家
}

function makeVrButton(label, onClick, width = 0.26) {
  const b = new THREE.Group();
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.11, 0.012),
    new THREE.MeshStandardMaterial({ color: 0x27335e, roughness: 0.5, emissive: 0x000000 })
  );
  b.add(pad);
  const txt = makeTextSprite(label, { size: 48, color: '#dfe7ff' });
  fitSprite(txt, Math.min(0.22, width * 0.86), 0.085);
  txt.position.z = 0.01;
  b.add(txt);
  b.userData.onClick = onClick;
  b.userData.pad = pad;
  b.userData.label = label;
  return b;
}

// 用 canvas 画字 → Sprite（避免引入字体加载依赖）
// Canvas 文字精灵：画布宽度按文字实测宽度动态生成，避免长文本被裁掉；
// userData.aspect 供 fitSprite 做等比缩放（否则文字会被拉扁）。
function makeTextSprite(text, { size = 48, color = '#ffffff' } = {}) {
  const font = `${size}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  const textW = Math.ceil(probe.measureText(text).width);
  const pad = Math.ceil(size * 0.35);
  const w = Math.max(32, textW + pad * 2);
  const h = Math.ceil(size * 1.5);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c2d = cv.getContext('2d');
  c2d.font = font;
  c2d.fillStyle = color;
  c2d.textAlign = 'center';
  c2d.textBaseline = 'middle';
  c2d.fillText(text, w / 2, h / 2 + size * 0.04);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.renderOrder = 10;
  sp.userData.aspect = w / h;
  return sp;
}

// 等比缩放到给定最大宽/高（保持文字比例）
function fitSprite(sp, maxW, maxH) {
  const a = sp.userData.aspect || 4;
  let w = maxW;
  let h = w / a;
  if (h > maxH) { h = maxH; w = h * a; }
  sp.scale.set(w, h, 1);
  return sp;
}

function refreshVrMenu() {
  for (const b of vrMenu.buttons) {
    const active = (b.userData.modelKey && b.userData.modelKey === state.modelKey)
      || (b.userData.count && b.userData.count === state.pieceCount)
      || b.userData.action === 'start';
    b.userData.pad.material.emissive.setHex(active ? 0x2a5f8f : 0x000000);
  }
}

function toggleVrMenu(on) {
  vrMenu.enabled = on;
  if (vrMenu.group) vrMenu.group.visible = on;
  if (on) {
    showVrPage('main'); // 每次打开先回主页面（进度页只是二级页）
    refreshVrMenu();
    positionMenuInFront(true); // 打开时立即摆到视线前方
  }
}

// 手柄扳机在菜单模式下的点击：射线从手柄原点沿 -Z 方向，命中按钮即触发
const _raycaster = new THREE.Raycaster();
function vrMenuClick(hand) {
  if (!vrMenu.enabled) { toggleVrMenu(true); return; } // 菜单未开时按扳机 = 打开菜单
  const c = state[hand];
  if (!c || !vrMenu.group) return;
  const origin = c.getWorldPosition(new THREE.Vector3());
  const dir = c.getWorldDirection(new THREE.Vector3());
  _raycaster.set(origin, dir); // 真正从手柄发射（setFromCamera 会忽略这里传入的原点）
  const hits = _raycaster.intersectObjects(vrMenu.group.children, true);
  for (const h of hits) {
    let o = h.object;
    while (o && !o.userData.onClick) o = o.parent;
    if (o) { o.userData.onClick(); haptic(hand, 0.25, 25); return; }
  }
}

// ---------------- 主循环 ----------------

function animate() {
  // 松手物理：自由落体 → 斜坡/地面弹跳 → 静止
  for (let i = physics.length - 1; i >= 0; i--) {
    const p = physics[i];
    p.vy += GRAVITY * FRAME_DT;
    p.mesh.position.y += p.vy * FRAME_DT;
    p.mesh.rotation.x += p.wx * FRAME_DT;
    p.mesh.rotation.z += p.wz * FRAME_DT;
    const ground = slopeHeightAt(p.mesh.position.x, p.mesh.position.z);
    if (p.mesh.position.y < ground + 0.10) {
      p.mesh.position.y = ground + 0.10;
      if (Math.abs(p.vy) > 0.4) {
        p.vy = -p.vy * RESTITUTION;
        p.wx *= 0.5; p.wz *= 0.5;
        sfx.land();
      } else {
        physics.splice(i, 1); // 静止
      }
    }
  }

  // 抓取跟随：保持抓取时的相对偏移（抓边缘不瞬移），摇杆可旋转拼片
  for (const [hand, grab] of state.grabbing) {
    const c = state[hand];
    if (!c) continue;
    c.getWorldPosition(_tp);
    c.getWorldQuaternion(_tq);
    // 摇杆旋转（Pico 手柄 axes[2]/[3] 为摇杆；兼容只有 2 轴的设备）
    const gp = c.userData.inputSource && c.userData.inputSource.gamepad;
    if (gp && gp.axes && gp.axes.length) {
      const ax = gp.axes.length >= 4 ? gp.axes[2] : gp.axes[0];
      const ay = gp.axes.length >= 4 ? gp.axes[3] : gp.axes[1];
      applyStickRotation(grab, ax || 0, ay || 0, FRAME_DT);
    }
    const mesh = grab.mesh;
    mesh.position.copy(_tp).add(grab.offset.clone().applyQuaternion(_tq));
    mesh.quaternion.copy(_tq).multiply(grab.quatOffset);
    // 磁吸辅助：接近目标时朝目标轻拉（可在菜单关闭）
    magnetStep(hand);
    // 距目标足够近时给提示色（快吸附了）
    const tp = new THREE.Vector3();
    mesh.userData.target.getWorldPosition(tp);
    const near = mesh.position.distanceTo(tp) < mesh.userData.snapDist * 1.6;
    mesh.material.emissive.setHex(near ? 0x1a5f2a : 0x000000);
  }

  // 提示系统推进：光柱脉动、卡住自动触发、超时清除
  const nowMs = performance.now();
  if (hint.pillar) {
    const k = (nowMs % 1200) / 1200;
    hint.pillar.material.opacity = 0.22 + 0.25 * (0.5 + 0.5 * Math.sin(k * Math.PI * 2));
    hint.pillar.scale.setScalar(1 + 0.05 * Math.sin(k * Math.PI * 2));
    if (nowMs > hint.until) clearHint();
  } else if (state.mode === 'playing' && nowMs - (state.lastPlacement || state.startTime) > 25000) {
    triggerHint(); // 卡住 25 秒自动提示
  }
  // 被提示的碎片发光脉动
  for (const mesh of state.pieces) {
    if (mesh.userData.hintUntil && nowMs < mesh.userData.hintUntil && !mesh.userData.placed && !mesh.userData.grabbedBy) {
      const pulse = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(nowMs / 180));
      mesh.material.emissive.setRGB(0.10 * pulse, 0.60 * pulse, 0.25 * pulse);
    } else if (mesh.userData.hintUntil && nowMs >= mesh.userData.hintUntil) {
      delete mesh.userData.hintUntil;
      if (!mesh.userData.grabbedBy && !mesh.userData.placed) mesh.material.emissive.setHex(0x000000);
    }
  }

  // VR 菜单跟随（打开时平滑跟随头部）
  if (vrMenu.enabled) positionMenuInFront(false);

  // VR 浮窗提示淡出
  if (vrToast.sprite) {
    const left = vrToast.until - nowMs;
    if (left <= 0) clearVrToast();
    else vrToast.sprite.material.opacity = Math.min(1, left / 600);
  }

  // 计时器
  if (state.mode === 'playing') {
    const s = Math.floor((performance.now() - state.startTime) / 1000);
    $('timer').textContent = state.practice
      ? '练习中'
      : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  // 碎片投影：贴在斜坡表面上（已吸附/被抓住的碎片不投影）
  for (const mesh of state.pieces) {
    const sh = mesh.userData.shadow;
    if (!sh) continue;
    const held = mesh.userData.grabbedBy;
    const show = !mesh.userData.placed && !held;
    sh.visible = show;
    if (show) {
      sh.position.set(mesh.position.x, slopeHeightAt(mesh.position.x, mesh.position.z) + 0.012, mesh.position.z);
    }
  }

  // 特效推进：吸附光环（放大渐隐）/ 胜利彩带（重力 + 渐隐）
  const dt = FRAME_DT;
  for (let i = fxList.length - 1; i >= 0; i--) {
    const fx = fxList[i];
    fx.t += dt;
    const k = fx.t / fx.life;
    if (k >= 1) {
      scene.remove(fx.obj);
      fx.obj.geometry.dispose();
      fx.obj.material.dispose();
      fxList.splice(i, 1);
      continue;
    }
    if (fx.kind === 'ring') {
      const s = 1 + k * 7;
      fx.obj.scale.setScalar(s);
      fx.obj.material.opacity = 0.95 * (1 - k);
      fx.obj.lookAt(camera.getWorldPosition(new THREE.Vector3()));
    } else if (fx.kind === 'burst') {
      const p = fx.obj.geometry.attributes.position;
      for (let j = 0; j < fx.vel.length; j++) {
        fx.vel[j].y -= 2.4 * dt;
        p.array[j * 3] += fx.vel[j].x * dt;
        p.array[j * 3 + 1] += fx.vel[j].y * dt;
        p.array[j * 3 + 2] += fx.vel[j].z * dt;
      }
      p.needsUpdate = true;
      fx.obj.material.opacity = 1 - k;
    }
  }

  // 虚影呼吸
  if (ghostGroup && (state.mode === 'playing' || state.mode === 'difficulty')) {
    const t = performance.now() / 1000;
    ghostGroup.position.y = 0.05 + Math.sin(t * 1.4) * 0.02;
    ghostGroup.rotation.y = Math.sin(t * 0.5) * 0.05;
  }

  // 画质自适应（每 2 秒评估一次帧率）
  tickQuality(nowMs);

  renderer.render(scene, camera);
}

// ---------------- 手感设置面板 ----------------

const TUNING_OPTIONS = [
  { key: 'magnet', label: '磁吸强度', opts: [['关', 0], ['弱', 0.05], ['中', 0.10], ['强', 0.18]] },
  { key: 'haptic', label: '震动强度', opts: [['关', 0], ['弱', 0.6], ['中', 1], ['强', 1.5]] },
  { key: 'menuDist', label: 'VR 菜单距离', opts: [['近', 0.55], ['标准', 0.70], ['远', 0.85]] },
  { key: 'menuScale', label: 'VR 菜单大小', opts: [['小', 0.36], ['标准', 0.42], ['大', 0.50]] },
];

function buildSettingsUI() {
  const body = $('settings-body');
  if (!body) return;
  body.innerHTML = '';
  for (const row of TUNING_OPTIONS) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:10px 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    const label = document.createElement('span');
    label.textContent = row.label;
    label.style.cssText = 'font-size:14px;color:#cfd9f5;min-width:96px';
    wrap.appendChild(label);
    const btns = [];
    for (const [txt, val] of row.opts) {
      const b = document.createElement('button');
      b.className = 'diff-btn';
      b.style.cssText = 'padding:6px 10px;min-width:56px';
      b.textContent = txt;
      const refresh = () => { b.style.borderColor = state.tuning[row.key] === val ? '#6cd0ff' : ''; };
      refresh();
      b.onclick = () => {
        state.tuning[row.key] = val;
        saveTuning(state.tuning);
        btns.forEach((x) => x.refresh());
        applyTuning();
        sfx.ui();
      };
      b.refresh = refresh;
      btns.push(b);
      wrap.appendChild(b);
    }
    body.appendChild(wrap);
  }
  const p = document.createElement('p');
  p.style.cssText = 'font-size:12px;color:#8b96b8;margin:12px 0 0;line-height:1.6';
  p.textContent = '磁吸强度影响"接近目标时轻拉"的力度；震动强度作用于抓取/吸附/松手反馈；VR 菜单距离与大小立即生效。';
  body.appendChild(p);
}

function openSettings() { buildSettingsUI(); $('settings').classList.remove('hidden'); }
function closeSettings() { $('settings').classList.add('hidden'); }

// 应用手感参数（菜单缩放；菜单开启时重新定位）
function applyTuning() {
  if (vrMenu.group) vrMenu.group.scale.setScalar(state.tuning.menuScale);
  if (vrMenu.enabled) positionMenuInFront(true);
}

// 打开方式提示：file:// 或非本机 http:// 下 WebXR 可能不可用
function protocolHint(protocol, hostname) {
  if (protocol === 'file:') return '⚠️ 当前通过 file:// 打开：Pico 浏览器可能不提供 WebXR。建议安装 APK 版，或改用 https:// 地址。';
  if (protocol === 'http:' && hostname !== 'localhost' && hostname !== '127.0.0.1') {
    return '⚠️ 当前通过 http:// 打开：非本机地址需要 HTTPS 才能使用 WebXR。请改用 https:// 或 APK 版。';
  }
  return '';
}

// ---------------- 本地排行榜面板 ----------------

let boardMode = 'model';

function fmtTime(t) {
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function buildBoardUI(mode = boardMode) {
  const body = $('board-body');
  if (!body) return;
  boardMode = mode === 'global' ? 'global' : 'model';
  const prog = readProgress();
  const def = MODELS[state.modelKey] || { emoji: '🧩', name: '模型' };
  if ($('board-title')) {
    $('board-title').textContent = boardMode === 'global'
      ? '🏆 全模型总榜 · 各难度最快'
      : `🏆 ${def.emoji} ${def.name} · 本地排行`;
  }
  if ($('board-tab-model')) $('board-tab-model').style.borderColor = boardMode === 'model' ? '#6cd0ff' : '';
  if ($('board-tab-global')) $('board-tab-global').style.borderColor = boardMode === 'global' ? '#6cd0ff' : '';
  body.innerHTML = '';
  const sum = summarize(prog, totalLevels());
  const head = document.createElement('div');
  head.style.cssText = 'margin:0 0 10px;color:#9fb0d8;font-size:13px;text-align:center';
  head.textContent = `总进度 ${sum.done}/${sum.total} 关 · 星星 ${sum.stars}/${sum.maxStars} · 最佳总时长 `
    + (sum.bestTotal ? `${Math.floor(sum.bestTotal / 60)}分${sum.bestTotal % 60}秒` : '—');
  body.appendChild(head);

  const mkRow = (title, right, line) => {
    const row = document.createElement('div');
    row.className = 'board-level';
    row.style.cssText = 'margin:8px 0;padding:8px 10px;border:1px solid rgba(140,165,255,.25);border-radius:10px;background:rgba(39,51,94,.35)';
    row.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">`
      + `<b>${title}</b><span style="color:#ffd24d">${right}</span></div>`
      + `<div style="color:#9fb0d8;font-size:12px;margin-top:4px">${line}</div>`;
    body.appendChild(row);
  };

  if (boardMode === 'global') {
    // 全模型总榜：每个难度取所有模型里的最快 3 条
    for (const n of DIFFICULTY) {
      const items = [];
      for (const mk of MODEL_KEYS) {
        const rec = prog[levelKey(mk, n)];
        if (rec && rec.bestTime) items.push({ mk, t: rec.bestTime, stars: rec.stars || 0 });
      }
      items.sort((a, b) => a.t - b.t);
      const top = items.slice(0, 3);
      const line = top.length
        ? top.map((it, i) => `${i + 1}. ${MODELS[it.mk] ? MODELS[it.mk].emoji : ''}${MODELS[it.mk] ? MODELS[it.mk].name : it.mk} ${fmtTime(it.t)}`).join('　')
        : '暂无记录';
      mkRow(`${n} 块 · ${DIFFICULTY_NAME[n] || ''}`, `${items.length} 个模型有记录`, `前三：${line}`);
    }
  } else {
    for (const n of supportedCounts(state.modelKey)) {
      const rec = prog[levelKey(state.modelKey, n)];
      const top = (rec && Array.isArray(rec.top)) ? rec.top : [];
      const topTxt = top.length ? top.map((t, i) => `${i + 1}. ${fmtTime(t)}`).join('　') : '暂无记录';
      const starTxt = rec && rec.stars ? `${'★'.repeat(rec.stars)}${'☆'.repeat(3 - rec.stars)}` : '未挑战';
      mkRow(`${n} 块 · ${DIFFICULTY_NAME[n] || ''}`, starTxt, `前三：${topTxt}`);
    }
    if (!supportedCounts(state.modelKey).length) body.textContent = '该模型暂无可玩难度';
  }
}

function openBoard() { boardMode = 'model'; buildBoardUI(); $('board').classList.remove('hidden'); }
function closeBoard() { $('board').classList.add('hidden'); }

// ---------------- 首次上手引导 ----------------
// 只在"真实 UI 开局"时出现一次；测试/脚本直接调 startGame 不触发，避免干扰自动化。
const TUTORIAL_KEY = '{{SECRET_9m4qv7ta}}';
let pendingStart = null;

function tutorialSeen() {
  try { return localStorage.getItem(TUTORIAL_KEY) === '1'; } catch (e) { return true; }
}
function openTutorial() {
  const el = $('tutorial');
  if (el) el.classList.remove('hidden');
}
function closeTutorial() {
  try { localStorage.setItem(TUTORIAL_KEY, '1'); } catch (e) { /* ignore */ }
  const el = $('tutorial');
  if (el) el.classList.add('hidden');
  const p = pendingStart;
  pendingStart = null;
  if (p) startGame(p.modelKey, p.n);
}
function startGameUI(modelKey, n) {
  // 2D 覆盖层在 VR 里看不见：已进入沉浸式说明是头显内操作，直接开局，避免卡住
  const inVr = !!(renderer && renderer.xr && renderer.xr.isPresenting);
  if (!inVr && !tutorialSeen()) {
    pendingStart = { modelKey, n };
    openTutorial();
    sfx.ui();
    return;
  }
  startGame(modelKey, n);
}

// ---------------- 启动 ----------------

// 2D 界面里的音乐开关（VR 内用菜单里的「音乐」按钮）
function updateMusicButton() {
  const b = $('music-toggle');
  if (b) b.textContent = music.isEnabled() ? '🎵 音乐开' : '🔇 音乐关';
}

// 设备自检：进 VR 前确认安全上下文 / WebXR / WebGL 状态（真机排查用）
async function runSelfCheck() {
  const body = $('selfcheck-body');
  if (!body) return;
  const L = [];
  const mark = (ok, label, detail) => L.push(`${ok === null ? 'ℹ️' : ok ? '✅' : '❌'} ${label}${detail ? '：' + detail : ''}`);
  mark(window.isSecureContext === true, '安全上下文（HTTPS / localhost）',
    window.isSecureContext ? '是' : '否 — 浏览器不会暴露 WebXR');
  const hasXR = typeof navigator.xr !== 'undefined';
  mark(hasXR, 'navigator.xr', hasXR ? '存在' : '不存在');
  let immersive = '未知';
  if (hasXR) {
    try { immersive = await navigator.xr.isSessionSupported('immersive-vr'); } catch (e) { immersive = '查询失败：' + e.message; }
  }
  mark(immersive === true, 'immersive-vr 会话', String(immersive));
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    mark(true, 'WebGL', `${gl.getParameter(gl.VERSION)} · ${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '渲染器信息不可用'}`);
  } catch (e) { mark(false, 'WebGL', '读取失败'); }
  mark(null, '屏幕', `${screen.width}×${screen.height} @${(window.devicePixelRatio || 1).toFixed(2)}x`);
  mark(null, '版本', `${APP_VERSION} · ${BUILD_INFO}`);
  mark(null, 'UA', navigator.userAgent);
  L.push('');
  L.push(immersive === true
    ? '建议：可直接点击 ENTER VR 进入游戏。'
    : '建议：确认使用 https:// 地址且浏览器允许 WebXR；若头显内仍不可用，请改用 APK 版。');
  body.textContent = L.join('\n');
  $('selfcheck').classList.remove('hidden');
}

initScene();
applyTheme(state.theme); // 应用持久化的场景主题
// 封面版本信息
if ($('build-info')) $('build-info').textContent = `v${APP_VERSION} · ${BUILD_INFO}`;
// 致命错误覆盖层按钮
if ($('fatal-reload')) $('fatal-reload').onclick = () => location.reload();
if ($('fatal-back')) $('fatal-back').onclick = () => { hideFatal(); showDifficulty(); };
$('win-btn').onclick = () => showDifficulty();
// 2D 预览：点击画布任意处进入难度选择（进入 VR 后仍可用手柄游玩）
$('intro').addEventListener('click', () => {
  try { if (music.isEnabled()) music.start(); } catch (e) { /* ignore */ }
  showDifficulty();
});
if ($('selfcheck-btn')) {
  // 阻止冒泡：否则点"设备自检"会同时触发 intro 的"开始游戏"
  $('selfcheck-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.ui();
    runSelfCheck();
  });
  $('selfcheck-close').addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.ui();
    $('selfcheck').classList.add('hidden');
  });
}
if ($('settings-btn')) {
  $('settings-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.ui();
    openSettings();
  });
  $('settings-close').addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.ui();
    closeSettings();
  });
}
if ($('board-close')) {
  $('board-close').addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.ui();
    closeBoard();
  });
}
if ($('board-tab-model')) {
  $('board-tab-model').addEventListener('click', (e) => { e.stopPropagation(); sfx.ui(); buildBoardUI('model'); });
}
if ($('board-tab-global')) {
  $('board-tab-global').addEventListener('click', (e) => { e.stopPropagation(); sfx.ui(); buildBoardUI('global'); });
}
if ($('tutorial-ok')) {
  $('tutorial-ok').addEventListener('click', (e) => {
    e.stopPropagation();
    sfx.ui();
    closeTutorial();
  });
}
// 打开方式提示（file:// / 非本机 http://）
const _protoHint = protocolHint(location.protocol, location.hostname);
if (_protoHint && $('env-warn')) {
  $('env-warn').textContent = _protoHint;
  $('env-warn').style.display = 'block';
}
if ($('music-toggle')) {
  $('music-toggle').onclick = () => {
    music.toggle();
    updateMusicButton();
    sfx.ui();
  };
  updateMusicButton();
}
renderer.setAnimationLoop(animate);

// 测试钩子（自动化验证用；不影响正常游戏）
window.__wanxiang = {
  state, trySnap, startGame, showDifficulty, toggleVrMenu, physics, slopeHeightAt, MODELS, fxList, THREE,
  // 新功能测试钩子
  triggerHint, clearHint, applyStickRotation, positionMenuInFront,
  onGrab, onRelease, onSqueeze,
  // 进度/成就（读写走 localStorage；纯逻辑在 progress.mjs）
  loadProgress: readProgress, recordResult: commitResult,
  readAchievements, starsFor, levelKey, parTime, summarize,
  ACHIEVEMENTS, DIFFICULTY, MODEL_KEYS, evaluateAchievements,
  applyQualityLevel, getQuality: () => ({ level: quality.level, auto: quality.auto, pixelRatio: renderer.getPixelRatio(), starfieldVisible: !!(starfield && starfield.visible) }),
  setQualityAuto: (on) => { quality.auto = !!on; },
  hasEnv: () => envReady,
  getStarfield: () => starfield,
  // 稳定性兜底（测试用）
  showFatal, hideFatal, APP_VERSION, BUILD_INFO,
  // 难度支持情况（8 块为可选档）
  supportedCounts, totalLevels, CUT_TABLE,
  getFatalInfo: () => ({
    visible: !$('fatal').classList.contains('hidden'),
    title: $('fatal-title').textContent,
    msg: $('fatal-msg').textContent,
  }),
  // 每日挑战 / 设备自检（测试用）
  dailyChallenge, dayKey, runSelfCheck,
  getSelfCheckText: () => (selfcheck-body ? selfcheck-body.textContent : ''),
  // 抓取高亮 / 磁吸辅助（测试用）
  setGhostHighlight, clearGhostHighlight, magnetStep,
  getGhostHighlight: () => ghostHighlight.idx,
  getAssist: () => state.assist,
  setAssist: (on) => { state.assist = !!on; saveAssist(state.assist); },
  getPractice: () => state.practice,
  getTheme: () => state.theme,
  getTuning: () => ({ ...state.tuning }),
  setTuningValue: (k, v) => { state.tuning[k] = v; saveTuning(state.tuning); applyTuning(); },
  openSettings, closeSettings, protocolHint,
  openBoard, closeBoard,
  getBoardText: () => ($('board-body') ? $('board-body').textContent : ''),
  startGameUI, openTutorial, closeTutorial,
  resetTutorial: () => { try { localStorage.removeItem(TUTORIAL_KEY); } catch (e) { /* ignore */ } },
  getTutorialVisible: () => ($('tutorial') ? !$('tutorial').classList.contains('hidden') : false),
  setTheme: (k) => applyTheme(k),
  getThemeInfo: () => ({ theme: state.theme, bg: scene.background.getHexString(), fog: scene.fog.color.getHexString() }),
  setPractice: (on) => { state.practice = !!on; savePractice(state.practice); },
  music,
  // 配色皮肤（测试与外部控制用）
  PALETTES, getPalette: () => state.palette,
  setPalette: (p) => { if (PALETTES[p]) { state.palette = p; savePalette(p); } },
  // 视觉回归测试用：暴露渲染器与场景，便于在页面内对帧缓冲取哈希
  renderer, scene, camera, ghostGroup: () => ghostGroup, targetRig,
  getHintInfo: () => ({ active: !!hint.pillar, idx: hint.idx, until: hint.until }),
  // VR 菜单分页 / 浮窗提示（测试用）
  showVrPage, refreshVrProgress,
  getVrPageInfo: () => ({ page: vrMenu.page || 'main', progressVisible: !!(vrMenu.progressPage && vrMenu.progressPage.visible), lines: vrMenu.progressLines || [] }),
  getVrToast: () => ({ active: !!vrToast.sprite, text: vrToast.text }),
  showVrToast,
  getMenuInfo: () => ({ enabled: vrMenu.enabled, pos: vrMenu.group ? vrMenu.group.position.toArray() : null }),
};
