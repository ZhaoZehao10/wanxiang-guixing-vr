// 程序化 3D 模型库 — 纯 JS 生成带顶点颜色的 OBJ 文本
//
// 8 个模型：小火箭 / 蘑菇屋 / 宝石星球 / 梦幻城堡 / 软萌企鹅 / 礼物盒子 / 迷你赛车 / 圣诞树
//
// 生成约定：右手坐标系、Y 向上、三角形绕向从外看逆时针（法线朝外）。
// 顶点颜色直接写进 v 行（v x y z r g b），拆分与渲染两端共用。
//
// 重要约束（切割引擎拓扑依赖）：
//   1) 每个图元必须是独立的封闭壳（本文件所有生成器均已验证）；
//   2) 不同图元之间不得有"位置完全重合"的顶点——splitIntoPieces 会按位置
//      焊接顶点，若两个壳共享顶点位置，两壳会被错误地拓扑连接，补面行走断链。
//      所以各图元的尺寸/位置一律错开（即使视觉上互相穿插也没问题：几何相交
//      但拓扑独立是允许的）。
//   3) 圆环面/球体/圆锥的接缝顶点均已做取模处理，无重复顶点。

function f4(n) { return (Math.round(n * 10000) / 10000).toString(); }

class ObjBuilder {
  constructor() { this.verts = []; this.faces = []; }
  vert(p, c) { this.verts.push([p[0], p[1], p[2], c[0], c[1], c[2]]); return this.verts.length; } // 1-based
  tri(a, b, c) { this.faces.push([a, b, c]); }
  toString() {
    const out = [];
    for (const v of this.verts) out.push(`v ${f4(v[0])} ${f4(v[1])} ${f4(v[2])} ${f4(v[3])} ${f4(v[4])} ${f4(v[5])}`);
    for (const f of this.faces) out.push(`f ${f[0]} ${f[1]} ${f[2]}`);
    return out.join('\n') + '\n';
  }
}

// 变换：scale → 旋转(Rz·Ry·Rx，即先 X 后 Y 后 Z) → 平移
// 顺序说明：rot=[φ,θ,0] 时 v'=Ry(θ)·Rx(φ)·v，可使 +Y 轴指向 (sinφsinθ, cosφ, sinφcosθ)，
// 即"先绕 X 倾斜 φ、再绕 Y 转方位 θ"——宝石星球尖刺的方向依赖此顺序。
function xform(t, p) {
  let [x, y, z] = p;
  if (t.scale) { x *= t.scale[0]; y *= t.scale[1]; z *= t.scale[2]; }
  const r = t.rot;
  if (r) {
    if (r[0]) { const cx = Math.cos(r[0]), sx = Math.sin(r[0]); const y1 = y * cx - z * sx, z1 = y * sx + z * cx; y = y1; z = z1; }
    if (r[1]) { const cy = Math.cos(r[1]), sy = Math.sin(r[1]); const x1 = x * cy + z * sy, z1 = -x * sy + z * cy; x = x1; z = z1; }
    if (r[2]) { const cz = Math.cos(r[2]), sz = Math.sin(r[2]); const x3 = x * cz - y * sz, y3 = x * sz + y * cz; x = x3; y = y3; }
  }
  if (t.pos) { x += t.pos[0]; y += t.pos[1]; z += t.pos[2]; }
  return [x, y, z];
}

function put(b, color, t, p) { return b.vert(xform(t, p), color); }

// 截锥体（圆柱 = rb===rt）。零半径端自动改为单一顶点（圆锥尖），避免退化三角形。
// 已验证绕向：侧面/端盖/锥扇形法线均朝外。
function frustum(b, color, t, rb, rt, h, seg = 36) {
  const EPS_R = 1e-6;
  const rows = 4;
  const yAt = (j) => -h / 2 + (h * j) / rows;
  const rAt = (j) => rb + ((rt - rb) * j) / rows;
  const ringAt = (j) => {
    const r = rAt(j), y = yAt(j), row = [];
    for (let i = 0; i < seg; i++) {
      const a = (2 * Math.PI * i) / seg;
      row.push(put(b, color, t, [r * Math.cos(a), y, r * Math.sin(a)]));
    }
    return row;
  };
  const bottomApex = rb <= EPS_R, topApex = rt <= EPS_R;
  const j0 = bottomApex ? 1 : 0;
  const j1 = topApex ? rows - 1 : rows;
  const rings = [];
  for (let j = j0; j <= j1; j++) rings.push(ringAt(j));
  const apexB = bottomApex ? put(b, color, t, [0, yAt(0), 0]) : -1;
  const apexT = topApex ? put(b, color, t, [0, yAt(rows), 0]) : -1;

  for (let k = 0; k < rings.length - 1; k++) {
    const lo = rings[k], hi = rings[k + 1];
    for (let i = 0; i < seg; i++) {
      const i2 = (i + 1) % seg;
      b.tri(lo[i], hi[i2], lo[i2]);
      b.tri(lo[i], hi[i], hi[i2]);
    }
  }
  if (bottomApex) { // 锥底扇形（尖朝下）
    const r0 = rings[0];
    for (let i = 0; i < seg; i++) b.tri(apexB, r0[i], r0[(i + 1) % seg]);
  } else {
    const c = put(b, color, t, [0, yAt(0), 0]);
    for (let i = 0; i < seg; i++) b.tri(c, rings[0][i], rings[0][(i + 1) % seg]);
  }
  if (topApex) { // 锥顶扇形（尖朝上）
    const rN = rings[rings.length - 1];
    for (let i = 0; i < seg; i++) b.tri(apexT, rN[(i + 1) % seg], rN[i]);
  } else {
    const rN = rings[rings.length - 1];
    const c = put(b, color, t, [0, yAt(rows), 0]);
    for (let i = 0; i < seg; i++) b.tri(c, rN[(i + 1) % seg], rN[i]);
  }
}

// 球体（低分段 = 宝石棱面感）。scale 可压扁。
// 单极点拓扑：上下极各 1 个顶点 + 扇形三角化，两极无重合顶点。
function sphere(b, color, t, r, wSeg = 40, hSeg = 26) {
  const grid = [];
  for (let j = 1; j < hSeg; j++) {
    const phi = (Math.PI * j) / hSeg, row = [];
    for (let i = 0; i < wSeg; i++) {
      const th = (2 * Math.PI * i) / wSeg;
      row.push(put(b, color, t, [r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th)]));
    }
    grid.push(row);
  }
  const top = put(b, color, t, [0, r, 0]);
  const bot = put(b, color, t, [0, -r, 0]);
  for (let i = 0; i < wSeg; i++) {
    b.tri(top, grid[0][(i + 1) % wSeg], grid[0][i]);           // 顶扇
    b.tri(bot, grid[hSeg - 2][i], grid[hSeg - 2][(i + 1) % wSeg]); // 底扇
  }
  for (let j = 0; j < hSeg - 2; j++) {
    for (let i = 0; i < wSeg; i++) {
      const i2 = (i + 1) % wSeg;
      b.tri(grid[j][i], grid[j + 1][i2], grid[j + 1][i]);
      b.tri(grid[j][i], grid[j][i2], grid[j + 1][i2]);
    }
  }
}

// 圆环（默认躺在 XZ 平面，中轴 = Y）。u/v 均取模环绕，无重合接缝顶点。
function torus(b, color, t, R, r, uSeg = 64, vSeg = 20) {
  const P = (u, v) => [(R + r * Math.cos(v)) * Math.cos(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.sin(u)];
  const g = [];
  for (let i = 0; i < uSeg; i++) {
    const row = [];
    for (let j = 0; j < vSeg; j++) row.push(put(b, color, t, P((2 * Math.PI * i) / uSeg, (2 * Math.PI * j) / vSeg)));
    g.push(row);
  }
  for (let i = 0; i < uSeg; i++) {
    const i2 = (i + 1) % uSeg;
    for (let j = 0; j < vSeg; j++) {
      const j2 = (j + 1) % vSeg;
      b.tri(g[i][j], g[i2][j2], g[i2][j]);
      b.tri(g[i][j], g[i][j2], g[i2][j2]);
    }
  }
}

// 轴对齐盒子（6 面绕向已逐一验证）
function box(b, color, t, sx, sy, sz) {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const F = [
    [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]],   // +X
    [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], // -X
    [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]],   // +Y
    [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], // -Y
    [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]],   // +Z
    [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], // -Z
  ];
  for (const [a, c, d, e] of F) {
    const ia = put(b, color, t, a), ib = put(b, color, t, c), ic = put(b, color, t, d), id = put(b, color, t, e);
    b.tri(ia, ib, ic); b.tri(ia, ic, id);
  }
}

// ---------------- 模型 1：小火箭（精修版） ----------------

function buildRocket(b) {
  const white = [0.94, 0.95, 0.97], red = [0.90, 0.22, 0.28], grey = [0.36, 0.39, 0.44];
  const blue = [0.20, 0.45, 0.95], cyan = [0.55, 0.90, 1.00], orange = [1.00, 0.55, 0.12];
  const gold = [0.95, 0.80, 0.35];
  frustum(b, orange, { pos: [0, -1.22, 0] }, 0.20, 0.02, 0.34, 28);           // 尾焰外焰
  frustum(b, [1.0, 0.85, 0.35], { pos: [0, -1.26, 0] }, 0.10, 0.01, 0.26, 20); // 尾焰内焰
  frustum(b, grey, { pos: [0, -0.96, 0] }, 0.18, 0.30, 0.22, 48);              // 喷口
  frustum(b, white, { pos: [0, -0.32, 0] }, 0.34, 0.30, 1.10, 48);             // 机身
  frustum(b, red, { pos: [0, 0.22, 0] }, 0.315, 0.315, 0.06, 48);              // 装饰环 1
  frustum(b, red, { pos: [0, -0.52, 0] }, 0.325, 0.325, 0.05, 48);             // 装饰环 2
  frustum(b, red, { pos: [0, 0.51, 0] }, 0.30, 0.02, 0.55, 48);                // 头锥
  sphere(b, gold, { pos: [0, 0.79, 0] }, 0.045, 16, 10);                       // 顶端小珠
  sphere(b, blue, { pos: [0, -0.18, 0.325], rot: [Math.PI / 2, 0, 0] }, 0.14, 28, 16); // 舷窗框
  sphere(b, cyan, { pos: [0, -0.18, 0.315], scale: [1, 1, 0.45] }, 0.11, 24, 14);      // 舷窗玻璃
  for (let k = 0; k < 6; k++) {                                                // 舷窗铆钉
    const a = (Math.PI / 3) * k + 0.3;
    sphere(b, grey, { pos: [0.155 * Math.cos(a), -0.18 + 0.155 * Math.sin(a), 0.30] }, 0.022, 10, 8);
  }
  for (let k = 0; k < 3; k++) {                                                // 三片尾翼
    const a = (2 * Math.PI * k) / 3;
    box(b, red, { pos: [0.38 * Math.sin(a), -0.72, 0.38 * Math.cos(a)], rot: [0, a, 0] }, 0.07, 0.52, 0.36);
  }
  for (let k = 0; k < 3; k++) {                                                // 尾翼铆钉条
    const a = (2 * Math.PI * k) / 3 + Math.PI / 3;
    sphere(b, grey, { pos: [0.36 * Math.sin(a), -0.60, 0.36 * Math.cos(a)] }, 0.028, 10, 8);
  }
}

// ---------------- 模型 2：蘑菇屋（精修版） ----------------

function buildMushroom(b) {
  const cream = [0.96, 0.92, 0.80], capRed = [0.85, 0.25, 0.28], spot = [0.97, 0.96, 0.94];
  const brown = [0.55, 0.36, 0.20], grass = [0.36, 0.74, 0.40], brick = [0.70, 0.40, 0.32];
  const grassDark = [0.28, 0.60, 0.32];
  frustum(b, grass, { pos: [0, -0.85, 0] }, 0.98, 0.95, 0.14, 56);             // 草地底盘
  frustum(b, cream, { pos: [0, -0.35, 0] }, 0.42, 0.50, 0.90, 48);             // 菌柄
  box(b, brown, { pos: [0, -0.38, 0.42] }, 0.34, 0.50, 0.09);                  // 木门
  sphere(b, [0.95, 0.80, 0.30], { pos: [0.10, -0.38, 0.48] }, 0.032, 12, 8);   // 门把手
  sphere(b, [0.55, 0.85, 0.95], { pos: [0.26, -0.08, 0.435], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.4] }, 0.09, 20, 12); // 右窗
  sphere(b, [0.55, 0.85, 0.95], { pos: [-0.26, -0.08, 0.435], rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.4] }, 0.09, 20, 12); // 左窗
  sphere(b, capRed, { pos: [0, 0.15, 0], scale: [1, 0.62, 1] }, 0.95, 48, 30); // 菌盖
  const spots = [];
  for (let k = 0; k < 6; k++) {                                                // 盖面斑点（两圈）
    const a = (Math.PI / 3) * k + 0.4;
    const ring = k % 2 === 0 ? 0.62 : 0.34;
    const yy = 0.15 + 0.59 * Math.sqrt(Math.max(0, 1 - (ring / 0.95) ** 2));
    spots.push([ring * Math.cos(a), yy, ring * Math.sin(a), k % 2 === 0 ? 0.10 : 0.075]);
  }
  spots.push([0, 0.15 + 0.59, 0, 0.11]);                                       // 顶斑
  for (const [x, y, z, r] of spots) sphere(b, spot, { pos: [x, y, z], scale: [1, 0.35, 1] }, r, 18, 10);
  box(b, brick, { pos: [0.42, 0.62, -0.28], rot: [0, 0.5, -0.10] }, 0.15, 0.30, 0.15); // 烟囱
  for (let k = 0; k < 3; k++) {                                                // 烟囱轻烟
    sphere(b, [0.85, 0.85, 0.88], { pos: [0.40 + k * 0.04, 0.82 + k * 0.13, -0.30 - k * 0.03] }, 0.055 + k * 0.015, 14, 10);
  }
  const petals = [[1.00, 0.60, 0.75], [1.00, 0.85, 0.40], [0.90, 0.50, 1.00], [0.55, 0.85, 1.00]]; // 底座小花
  for (let k = 0; k < 4; k++) {
    const a = 1.9 + k * 1.55;
    sphere(b, petals[k], { pos: [0.76 * Math.cos(a), -0.76, 0.76 * Math.sin(a)] }, 0.055, 12, 8);
  }
  for (let k = 0; k < 6; k++) {                                                // 草丛
    const a = (Math.PI / 3) * k + 0.15;
    frustum(b, grassDark, { pos: [0.88 * Math.cos(a), -0.78, 0.88 * Math.sin(a)] }, 0.035, 0.0, 0.14, 8);
  }
}

// ---------------- 模型 3：宝石星球（精修版） ----------------

function buildGemPlanet(b) {
  const teal = [0.20, 0.78, 0.72], purple = [0.72, 0.42, 0.95], gold = [0.95, 0.78, 0.25], moon = [0.95, 0.95, 1.00];
  const goldLight = [1.00, 0.90, 0.55];
  sphere(b, teal, {}, 0.62, 14, 9);                                            // 核心（略细分的棱面宝石）
  const spikes = [ // [极角φ, 方位角θ, 半径, 高]
    [0.25, 0.3, 0.15, 0.60], [0.80, 1.6, 0.13, 0.50], [0.50, 3.0, 0.16, 0.65],
    [1.20, 4.2, 0.12, 0.45], [1.90, 0.8, 0.14, 0.55], [2.60, 3.6, 0.15, 0.58],
    [1.55, 5.4, 0.10, 0.38], [2.20, 2.2, 0.11, 0.42],
  ];
  for (const [phi, th, r, h] of spikes) {
    const dir = [Math.sin(phi) * Math.sin(th), Math.cos(phi), Math.sin(phi) * Math.cos(th)];
    frustum(b, purple, { pos: [dir[0] * 0.50, dir[1] * 0.50, dir[2] * 0.50], rot: [phi, th, 0] }, r, 0.0, h, 18);
    // 每根刺底部一圈小晶粒
    for (let k = 0; k < 3; k++) {
      const a = (2 * Math.PI * k) / 3 + phi;
      sphere(b, goldLight, {
        pos: [dir[0] * 0.50 + 0.09 * Math.cos(a) * Math.sin(th), dir[1] * 0.50 + 0.09 * Math.cos(a) * Math.cos(phi), dir[2] * 0.50 + 0.09 * Math.sin(a) * Math.sin(phi)],
      }, 0.022, 8, 6);
    }
  }
  torus(b, gold, {}, 1.00, 0.07, 72, 22);                                      // 金环
  torus(b, goldLight, { rot: [0.55, 0.35, 0] }, 0.84, 0.025, 56, 12);          // 倾斜细环
  for (let k = 0; k < 3; k++) {                                                // 环上的小月亮
    const a = (2 * Math.PI * k) / 3;
    sphere(b, moon, { pos: [Math.cos(a), 0, Math.sin(a)] }, 0.095, 22, 14);
  }
  for (let k = 0; k < 3; k++) {                                                // 漂浮晶簇（双锥）
    const a = 1.0 + k * 2.1;
    const r = 1.28;
    const y = 0.55 - k * 0.45;
    frustum(b, purple, { pos: [r * Math.cos(a) * 0.55, y + 0.10, r * Math.sin(a) * 0.55] }, 0.09, 0.0, 0.22, 12);
    frustum(b, [0.55, 0.30, 0.80], { pos: [r * Math.cos(a) * 0.55, y - 0.02, r * Math.sin(a) * 0.55], rot: [Math.PI, 0, 0] }, 0.085, 0.0, 0.20, 12);
  }
}

// ---------------- 模型 4：梦幻城堡 ----------------

function buildCastle(b) {
  const stone = [0.62, 0.60, 0.56], stoneDark = [0.48, 0.46, 0.44], roof = [0.72, 0.24, 0.30];
  const roofBlue = [0.28, 0.42, 0.78], wood = [0.42, 0.28, 0.18], flag = [0.95, 0.80, 0.25];
  const grass = [0.42, 0.66, 0.36];
  frustum(b, grass, { pos: [0, -0.98, 0] }, 1.12, 1.02, 0.16, 56);             // 草地
  box(b, stone, { pos: [0, -0.57, 0] }, 1.02, 0.62, 0.92);                     // 主城墙
  for (let i = 0; i < 4; i++) {                                                // 城垛（前后两排）
    const x = -0.36 + i * 0.24;
    box(b, stoneDark, { pos: [x, -0.23, 0.40] }, 0.12, 0.10, 0.10);
    box(b, stoneDark, { pos: [x, -0.23, -0.40] }, 0.12, 0.10, 0.10);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {                        // 四角塔楼
    frustum(b, stone, { pos: [sx * 0.58, -0.48, sz * 0.50] }, 0.17, 0.17, 0.78, 28);
    frustum(b, roof, { pos: [sx * 0.58, -0.02, sz * 0.50] }, 0.235, 0.0, 0.34, 28);
    sphere(b, flag, { pos: [sx * 0.58, 0.20, sz * 0.50] }, 0.035, 10, 8);
  }
  frustum(b, stone, { pos: [0, -0.30, 0], rot: [0, 0, 0] }, 0.26, 0.26, 0.85, 28); // 中央主塔
  frustum(b, roofBlue, { pos: [0, 0.26, 0] }, 0.34, 0.0, 0.42, 28);            // 主塔尖顶
  sphere(b, flag, { pos: [0, 0.51, 0] }, 0.05, 12, 8);                         // 塔顶金球
  frustum(b, [0.55, 0.55, 0.6], { pos: [0, 0.65, 0] }, 0.018, 0.012, 0.24, 10); // 旗杆
  box(b, flag, { pos: [0.09, 0.72, 0] }, 0.18, 0.10, 0.02);                    // 旗帜
  box(b, wood, { pos: [0, -0.78, 0.46] }, 0.30, 0.34, 0.07);                   // 城门
  sphere(b, [0.90, 0.75, 0.35], { pos: [0.10, -0.76, 0.50] }, 0.028, 10, 8);   // 门环
  for (let i = 0; i < 5; i++) {                                                // 窗
    box(b, [0.25, 0.25, 0.28], { pos: [-0.30 + i * 0.15, -0.50, 0.465] }, 0.07, 0.10, 0.02);
  }
}

// ---------------- 模型 5：软萌企鹅 ----------------

function buildPenguin(b) {
  const black = [0.10, 0.12, 0.16], white = [0.95, 0.95, 0.93], orange = [1.00, 0.62, 0.15];
  const pink = [0.95, 0.55, 0.55];
  sphere(b, black, { pos: [0, -0.22, 0], scale: [0.66, 1.0, 0.56] }, 1.0, 44, 28);  // 身体
  // 肚皮：必须明显凸出身体表面（z 前移），否则两壳近共面会 Z-fighting
  sphere(b, white, { pos: [0, -0.28, 0.34], scale: [0.50, 0.80, 0.30] }, 1.0, 40, 26);
  sphere(b, black, { pos: [0, 0.78, 0.03], scale: [1, 0.95, 1] }, 0.44, 40, 26);    // 头
  frustum(b, orange, { pos: [0, 0.72, 0.46], rot: [Math.PI / 2, 0, 0] }, 0.13, 0.0, 0.24, 20); // 嘴
  for (const s of [-1, 1]) {
    // 眼睛/腮红都要凸出头表面（头前缘 z≈0.47）
    sphere(b, white, { pos: [s * 0.17, 0.86, 0.45], scale: [1, 1, 0.55] }, 0.10, 20, 14);
    sphere(b, black, { pos: [s * 0.17, 0.86, 0.51], scale: [1, 1, 0.6] }, 0.048, 16, 10);
    sphere(b, pink, { pos: [s * 0.32, 0.72, 0.44], scale: [1, 0.6, 0.5] }, 0.05, 14, 8);
    sphere(b, black, { pos: [s * 0.66, -0.18, 0.02], scale: [0.16, 0.62, 0.34] }, 1.0, 24, 16); // 翅膀
    box(b, orange, { pos: [s * 0.24, -1.16, 0.20], rot: [0, s * 0.15, 0] }, 0.24, 0.09, 0.32);  // 脚
  }
  sphere(b, black, { pos: [0, -0.95, -0.42], scale: [0.30, 0.18, 0.30] }, 1.0, 20, 12); // 尾巴
}

// ---------------- 模型 6：礼物盒子 ----------------

function buildGift(b) {
  const red = [0.85, 0.22, 0.28], gold = [0.95, 0.78, 0.30], cream = [0.97, 0.93, 0.80];
  const deepRed = [0.65, 0.15, 0.20];
  box(b, red, { pos: [0, -0.50, 0] }, 0.92, 0.78, 0.92);                        // 盒身
  box(b, deepRed, { pos: [0, -0.02, 0] }, 1.00, 0.16, 1.00);                    // 盒盖
  box(b, cream, { pos: [0, -0.02, 0] }, 0.13, 0.20, 1.01);                      // 竖向丝带（盖）
  box(b, cream, { pos: [0, -0.02, 0] }, 1.01, 0.20, 0.13);                      // 横向丝带（盖）
  box(b, cream, { pos: [0, -0.50, 0] }, 0.13, 0.80, 0.94);                      // 竖向丝带（身）
  box(b, cream, { pos: [0, -0.50, 0] }, 0.94, 0.80, 0.13);                      // 横向丝带（身）
  torus(b, gold, { pos: [-0.13, 0.16, 0], rot: [0, 0, 0.55] }, 0.15, 0.045, 40, 14); // 蝴蝶结左环
  torus(b, gold, { pos: [0.13, 0.16, 0], rot: [0, 0, -0.55] }, 0.15, 0.045, 40, 14); // 蝴蝶结右环
  sphere(b, deepRed, { pos: [0, 0.16, 0] }, 0.075, 18, 12);                     // 结心
  for (let k = 0; k < 4; k++) {                                                 // 盒角小饰球
    const a = (Math.PI / 2) * k + 0.3;
    sphere(b, gold, { pos: [0.47 * Math.cos(a), -0.86, 0.47 * Math.sin(a)] }, 0.035, 10, 8);
  }
}

// ---------------- 模型 7：迷你赛车 ----------------

function buildCar(b) {
  const red = [0.85, 0.20, 0.22], blue = [0.25, 0.45, 0.85], dark = [0.12, 0.12, 0.14];
  const glass = [0.55, 0.80, 0.95], yellow = [1.00, 0.92, 0.55], silver = [0.78, 0.80, 0.85];
  box(b, red, { pos: [0, -0.40, 0] }, 1.34, 0.30, 0.64);                        // 底盘
  box(b, blue, { pos: [0, -0.10, -0.04] }, 0.64, 0.36, 0.54);                   // 座舱
  box(b, glass, { pos: [0, -0.09, 0.235] }, 0.56, 0.24, 0.04);                  // 前挡风
  box(b, glass, { pos: [0, -0.09, -0.315] }, 0.56, 0.22, 0.04);                 // 后窗
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {                          // 四轮
    frustum(b, dark, { pos: [sx * 0.60, -0.60, sz * 0.40], rot: [0, 0, Math.PI / 2] }, 0.185, 0.185, 0.14, 24);
    frustum(b, silver, { pos: [sx * 0.60, -0.60, sz * 0.40], rot: [0, 0, Math.PI / 2] }, 0.085, 0.085, 0.15, 16);
  }
  for (const sx of [-1, 1]) {                                                   // 前大灯 / 尾灯
    sphere(b, yellow, { pos: [sx * 0.46, -0.42, 0.335] }, 0.065, 14, 10);
    sphere(b, [0.90, 0.15, 0.15], { pos: [sx * 0.46, -0.42, -0.335] }, 0.055, 14, 10);
  }
  box(b, silver, { pos: [0, -0.24, 0.35] }, 0.30, 0.06, 0.04);                  // 前格栅
  box(b, dark, { pos: [0, -0.66, 0.36] }, 0.9, 0.06, 0.22);                     // 前保险杠
  box(b, dark, { pos: [0, -0.66, -0.36] }, 0.9, 0.06, 0.22);                    // 后保险杠
}

// ---------------- 模型 8：圣诞树 ----------------

function buildXmas(b) {
  const green1 = [0.15, 0.50, 0.28], green2 = [0.20, 0.60, 0.34], green3 = [0.26, 0.68, 0.38];
  const trunkC = [0.45, 0.30, 0.18], snow = [0.95, 0.96, 1.00], gold = [0.95, 0.80, 0.30];
  const ballCols = [[0.90, 0.25, 0.30], [0.95, 0.75, 0.25], [0.30, 0.55, 0.95], [0.85, 0.45, 0.90]];
  frustum(b, trunkC, { pos: [0, -1.02, 0] }, 0.15, 0.13, 0.36, 24);             // 树干
  frustum(b, green1, { pos: [0, -0.72, 0] }, 0.78, 0.015, 0.58, 48);            // 底层
  frustum(b, green2, { pos: [0, -0.30, 0] }, 0.60, 0.015, 0.52, 44);            // 中层
  frustum(b, green3, { pos: [0, 0.10, 0] }, 0.42, 0.012, 0.46, 40);             // 顶层
  sphere(b, gold, { pos: [0, 0.40, 0] }, 0.10, 20, 14);                         // 树顶星（金球）
  for (let k = 0; k < 14; k++) {                                                // 彩球（三层交错）
    const layer = k % 3;
    const a = k * 2.4;
    const y0 = [-1.01, -0.56, -0.13][layer];
    const r0 = [0.78, 0.60, 0.42][layer];
    const t = 0.35 + (k % 4) * 0.12;
    const y = y0 + t * [0.58, 0.52, 0.46][layer];
    const rr = r0 * (1 - t) * 0.95;
    sphere(b, ballCols[k % 4], { pos: [rr * Math.cos(a), y, rr * Math.sin(a)] }, 0.055, 12, 8);
  }
  for (let k = 0; k < 6; k++) {                                                 // 底部雪堆
    const a = (Math.PI / 3) * k + 0.2;
    sphere(b, snow, { pos: [0.95 * Math.cos(a), -1.10, 0.95 * Math.sin(a)], scale: [1, 0.35, 1] }, 0.14, 14, 8);
  }
}

// ---------------- 模型 9：软萌小兔 ----------------

function buildRabbit(b) {
  const white = [0.96, 0.96, 0.94], pink = [0.95, 0.62, 0.70], dark = [0.10, 0.10, 0.14];
  const cream = [0.99, 0.97, 0.92];
  sphere(b, white, { pos: [0, -0.30, 0], scale: [0.56, 0.60, 0.48] }, 1.0, 40, 26);   // 身体
  sphere(b, cream, { pos: [0, -0.28, 0.20], scale: [0.42, 0.46, 0.30] }, 1.0, 34, 22); // 肚皮（凸出体表）
  sphere(b, white, { pos: [0, 0.34, 0.06], scale: [1, 0.98, 1] }, 0.34, 40, 26);       // 头
  for (const s of [-1, 1]) {
    // 长耳朵：外耳白色椭球 + 内耳粉色椭球（沿 z 前移，避免两壳近共面）
    sphere(b, white, { pos: [s * 0.135, 0.92, 0.02], scale: [0.095, 0.46, 0.12] }, 1.0, 20, 16);
    sphere(b, pink, { pos: [s * 0.135, 0.92, 0.10], scale: [0.050, 0.34, 0.05] }, 1.0, 16, 12);
    // 眼睛/腮红：必须凸出头表面（头前缘 z≈0.40）
    sphere(b, dark, { pos: [s * 0.145, 0.40, 0.36], scale: [1, 1, 0.7] }, 0.055, 16, 12);
    sphere(b, pink, { pos: [s * 0.235, 0.31, 0.30], scale: [1, 0.7, 0.55] }, 0.045, 14, 10);
    // 后脚
    sphere(b, white, { pos: [s * 0.24, -0.80, 0.16], scale: [0.19, 0.11, 0.28] }, 1.0, 20, 14);
  }
  sphere(b, pink, { pos: [0, 0.30, 0.42], scale: [1, 0.8, 0.8] }, 0.040, 16, 12);      // 鼻子
  sphere(b, white, { pos: [0, -0.52, -0.44], scale: [1, 1, 0.9] }, 0.125, 18, 14);     // 尾巴
  // 胡须（细长盒子，左右各两根）
  for (const s of [-1, 1]) {
    box(b, [0.75, 0.70, 0.66], { pos: [s * 0.24, 0.30, 0.40], rot: [0, 0, s * 0.10] }, 0.22, 0.012, 0.012);
    box(b, [0.75, 0.70, 0.66], { pos: [s * 0.23, 0.24, 0.40], rot: [0, 0, s * -0.08] }, 0.20, 0.012, 0.012);
  }
}

// ---------------- 模型 10：蔚蓝地球 ----------------

function buildGlobe(b) {
  const ocean = [0.20, 0.52, 0.86], land = [0.33, 0.70, 0.38], land2 = [0.42, 0.76, 0.34];
  const ring = [0.90, 0.74, 0.32], base = [0.45, 0.32, 0.20], ice = [0.92, 0.96, 1.00];
  sphere(b, ocean, { pos: [0, 0.15, 0], scale: [1, 1, 1] }, 0.70, 44, 30);             // 海洋球
  // 大陆：贴着球面外凸的扁球（半径 0.70，斑块中心放在 0.66~0.72 处）
  const patches = [
    { th: 0.35, ph: 0.95, r: 0.72, s: [1.00, 0.62, 0.55], c: land },
    { th: 2.10, ph: 1.10, r: 0.71, s: [0.85, 0.70, 0.60], c: land2 },
    { th: 3.60, ph: 0.80, r: 0.73, s: [0.95, 0.55, 0.70], c: land },
    { th: 5.10, ph: 1.35, r: 0.70, s: [0.75, 0.65, 0.55], c: land2 },
    { th: 1.20, ph: 1.90, r: 0.71, s: [0.90, 0.58, 0.50], c: land },
  ];
  for (const p of patches) {
    const dir = [Math.sin(p.ph) * Math.cos(p.th), Math.cos(p.ph), Math.sin(p.ph) * Math.sin(p.th)];
    sphere(b, p.c, { pos: [dir[0] * p.r * 0.94, 0.15 + dir[1] * p.r * 0.94, dir[2] * p.r * 0.94], scale: p.s }, 0.20, 22, 16);
  }
  // 南北极冰盖
  sphere(b, ice, { pos: [0, 0.82, 0], scale: [0.62, 0.22, 0.62] }, 0.24, 24, 12);
  sphere(b, ice, { pos: [0, -0.54, 0], scale: [0.55, 0.20, 0.55] }, 0.22, 24, 12);
  // 黄铜子午环（竖立）+ 立柱 + 底座
  torus(b, ring, { pos: [0, 0.15, 0], rot: [Math.PI / 2, 0, 0] }, 0.86, 0.045, 56, 14);
  frustum(b, [0.62, 0.55, 0.42], { pos: [0, -0.72, 0] }, 0.055, 0.045, 0.36, 16);      // 立柱
  frustum(b, base, { pos: [0, -0.94, 0] }, 0.42, 0.34, 0.10, 40);                      // 底座
  frustum(b, [0.55, 0.42, 0.26], { pos: [0, -0.885, 0] }, 0.30, 0.28, 0.03, 32);       // 底座装饰环
}

// ---------------- 模型 11：南瓜灯 ----------------

function buildPumpkin(b) {
  const orange = [0.95, 0.48, 0.12], orangeDark = [0.82, 0.36, 0.08];
  const leafG = [0.28, 0.55, 0.25], stemG = [0.42, 0.32, 0.16], face = [0.10, 0.08, 0.06];
  // 6 瓣南瓜：绕 Y 轴均布的扁椭球，中心略微外移形成瓜棱
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI * 2 * k) / 6;
    const c = k % 2 === 0 ? orange : orangeDark;
    sphere(b, c, { pos: [0.24 * Math.cos(a), 0, 0.24 * Math.sin(a)], scale: [0.38, 0.55, 0.32] }, 1.0, 26, 18);
  }
  sphere(b, orange, { pos: [0, 0.02, 0], scale: [0.42, 0.56, 0.42] }, 1.0, 24, 16); // 芯
  // 瓜蒂（斜置）+ 叶子
  frustum(b, stemG, { pos: [0.03, 0.72, 0], rot: [0.16, 0, 0.18] }, 0.075, 0.05, 0.26, 14);
  sphere(b, leafG, { pos: [0.26, 0.70, 0.10], scale: [0.22, 0.05, 0.14], rot: [0, 0.5, 0] }, 1.0, 18, 10);
  // 鬼脸：眼睛（菱形薄盒）+ 锯齿嘴 + 鼻子
  for (const s of [-1, 1]) {
    box(b, face, { pos: [s * 0.20, 0.20, 0.575], rot: [0, 0, Math.PI / 4] }, 0.13, 0.13, 0.05);
  }
  box(b, face, { pos: [0, 0.03, 0.60], rot: [0, 0, Math.PI / 4] }, 0.09, 0.09, 0.05); // 鼻子
  for (let k = 0; k < 3; k++) {                                                        // 锯齿嘴
    box(b, face, { pos: [-0.16 + k * 0.16, -0.16 + (k % 2) * 0.05, 0.575], rot: [0, 0, Math.PI / 4] }, 0.11, 0.11, 0.05);
  }
}

// ---------------- 模型 12：小海龟 ----------------

function buildTurtle(b) {
  const shellG = [0.34, 0.52, 0.30], shellD = [0.26, 0.42, 0.24], skin = [0.46, 0.66, 0.36];
  const eye = [0.08, 0.08, 0.10], belly = [0.85, 0.82, 0.62];
  // 龟壳（扁椭球）+ 壳面鳞片 + 腹甲
  sphere(b, shellG, { pos: [0, 0.05, 0], scale: [0.72, 0.46, 0.92] }, 1.0, 40, 26);
  sphere(b, belly, { pos: [0, -0.22, 0], scale: [0.55, 0.18, 0.72] }, 1.0, 30, 18);
  const scutes = [
    [0, 0.42, 0.05, 0.20], [0.32, 0.34, 0.30, 0.16], [-0.32, 0.34, 0.30, 0.16],
    [0.32, 0.34, -0.30, 0.16], [-0.32, 0.34, -0.30, 0.16], [0, 0.36, -0.52, 0.15],
  ];
  for (const [x, y, z, r] of scutes) sphere(b, shellD, { pos: [x, y, z], scale: [1, 0.35, 1] }, r, 20, 12);
  // 头 + 眼睛 + 嘴
  sphere(b, skin, { pos: [0, 0.02, 0.92], scale: [0.24, 0.20, 0.26] }, 1.0, 28, 20);
  for (const s of [-1, 1]) {
    sphere(b, eye, { pos: [s * 0.10, 0.10, 1.06], scale: [1, 1, 0.6] }, 0.045, 14, 10);
  }
  frustum(b, [0.30, 0.25, 0.15], { pos: [0, -0.02, 1.16], rot: [Math.PI / 2, 0, 0] }, 0.07, 0.02, 0.10, 14); // 嘴
  // 四爪 + 尾巴
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    sphere(b, skin, { pos: [sx * 0.52, -0.16, sz * 0.50], scale: [0.20, 0.11, 0.28] }, 1.0, 20, 14);
  }
  frustum(b, skin, { pos: [0, -0.06, -0.90], rot: [-Math.PI / 2, 0, 0] }, 0.09, 0.02, 0.16, 14);
}

// ---------------- 模型 13：小猪 ----------------

function buildPig(b) {
  const pink = [0.96, 0.66, 0.70], pinkD = [0.90, 0.55, 0.60], dark = [0.12, 0.10, 0.12];
  const hoof = [0.45, 0.32, 0.34];
  sphere(b, pink, { pos: [0, -0.05, 0], scale: [0.62, 0.52, 0.78] }, 1.0, 40, 26);        // 身体
  sphere(b, pink, { pos: [0, 0.35, 0.52], scale: [1, 0.94, 0.96] }, 0.42, 36, 24);        // 头
  frustum(b, pinkD, { pos: [0, 0.28, 0.95], rot: [Math.PI / 2, 0, 0] }, 0.17, 0.15, 0.14, 24); // 猪鼻
  for (const s of [-1, 1]) {
    sphere(b, dark, { pos: [s * 0.06, 0.28, 1.02], scale: [1, 1, 0.5] }, 0.022, 12, 8);    // 鼻孔
    sphere(b, dark, { pos: [s * 0.16, 0.47, 0.86], scale: [1, 1, 0.7] }, 0.045, 14, 10);   // 眼睛
    // 耳朵（圆锥，斜向外）
    frustum(b, pinkD, { pos: [s * 0.27, 0.63, 0.38], rot: [0.2, 0, s * 0.35] }, 0.12, 0.0, 0.20, 16);
    // 腿 + 蹄
    frustum(b, pink, { pos: [s * 0.32, -0.52, 0.36] }, 0.10, 0.09, 0.30, 16);
    frustum(b, hoof, { pos: [s * 0.32, -0.70, 0.36] }, 0.095, 0.095, 0.06, 16);
    frustum(b, pink, { pos: [s * 0.32, -0.52, -0.34] }, 0.10, 0.09, 0.30, 16);
    frustum(b, hoof, { pos: [s * 0.32, -0.70, -0.34] }, 0.095, 0.095, 0.06, 16);
  }
  // 卷尾巴（小圆环，竖立）
  torus(b, pinkD, { pos: [0, -0.02, -0.86], rot: [0, 0, 0] }, 0.10, 0.028, 28, 12);
}

// ---------------- 模型 14：直升机 ----------------

function buildHeli(b) {
  const blue = [0.24, 0.46, 0.78], blueD = [0.18, 0.34, 0.60], grey = [0.55, 0.58, 0.62];
  const glass = [0.55, 0.82, 0.95], dark = [0.15, 0.16, 0.20], yellow = [1.0, 0.85, 0.35];
  sphere(b, blue, { pos: [0, 0.18, 0], scale: [0.55, 0.46, 0.95] }, 1.0, 40, 26);          // 机身
  sphere(b, glass, { pos: [0, 0.30, 0.55], scale: [0.40, 0.30, 0.42] }, 1.0, 28, 18);      // 座舱玻璃
  frustum(b, grey, { pos: [0, 0.56, 0] }, 0.06, 0.05, 0.22, 14);                            // 主旋翼轴
  frustum(b, grey, { pos: [0, 0.68, 0] }, 0.12, 0.10, 0.08, 20);                            // 旋翼毂
  box(b, dark, { pos: [0, 0.73, 0] }, 2.30, 0.035, 0.16);                                   // 主旋翼 1
  box(b, dark, { pos: [0, 0.73, 0], rot: [0, Math.PI / 2, 0] }, 2.30, 0.035, 0.16);         // 主旋翼 2
  frustum(b, blueD, { pos: [0, 0.16, -0.95], rot: [Math.PI / 2, 0, 0] }, 0.14, 0.06, 1.0, 20); // 尾梁
  frustum(b, grey, { pos: [0.10, 0.30, -1.42], rot: [0, 0, Math.PI / 2] }, 0.10, 0.09, 0.06, 16); // 尾旋翼毂
  box(b, dark, { pos: [0.10, 0.30, -1.42] }, 0.05, 0.90, 0.05);                             // 尾旋翼 1
  box(b, dark, { pos: [0.10, 0.30, -1.42], rot: [Math.PI / 2, 0, 0] }, 0.05, 0.90, 0.05);   // 尾旋翼 2
  frustum(b, yellow, { pos: [0, 0.06, 0.90], rot: [Math.PI / 2, 0, 0] }, 0.10, 0.0, 0.14, 14); // 机头灯
  for (const s of [-1, 1]) {
    box(b, grey, { pos: [s * 0.48, -0.42, 0] }, 0.10, 0.06, 1.40);                          // 起落滑橇
    box(b, grey, { pos: [s * 0.42, -0.22, 0.42] }, 0.06, 0.36, 0.06);                       // 前支柱
    box(b, grey, { pos: [s * 0.42, -0.22, -0.42] }, 0.06, 0.36, 0.06);                      // 后支柱
  }
}

// ---------------- 模型 15：咖啡杯 ----------------

function buildCoffee(b) {
  const ceramic = [0.93, 0.93, 0.96], ceramicD = [0.80, 0.82, 0.88];
  const coffee = [0.36, 0.21, 0.12], steel = [0.72, 0.75, 0.80];
  frustum(b, ceramic, { pos: [0, 0.10, 0] }, 0.40, 0.46, 0.56, 40);          // 杯身
  frustum(b, ceramicD, { pos: [0, -0.19, 0] }, 0.40, 0.34, 0.06, 40);        // 杯底
  sphere(b, coffee, { pos: [0, 0.35, 0], scale: [0.40, 0.035, 0.40] }, 1.0, 32, 16); // 咖啡液面
  torus(b, ceramic, { pos: [0.62, 0.12, 0], rot: [0, Math.PI / 2, 0] }, 0.20, 0.055, 40, 14); // 杯把
  frustum(b, ceramicD, { pos: [0, -0.27, 0] }, 0.66, 0.58, 0.07, 44);        // 碟子
  frustum(b, ceramicD, { pos: [0, -0.33, 0] }, 0.30, 0.26, 0.05, 28);        // 碟脚
  // 小勺：柄 + 勺头
  box(b, steel, { pos: [-0.42, 0.365, 0.18], rot: [0, 0.5, 0] }, 0.42, 0.028, 0.06);
  sphere(b, steel, { pos: [-0.66, 0.355, 0.28], scale: [0.11, 0.035, 0.09] }, 1.0, 20, 12);
}

// ---------------- 模型 16：小鱼 ----------------

function buildFish(b) {
  const orange = [0.96, 0.56, 0.18], orangeD = [0.88, 0.42, 0.12], fin = [0.99, 0.72, 0.32];
  const dark = [0.10, 0.09, 0.10], white = [0.98, 0.97, 0.94];
  sphere(b, orange, { pos: [0, 0, 0], scale: [0.62, 0.45, 0.90] }, 1.0, 40, 26);   // 身体
  frustum(b, orangeD, { pos: [0, 0, -0.98], rot: [Math.PI / 2, 0, 0] }, 0.30, 0.05, 0.42, 20); // 尾鳍
  sphere(b, fin, { pos: [0, 0.44, -0.10], scale: [0.07, 0.26, 0.36] }, 1.0, 20, 12); // 背鳍
  for (const s of [-1, 1]) {
    sphere(b, fin, { pos: [s * 0.48, -0.06, 0.10], scale: [0.10, 0.06, 0.24], rot: [0, 0, s * 0.4] }, 1.0, 20, 12); // 胸鳍
    sphere(b, white, { pos: [s * 0.26, 0.13, 0.80], scale: [1, 1, 0.7] }, 0.062, 18, 12); // 眼白
    sphere(b, dark, { pos: [s * 0.27, 0.13, 0.86], scale: [1, 1, 0.6] }, 0.032, 14, 10);  // 瞳孔
  }
  sphere(b, fin, { pos: [0, -0.30, 0.05], scale: [0.30, 0.10, 0.42] }, 1.0, 24, 14);  // 腹鳍
}

// ---------------- 模型 17：小猫 ----------------

function buildCat(b) {
  const fur = [0.92, 0.62, 0.30], furD = [0.82, 0.50, 0.22], pink = [0.95, 0.62, 0.64];
  const white = [0.97, 0.95, 0.92], dark = [0.12, 0.10, 0.10];
  sphere(b, fur, { pos: [0, -0.05, -0.05], scale: [0.55, 0.44, 0.66] }, 1.0, 36, 24);   // 身体
  sphere(b, white, { pos: [0, -0.18, 0.18], scale: [0.34, 0.22, 0.34] }, 1.0, 26, 16);   // 肚皮
  sphere(b, fur, { pos: [0, 0.42, 0.34], scale: [1, 0.95, 0.95] }, 0.40, 34, 22);        // 头
  for (const s of [-1, 1]) {
    frustum(b, furD, { pos: [s * 0.22, 0.74, 0.30], rot: [0.1, 0, s * 0.28] }, 0.14, 0.0, 0.24, 16); // 耳朵
    sphere(b, dark, { pos: [s * 0.15, 0.46, 0.68], scale: [1, 1, 0.7] }, 0.05, 16, 12);  // 眼睛
    sphere(b, white, { pos: [s * 0.07, 0.36, 0.70], scale: [1, 0.9, 0.8] }, 0.085, 18, 12); // 嘴套
    frustum(b, furD, { pos: [s * 0.28, -0.40, 0.28] }, 0.09, 0.08, 0.30, 14);            // 前腿
    frustum(b, furD, { pos: [s * 0.26, -0.40, -0.30] }, 0.10, 0.09, 0.30, 14);           // 后腿
    sphere(b, white, { pos: [s * 0.28, -0.55, 0.32], scale: [0.11, 0.06, 0.13] }, 1.0, 18, 12); // 前爪
  }
  sphere(b, pink, { pos: [0, 0.33, 0.74], scale: [1, 0.8, 0.8] }, 0.035, 14, 10);        // 鼻子
  // 尾巴（竖起的环）
  torus(b, furD, { pos: [0.12, 0.10, -0.62], rot: [0, 0.25, 0] }, 0.17, 0.05, 30, 12);
}

// ---------------- 模型 18：仙人掌 ----------------

function buildCactus(b) {
  const green = [0.30, 0.62, 0.34], greenD = [0.24, 0.52, 0.28];
  const pot = [0.76, 0.44, 0.30], potD = [0.62, 0.34, 0.22];
  const pink = [0.98, 0.62, 0.72], yellow = [1.0, 0.86, 0.35];
  frustum(b, pot, { pos: [0, -0.58, 0] }, 0.30, 0.38, 0.34, 36);            // 花盆
  frustum(b, potD, { pos: [0, -0.40, 0] }, 0.41, 0.40, 0.09, 36);           // 盆沿
  frustum(b, green, { pos: [0, 0.08, 0] }, 0.22, 0.20, 0.95, 22);           // 主干
  sphere(b, green, { pos: [0, 0.56, 0], scale: [0.20, 0.14, 0.20] }, 1.0, 22, 14); // 顶
  // 左臂（横+竖）
  frustum(b, green, { pos: [-0.30, 0.10, 0], rot: [0, 0, Math.PI / 2] }, 0.10, 0.09, 0.26, 16);
  frustum(b, greenD, { pos: [-0.44, 0.30, 0] }, 0.10, 0.10, 0.34, 16);
  sphere(b, greenD, { pos: [-0.44, 0.48, 0], scale: [1, 0.8, 1] }, 0.10, 16, 10);
  // 右臂（更高）
  frustum(b, green, { pos: [0.30, 0.24, 0], rot: [0, 0, Math.PI / 2] }, 0.10, 0.09, 0.26, 16);
  frustum(b, greenD, { pos: [0.44, 0.44, 0] }, 0.10, 0.10, 0.40, 16);
  sphere(b, greenD, { pos: [0.44, 0.66, 0], scale: [1, 0.8, 1] }, 0.10, 16, 10);
  // 顶花
  sphere(b, pink, { pos: [0, 0.70, 0], scale: [0.11, 0.06, 0.11] }, 1.0, 20, 12);
  sphere(b, yellow, { pos: [0, 0.76, 0], scale: [0.05, 0.04, 0.05] }, 1.0, 14, 10);
}

// ---------------- 配色皮肤 ----------------
// 只改顶点颜色、不改任何几何：切割平面表按几何标定，因此所有配色共用同一套
// 切割参数（水密性/体积守恒与颜色无关）。
export const PALETTES = {
  classic: { name: '经典', emoji: '🎨', hue: 0, sat: 1.0, light: 1.0 },
  neon: { name: '霓虹', emoji: '🌈', hue: 155, sat: 1.45, light: 1.06 },
  warm: { name: '暖冬', emoji: '🔥', hue: -28, sat: 0.92, light: 1.10 },
  mono: { name: '冷银', emoji: '❄️', hue: 0, sat: 0.08, light: 1.02 },
  festive: { name: '节日', emoji: '🎄', hue: -18, sat: 1.30, light: 1.05 },
  ocean: { name: '海洋', emoji: '🌊', hue: 170, sat: 1.15, light: 1.02 },
};

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

function rgb2hsl(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}

function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue2rgb = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
}

function applyPalette(verts, pal) {
  if (!pal) return;
  const hue = pal.hue || 0, sat = pal.sat == null ? 1 : pal.sat, light = pal.light == null ? 1 : pal.light;
  if (hue === 0 && sat === 1 && light === 1) return; // 经典配色：原样输出
  for (const v of verts) {
    const [h, s, l] = rgb2hsl(v[3], v[4], v[5]);
    const [r, g, b] = hsl2rgb(h + hue, clamp01(s * sat), clamp01(l * light));
    v[3] = r; v[4] = g; v[5] = b;
  }
}

// ---------------- 导出 ----------------

export const MODELS = {
  rocket: { name: '小火箭', emoji: '🚀', build: buildRocket },
  mushroom: { name: '蘑菇屋', emoji: '🍄', build: buildMushroom },
  gemplanet: { name: '宝石星球', emoji: '💎', build: buildGemPlanet },
  castle: { name: '梦幻城堡', emoji: '🏰', build: buildCastle },
  penguin: { name: '软萌企鹅', emoji: '🐧', build: buildPenguin },
  gift: { name: '礼物盒子', emoji: '🎁', build: buildGift },
  car: { name: '迷你赛车', emoji: '🚗', build: buildCar },
  xmas: { name: '圣诞树', emoji: '🎄', build: buildXmas },
  rabbit: { name: '软萌小兔', emoji: '🐰', build: buildRabbit },
  globe: { name: '蔚蓝地球', emoji: '🌍', build: buildGlobe },
  pumpkin: { name: '南瓜灯', emoji: '🎃', build: buildPumpkin },
  turtle: { name: '小海龟', emoji: '🐢', build: buildTurtle },
  pig: { name: '小猪', emoji: '🐷', build: buildPig },
  heli: { name: '直升机', emoji: '🚁', build: buildHeli },
  coffee: { name: '咖啡杯', emoji: '☕', build: buildCoffee },
  fish: { name: '小鱼', emoji: '🐟', build: buildFish },
  cat: { name: '小猫', emoji: '🐱', build: buildCat },
  cactus: { name: '仙人掌', emoji: '🌵', build: buildCactus },
};

// 构建模型 → { obj, center[3], radius }（包围球自动计算）
// palette：PALETTES 的键，默认经典；配色只影响顶点颜色，几何完全一致。
export function buildModel(key, palette = 'classic') {
  const def = MODELS[key];
  if (!def) throw new Error(`unknown model: ${key}`);
  const b = new ObjBuilder();
  def.build(b);
  applyPalette(b.verts, PALETTES[palette] || PALETTES.classic);
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (const v of b.verts) for (let k = 0; k < 3; k++) { if (v[k] < mn[k]) mn[k] = v[k]; if (v[k] > mx[k]) mx[k] = v[k]; }
  const center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  let radius = 0;
  for (const v of b.verts) {
    const d = Math.hypot(v[0] - center[0], v[1] - center[1], v[2] - center[2]);
    if (d > radius) radius = d;
  }
  return { key, name: def.name, emoji: def.emoji, obj: b.toString(), center, radius };
}
