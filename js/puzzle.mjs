// 3D 拼图切割引擎 v4 — 轴对齐平面切割 + 每刀即时双侧封盖
//
// 架构（关键设计：每刀后立即把两侧都封成闭合壳）：
//   1. cutPass：三角形按顶点严格符号分类，同侧整体归入（落面/单侧按质心分侧，
//      保证每张三角形面积恰好分配到一侧）；跨面沿交线拆分，交点按"边端点对"
//      去重缓存（同一条边只产生一个交点，两侧共享 → 无 T 型连接、无裂缝）。
//   2. capSide：封闭壳与平面相交必为闭曲线 → 收集该侧"两端都在切面上且无向
//      计数为 1"的有向边界边，沿出边行走成环；封盖多边形 = 环的反序
//      （立方体切半例推导：表面有向边绕行方向决定封盖绕向，对前后两侧通用），
//      耳切三角化。中间壳的封盖会被后续切割干净地剖分，剖分直边与下一刀的
//      封盖边自动反向配对 —— 无需任何弦闭合逻辑。
//   3. capSide 末尾做全量有向边普查断言：每条有向边恰出现一次且有反向配对
//      ——拼片在构造时即被证明水密，坏数据直接抛错而不是流入渲染。
//
// 历史教训（见 test/ 记录）：
//   - SNAP 顶点吸附把成串顶点压到切面上制造非流形 → 已移除
//   - 切割顶点按位置去重会把不同壳体（几何交叉处相距 <1µm 的交点）焊在一起，
//     封盖环自接触 → 改为按边端点对去重
//   - "全落面三角形归前侧"会在前侧留下双倍覆盖 → 改为按质心分侧
//   - box() 每面独立角落顶点必须按位置焊接，否则索引级水密性不成立
//   - 行走环时起点重复入环（push 顺序错误）会让所有封盖环多一个重复顶点
import { buildModel } from './models.mjs';

const AXIS = { x: 0, y: 1, z: 2 };
const ONP_EPS = 1e-9;   // 顶点"在切割面上"判定容差（切割点由双精度插值，误差 ~1e-16）
const AREA_EPS = 1e-12; // 耳切最小三角形面积（投影 2D）

// 每个模型的切割平面表（居中坐标，键 = 目标块数 = 平面数 + 1）。
// 由 tools/calibrate-cuts.mjs 自动标定（安全间隙 + 水密 + 体积守恒三重校验），
// 不要手工改数值——几何调整后重跑标定工具即可。
// >>> CUT_TABLE_START（标定工具生成，勿手改）
export const CUT_TABLE = {
 'rocket': {
  '2': [
   [
    'z',
    -0.011085
   ]
  ],
  '3': [
   [
    'y',
    -0.12905
   ],
   [
    'z',
    -0.011085
   ]
  ],
  '4': [
   [
    'x',
    -0.1762
   ],
   [
    'y',
    -0.12905
   ],
   [
    'z',
    -0.011085
   ]
  ],
  '6': [
   [
    'x',
    -0.1762
   ],
   [
    'x',
    0.1762
   ],
   [
    'y',
    -0.12905
   ],
   [
    'z',
    -0.011085
   ],
   [
    'z',
    0.089515
   ]
  ],
  '8': [
   [
    'x',
    -0.1762
   ],
   [
    'x',
    0.1762
   ],
   [
    'y',
    -0.24875
   ],
   [
    'y',
    -0.12905
   ],
   [
    'z',
    -0.011085
   ],
   [
    'z',
    0.045865
   ],
   [
    'z',
    0.130015
   ]
  ]
 },
 'mushroom': {
  '2': [
   [
    'z',
    0.0058
   ]
  ],
  '3': [
   [
    'y',
    0.0025
   ],
   [
    'z',
    0.0058
   ]
  ],
  '4': [
   [
    'x',
    0.1523
   ],
   [
    'y',
    0.0025
   ],
   [
    'z',
    0.0058
   ]
  ],
  '6': [
   [
    'x',
    -0.6221
   ],
   [
    'x',
    0.1523
   ],
   [
    'x',
    0.72785
   ],
   [
    'y',
    0.0025
   ],
   [
    'z',
    0.0058
   ]
  ],
  '8': [
   [
    'x',
    -0.6221
   ],
   [
    'x',
    0.1523
   ],
   [
    'y',
    0.0025
   ],
   [
    'y',
    0.11955
   ],
   [
    'z',
    -0.48965
   ],
   [
    'z',
    0.0058
   ],
   [
    'z',
    0.53385
   ]
  ]
 },
 'gemplanet': {
  '2': [
   [
    'z',
    -0.38305
   ]
  ],
  '3': [
   [
    'y',
    -0.093544
   ],
   [
    'z',
    -0.38305
   ]
  ],
  '4': [
   [
    'x',
    0.551
   ],
   [
    'y',
    -0.093544
   ],
   [
    'z',
    -0.38305
   ]
  ],
  '6': [
   [
    'x',
    0.551
   ],
   [
    'y',
    -0.271894
   ],
   [
    'y',
    -0.093544
   ],
   [
    'z',
    -0.38305
   ],
   [
    'z',
    0.4574
   ]
  ],
  '8': [
   [
    'x',
    0.551
   ],
   [
    'y',
    -0.365494
   ],
   [
    'y',
    -0.271894
   ],
   [
    'y',
    -0.194994
   ],
   [
    'y',
    -0.093544
   ],
   [
    'z',
    -0.38305
   ],
   [
    'z',
    0.4574
   ]
  ]
 },
 'castle': {
  '2': [
   [
    'z',
    -0.0955
   ]
  ],
  '3': [
   [
    'y',
    0.0025
   ],
   [
    'z',
    -0.0955
   ]
  ],
  '4': [
   [
    'x',
    -0.0955
   ],
   [
    'y',
    0.0025
   ],
   [
    'z',
    -0.0955
   ]
  ],
  '6': [
   [
    'x',
    -0.0955
   ],
   [
    'x',
    0.1402
   ],
   [
    'y',
    0.0025
   ],
   [
    'z',
    -0.0955
   ],
   [
    'z',
    0.1402
   ]
  ],
  '8': [
   [
    'x',
    -0.0955
   ],
   [
    'x',
    0.1402
   ],
   [
    'y',
    -0.125
   ],
   [
    'y',
    0.0025
   ],
   [
    'z',
    -0.2195
   ],
   [
    'z',
    -0.0955
   ],
   [
    'z',
    0.0955
   ]
  ]
 },
 'penguin': {
  '2': [
   [
    'z',
    -0.04705
   ]
  ],
  '3': [
   [
    'y',
    -0.01725
   ],
   [
    'z',
    -0.04705
   ]
  ],
  '4': [
   [
    'x',
    -0.00415
   ],
   [
    'y',
    -0.01725
   ],
   [
    'z',
    -0.04705
   ]
  ],
  '6': [
   [
    'x',
    -0.3982
   ],
   [
    'x',
    -0.00415
   ],
   [
    'y',
    -0.01725
   ],
   [
    'z',
    -0.24965
   ],
   [
    'z',
    -0.04705
   ]
  ],
  '8': [
   [
    'x',
    -0.3982
   ],
   [
    'x',
    -0.00415
   ],
   [
    'x',
    0.3982
   ],
   [
    'y',
    -0.01725
   ],
   [
    'z',
    -0.38785
   ],
   [
    'z',
    -0.24965
   ],
   [
    'z',
    -0.04705
   ]
  ]
 },
 'gift': {
  '2': [
   [
    'z',
    -0.0033
   ]
  ],
  '3': [
   [
    'y',
    -0.164031
   ],
   [
    'z',
    -0.0033
   ]
  ],
  '4': [
   [
    'x',
    -0.1222
   ],
   [
    'y',
    -0.164031
   ],
   [
    'z',
    -0.0033
   ]
  ],
  '6': [
   [
    'x',
    -0.1222
   ],
   [
    'x',
    0.1222
   ],
   [
    'y',
    -0.164031
   ],
   [
    'y',
    0.193469
   ],
   [
    'z',
    -0.0033
   ]
  ],
  '8': [
   [
    'x',
    -0.1222
   ],
   [
    'x',
    0.1222
   ],
   [
    'y',
    -0.164031
   ],
   [
    'y',
    0.193469
   ],
   [
    'y',
    0.276919
   ],
   [
    'z',
    -0.03975
   ],
   [
    'z',
    0.03975
   ]
  ]
 },
 'car': {
  '2': [
   [
    'z',
    0
   ]
  ],
  '3': [
   [
    'y',
    -0.0091
   ],
   [
    'z',
    0
   ]
  ],
  '4': [
   [
    'x',
    0
   ],
   [
    'y',
    -0.0091
   ],
   [
    'z',
    0
   ]
  ],
  '6': [
   [
    'x',
    -0.215
   ],
   [
    'x',
    0
   ],
   [
    'y',
    -0.0091
   ],
   [
    'z',
    -0.21815
   ],
   [
    'z',
    0
   ]
  ],
  '8': [
   [
    'x',
    -0.215
   ],
   [
    'x',
    0
   ],
   [
    'x',
    0.215
   ],
   [
    'y',
    -0.0091
   ],
   [
    'z',
    -0.21815
   ],
   [
    'z',
    0
   ],
   [
    'z',
    0.21815
   ]
  ]
 },
 'xmas': {
  '2': [
   [
    'z',
    -0.3325
   ]
  ],
  '3': [
   [
    'y',
    0.0032
   ],
   [
    'z',
    -0.3325
   ]
  ],
  '4': [
   [
    'x',
    -0.4819
   ],
   [
    'y',
    0.0032
   ],
   [
    'z',
    -0.3325
   ]
  ],
  '6': [
   [
    'x',
    -0.4819
   ],
   [
    'y',
    -0.05795
   ],
   [
    'y',
    0.0307
   ],
   [
    'z',
    -0.3325
   ],
   [
    'z',
    0.3534
   ]
  ]
 },
 'rabbit': {
  '2': [
   [
    'z',
    -0.150015
   ]
  ],
  '3': [
   [
    'y',
    0.013
   ],
   [
    'z',
    -0.150015
   ]
  ],
  '4': [
   [
    'x',
    -0.34495
   ],
   [
    'y',
    0.013
   ],
   [
    'z',
    -0.150015
   ]
  ],
  '6': [
   [
    'x',
    -0.34495
   ],
   [
    'x',
    0.34495
   ],
   [
    'z',
    -0.150015
   ],
   [
    'z',
    0.216035
   ],
   [
    'y',
    0.013
   ]
  ],
  '8': [
   [
    'x',
    -0.4058
   ],
   [
    'x',
    -0.34495
   ],
   [
    'y',
    -0.1063
   ],
   [
    'y',
    0.013
   ],
   [
    'z',
    -0.203215
   ],
   [
    'z',
    -0.150015
   ],
   [
    'z',
    0.216035
   ]
  ]
 },
 'globe': {
  '2': [
   [
    'z',
    -0.002411
   ]
  ],
  '3': [
   [
    'y',
    0.00355
   ],
   [
    'z',
    -0.002411
   ]
  ],
  '4': [
   [
    'x',
    0.00405
   ],
   [
    'y',
    0.00355
   ],
   [
    'z',
    -0.002411
   ]
  ],
  '6': [
   [
    'x',
    -0.4931
   ],
   [
    'x',
    0.00405
   ],
   [
    'y',
    0.00355
   ],
   [
    'z',
    -0.002411
   ],
   [
    'z',
    0.316339
   ]
  ],
  '8': [
   [
    'x',
    -0.1763
   ],
   [
    'x',
    0.00405
   ],
   [
    'y',
    -0.0221
   ],
   [
    'y',
    0.0809
   ],
   [
    'z',
    -0.133961
   ],
   [
    'z',
    -0.002411
   ],
   [
    'z',
    0.316339
   ]
  ]
 },
 'pumpkin': {
  '2': [
   [
    'z',
    -0.019144
   ]
  ],
  '3': [
   [
    'y',
    0.004713
   ],
   [
    'z',
    -0.019144
   ]
  ],
  '4': [
   [
    'x',
    -0.21395
   ],
   [
    'y',
    0.004713
   ],
   [
    'z',
    -0.019144
   ]
  ],
  '6': [
   [
    'x',
    -0.21395
   ],
   [
    'x',
    0.2664
   ],
   [
    'y',
    0.004713
   ],
   [
    'z',
    -0.019144
   ],
   [
    'z',
    0.128406
   ]
  ],
  '8': [
   [
    'x',
    -0.21395
   ],
   [
    'x',
    0.2664
   ],
   [
    'y',
    -0.092187
   ],
   [
    'y',
    0.040063
   ],
   [
    'z',
    -0.134094
   ],
   [
    'z',
    -0.019144
   ],
   [
    'z',
    0.073556
   ]
  ]
 },
 'turtle': {
  '2': [
   [
    'z',
    -0.0568
   ]
  ],
  '3': [
   [
    'y',
    0.00315
   ],
   [
    'z',
    -0.0568
   ]
  ],
  '4': [
   [
    'x',
    -0.24795
   ],
   [
    'y',
    0.00315
   ],
   [
    'z',
    -0.0568
   ]
  ],
  '6': [
   [
    'x',
    -0.24795
   ],
   [
    'x',
    0.24795
   ],
   [
    'y',
    0.00315
   ],
   [
    'z',
    -0.15475
   ],
   [
    'z',
    0.0861
   ]
  ],
  '8': [
   [
    'x',
    -0.24795
   ],
   [
    'x',
    0.24795
   ],
   [
    'y',
    -0.02805
   ],
   [
    'y',
    0.01855
   ],
   [
    'z',
    -0.1727
   ],
   [
    'z',
    -0.0568
   ],
   [
    'z',
    0.0861
   ]
  ]
 },
 'pig': {
  '2': [
   [
    'z',
    0.0004
   ]
  ],
  '3': [
   [
    'y',
    -0.0083
   ],
   [
    'z',
    0.0004
   ]
  ],
  '4': [
   [
    'x',
    -0.00475
   ],
   [
    'y',
    -0.0083
   ],
   [
    'z',
    0.0004
   ]
  ],
  '6': [
   [
    'x',
    -0.34505
   ],
   [
    'x',
    -0.00475
   ],
   [
    'x',
    0.34505
   ],
   [
    'y',
    -0.0083
   ],
   [
    'z',
    0.0004
   ]
  ]
 },
 'heli': {
  '2': [
   [
    'z',
    -0.00375
   ]
  ],
  '3': [
   [
    'y',
    0.00375
   ],
   [
    'z',
    -0.00375
   ]
  ],
  '4': [
   [
    'x',
    0.423
   ],
   [
    'y',
    0.00375
   ],
   [
    'z',
    -0.00375
   ]
  ],
  '6': [
   [
    'x',
    0.423
   ],
   [
    'y',
    -0.07575
   ],
   [
    'y',
    0.01925
   ],
   [
    'z',
    -0.1102
   ],
   [
    'z',
    0.10775
   ]
  ],
  '8': [
   [
    'x',
    -0.423
   ],
   [
    'x',
    0.423
   ],
   [
    'y',
    -0.06305
   ],
   [
    'y',
    0.00375
   ],
   [
    'y',
    0.0951
   ],
   [
    'z',
    -0.00375
   ],
   [
    'z',
    0.1506
   ]
  ]
 },
 'coffee': {
  '2': [
   [
    'z',
    -0.0076
   ]
  ],
  '3': [
   [
    'y',
    -0.0043
   ],
   [
    'z',
    -0.0076
   ]
  ],
  '4': [
   [
    'x',
    -0.0042
   ],
   [
    'y',
    -0.0043
   ],
   [
    'z',
    -0.0076
   ]
  ],
  '6': [
   [
    'x',
    -0.0042
   ],
   [
    'y',
    -0.0043
   ],
   [
    'y',
    0.08055
   ],
   [
    'z',
    -0.19235
   ],
   [
    'z',
    -0.0076
   ]
  ],
  '8': [
   [
    'x',
    -0.08915
   ],
   [
    'x',
    -0.0042
   ],
   [
    'y',
    -0.0043
   ],
   [
    'y',
    0.0542
   ],
   [
    'z',
    -0.29635
   ],
   [
    'z',
    -0.19235
   ],
   [
    'z',
    -0.0076
   ]
  ]
 },
 'fish': {
  '2': [
   [
    'z',
    -0.0221
   ]
  ],
  '3': [
   [
    'y',
    0.00005
   ],
   [
    'z',
    -0.0221
   ]
  ],
  '4': [
   [
    'x',
    -0.0028
   ],
   [
    'y',
    0.00005
   ],
   [
    'z',
    -0.0221
   ]
  ],
  '6': [
   [
    'x',
    -0.0028
   ],
   [
    'y',
    0.00005
   ],
   [
    'z',
    -0.17875
   ],
   [
    'z',
    -0.0221
   ],
   [
    'z',
    0.1664
   ]
  ],
  '8': [
   [
    'x',
    -0.08285
   ],
   [
    'x',
    -0.0028
   ],
   [
    'y',
    -0.0364
   ],
   [
    'y',
    0.02735
   ],
   [
    'z',
    -0.14505
   ],
   [
    'z',
    -0.0221
   ],
   [
    'z',
    0.1664
   ]
  ]
 },
 'cat': {
  '2': [
   [
    'z',
    0.021825
   ]
  ],
  '3': [
   [
    'y',
    -0.000675
   ],
   [
    'z',
    0.021825
   ]
  ],
  '4': [
   [
    'x',
    0.4035
   ],
   [
    'y',
    -0.000675
   ],
   [
    'z',
    0.021825
   ]
  ],
  '6': [
   [
    'x',
    -0.4035
   ],
   [
    'x',
    0.4035
   ],
   [
    'y',
    -0.000675
   ],
   [
    'z',
    -0.108975
   ],
   [
    'z',
    0.080875
   ]
  ],
  '8': [
   [
    'x',
    -0.4035
   ],
   [
    'x',
    0.4035
   ],
   [
    'y',
    -0.053275
   ],
   [
    'y',
    0.024275
   ],
   [
    'z',
    -0.134325
   ],
   [
    'z',
    -0.035625
   ],
   [
    'z',
    0.080875
   ]
  ]
 },
 'cactus': {
  '2': [
   [
    'z',
    -0.00335
   ]
  ],
  '3': [
   [
    'y',
    -0.0019
   ],
   [
    'z',
    -0.00335
   ]
  ],
  '4': [
   [
    'x',
    0.0982
   ],
   [
    'y',
    -0.0019
   ],
   [
    'z',
    -0.00335
   ]
  ],
  '6': [
   [
    'x',
    -0.0982
   ],
   [
    'x',
    0.0982
   ],
   [
    'y',
    -0.0019
   ],
   [
    'z',
    -0.00335
   ],
   [
    'z',
    0.121
   ]
  ],
  '8': [
   [
    'x',
    -0.0982
   ],
   [
    'x',
    0.0982
   ],
   [
    'y',
    -0.10375
   ],
   [
    'y',
    0.02405
   ],
   [
    'z',
    -0.121
   ],
   [
    'z',
    -0.00335
   ],
   [
    'z',
    0.121
   ]
  ]
 }
};
// <<< CUT_TABLE_END

// ---------------- OBJ 解析（v x y z r g b + f a b c） ----------------

export function parseObj(obj) {
  const positions = [];
  const tris = [];
  for (const line of obj.split('\n')) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v') {
      positions.push(parseFloat(p[1]), parseFloat(p[2]), parseFloat(p[3]),
        parseFloat(p[4]), parseFloat(p[5]), parseFloat(p[6]));
    } else if (p[0] === 'f') {
      tris.push(parseInt(p[1], 10) - 1, parseInt(p[2], 10) - 1, parseInt(p[3], 10) - 1);
    }
  }
  return { positions, tris };
}

function eKey(a, b) { return a < b ? a + '_' + b : b + '_' + a; }

// ---------------- 单道切割（不封盖） ----------------

// 把 (V, I) 网格沿 axis 轴 plane 平面切开，返回 { back, front }（均无封盖）。
export function cutPass(Vin, Iin, axis, plane) {
  const V = Vin;
  const nV = V.length / 6;
  const d = new Float64Array(nV);
  for (let i = 0; i < nV; i++) d[i] = V[i * 6 + axis] - plane;

  const sides = [0, 1].map(() => ({ V: [], I: [], orig: new Map(), cut: new Map() }));
  const cutPos = [];        // vid → [x,y,z,r,g,b]
  const cutKey = new Map(); // "min_max"（原顶点索引对）→ vid

  function resolve(side, h) {
    const s = sides[side];
    if (h >= 0) {
      let id = s.orig.get(h);
      if (id === undefined) {
        id = s.V.length / 6;
        for (let c = 0; c < 6; c++) s.V.push(V[h * 6 + c]);
        s.orig.set(h, id);
      }
      return id;
    }
    const vid = -1 - h;
    let id = s.cut.get(vid);
    if (id === undefined) {
      id = s.V.length / 6;
      const p = cutPos[vid];
      for (let c = 0; c < 6; c++) s.V.push(p[c]);
      s.cut.set(vid, id);
    }
    return id;
  }

  function internCut(u, v) {
    if (!((d[u] < 0 && d[v] > 0) || (d[u] > 0 && d[v] < 0))) throw new Error('切割边端点未严格跨越平面');
    // 按边端点对去重：同一条边只产生一个交点（两侧共享 → 无 T 型连接）。
    // 不要按位置去重——模型是多个独立封闭壳（球/环/锥互不共享顶点），不同壳
    // 在几何交叉处可产生相距 <1µm 的不同交点，按位置合并会把两壳的边界曲线
    // 错误地拓扑连接，封盖环自接触（真实教训，见 test 记录）。
    const key = Math.min(u, v) + '_' + Math.max(u, v);
    let vid = cutKey.get(key);
    if (vid === undefined) {
      const t = d[u] / (d[u] - d[v]); // 严格异号 → t ∈ (0,1)
      const p = new Array(6);
      for (let c = 0; c < 6; c++) p[c] = V[u * 6 + c] + (V[v * 6 + c] - V[u * 6 + c]) * t;
      vid = cutPos.length;
      cutPos.push(p);
      cutKey.set(key, vid);
    }
    return -1 - vid; // 切割顶点句柄（负数编码）
  }

  function emitPoly(side, hs) {
    if (new Set(hs).size !== hs.length) throw new Error('子多边形顶点重复: ' + hs.join(','));
    const local = hs.map((h) => resolve(side, h));
    const s = sides[side];
    if (hs.length === 3) s.I.push(local[0], local[1], local[2]);
    else if (hs.length === 4) s.I.push(local[0], local[1], local[2], local[0], local[2], local[3]);
    else throw new Error('子多边形顶点数异常: ' + hs.length);
  }

  const triCount = Iin.length / 3;
  for (let t = 0; t < triCount; t++) {
    const tri = [Iin[t * 3], Iin[t * 3 + 1], Iin[t * 3 + 2]];
    const strictB = tri.filter((h) => d[h] < 0);
    const strictF = tri.filter((h) => d[h] > 0);
    if (!strictB.length || !strictF.length) {
      // 落面/单侧三角形：按质心分侧（构造上保证每张三角形面积恰好分配到一侧，
      // 两侧都不多不少——"全落面归前侧"会在前侧留下双倍覆盖的非流形壳）
      const cx = (d[tri[0]] + d[tri[1]] + d[tri[2]]) / 3;
      emitPoly(cx < 0 ? 0 : 1, tri);
      continue;
    }
    // 跨面：沿周向行走构造两侧子多边形（落面顶点同时进入两侧）
    const backPoly = [], frontPoly = [];
    for (let k = 0; k < 3; k++) {
      const u = tri[k], v = tri[(k + 1) % 3];
      if (d[u] < 0) backPoly.push(u);
      else if (d[u] > 0) frontPoly.push(u);
      else { backPoly.push(u); frontPoly.push(u); }
      if (d[u] * d[v] < 0) { const P = internCut(u, v); backPoly.push(P); frontPoly.push(P); }
    }
    emitPoly(0, backPoly);
    emitPoly(1, frontPoly);
  }

  return {
    back: { V: sides[0].V, I: sides[0].I },
    front: { V: sides[1].V, I: sides[1].I },
  };
}

// ---------------- 耳切三角化（简单多边形，投影到切割面 2D；保持输入绕向） ----------------

function earClip(poly, V, axis) {
  const u = (axis + 1) % 3, w = (axis + 2) % 3;
  let ring = poly.map((vi) => ({ vi, x: V[vi * 6 + u], y: V[vi * 6 + w] }));
  let A = 0;
  for (let i = 0; i < ring.length; i++) A += ring[i].x * ring[(i + 1) % ring.length].y - ring[(i + 1) % ring.length].x * ring[i].y;
  const flipped = A < 0; // 输入为顺时针：内部按逆时针处理，输出三角形再翻转回来
  if (flipped) ring = ring.slice().reverse();

  const area2 = (a, b, c) => (ring[b].x - ring[a].x) * (ring[c].y - ring[a].y) - (ring[b].y - ring[a].y) * (ring[c].x - ring[a].x);
  const inTri = (p, a, b, c) => {
    const s1 = (ring[b].x - ring[a].x) * (ring[p].y - ring[a].y) - (ring[b].y - ring[a].y) * (ring[p].x - ring[a].x);
    const s2 = (ring[c].x - ring[b].x) * (ring[p].y - ring[b].y) - (ring[c].y - ring[b].y) * (ring[p].x - ring[b].x);
    const s3 = (ring[a].x - ring[c].x) * (ring[p].y - ring[c].y) - (ring[a].y - ring[c].y) * (ring[p].x - ring[c].x);
    return s1 > AREA_EPS && s2 > AREA_EPS && s3 > AREA_EPS;
  };

  const out = [];
  let guard = 0;
  while (ring.length > 3) {
    if (guard++ > 50000) throw new Error('耳切未收敛（多边形可能自相交）');
    const m = ring.length;
    let bestI = -1, bestArea = -1;
    for (let i = 0; i < m; i++) {
      const p0 = (i + m - 1) % m, p1 = i, p2 = (i + 1) % m;
      const cr = area2(p0, p1, p2);
      if (cr <= AREA_EPS) continue; // 反顶点或退化
      let blocked = false;
      for (let j = 0; j < m; j++) {
        if (j === p0 || j === p1 || j === p2) continue;
        if (inTri(j, p0, p1, p2)) { blocked = true; break; }
      }
      if (!blocked) { bestI = i; bestArea = cr; break; }
    }
    if (bestI < 0) {
      // 兜底：取最大凸耳强行剪下（保证推进；重叠几何不影响拓扑普查）
      for (let i = 0; i < ring.length; i++) {
        const cr = area2((i + ring.length - 1) % ring.length, i, (i + 1) % ring.length);
        if (cr > bestArea) { bestArea = cr; bestI = i; }
      }
      if (bestI < 0) throw new Error('耳切失败：无凸顶点');
    }
    const m2 = ring.length;
    out.push([ring[(bestI + m2 - 1) % m2].vi, ring[bestI].vi, ring[(bestI + 1) % m2].vi]);
    ring.splice(bestI, 1);
  }
  out.push([ring[0].vi, ring[1].vi, ring[2].vi]);
  if (flipped) for (const t of out) t.reverse();
  return out;
}

// ---------------- 单侧封盖（闭曲线行走 + 环反序 + 耳切） ----------------

// 把 reg 的开放边界（在 axis 轴 plane 平面上的闭曲线）封上盖，返回新 reg。
// 绕向规则（立方体切半例推导，对前后两侧通用）：表面三角形绕向朝外 →
// 切面上有向边界边首尾相接成"顺行环"；封盖多边形 = 顺行环的反序，
// 封盖边与表面边自动反向配对，法线自动指向壳外。
function capSide(reg, axis, plane, label) {
  const V = reg.V;
  const I = reg.I.slice();
  const onP = (i) => Math.abs(V[i * 6 + axis] - plane) < ONP_EPS;

  // 该平面上"两端都在面上"的无向边计数
  const und = new Map();
  for (let t = 0; t < I.length / 3; t++) {
    const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    for (let k = 0; k < 3; k++) {
      const p = ids[k], q = ids[(k + 1) % 3];
      if (onP(p) && onP(q)) und.set(eKey(p, q), (und.get(eKey(p, q)) || 0) + 1);
    }
  }
  if (!und.size) return { V, I };

  // 有向边界边：tail → head（无向计数为 1 才是边界；2 = 内部共享边）
  const outEdge = new Map();
  for (let t = 0; t < I.length / 3; t++) {
    const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    for (let k = 0; k < 3; k++) {
      const p = ids[k], q = ids[(k + 1) % 3];
      if (!(onP(p) && onP(q))) continue;
      if (und.get(eKey(p, q)) !== 1) continue;
      if (outEdge.has(p) && outEdge.get(p) !== q) {
        throw new Error(`补面顶点多重出边(${label}): ${p} → ${outEdge.get(p)} / ${q}（切面可能掠擦表面，请调整切割平面位置）`);
      }
      outEdge.set(p, q);
    }
  }
  if (!outEdge.size) return { V, I };

  const used = new Set();
  for (const [tail, head] of outEdge) {
    if (used.has(eKey(tail, head))) continue;
    const ring = [tail];
    used.add(eKey(tail, head));
    let cur = head, closed = false;
    for (let g = 0; g < 1000000; g++) {
      if (cur === tail) { closed = true; break; } // 闭环（起点不重复入环）
      ring.push(cur);
      const nxt = outEdge.get(cur);
      if (nxt === undefined) break; // 开放弧：封闭壳不该出现
      used.add(eKey(cur, nxt));
      cur = nxt;
    }
    if (!closed) throw new Error(`补面环未闭合(${label}) 起点 ${tail} 长 ${ring.length}`);
    if (ring.length < 3) continue;
    const capPoly = ring.slice().reverse();
    for (const tri of earClip(capPoly, V, axis)) I.push(tri[0], tri[1], tri[2]);
  }

  // 水密断言：每条有向边恰出现一次且有反向配对
  const dir = new Map();
  for (let t = 0; t < I.length / 3; t++) {
    const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    for (let k = 0; k < 3; k++) {
      const key = ids[k] + '_' + ids[(k + 1) % 3];
      dir.set(key, (dir.get(key) || 0) + 1);
    }
  }
  for (const [key, c] of dir) {
    if (c !== 1) throw new Error(`水密断言失败(${label}): 有向边 ${key} 出现 ${c} 次`);
    const [a, b] = key.split('_');
    if (!dir.has(b + '_' + a)) throw new Error(`水密断言失败(${label}): 有向边 ${key} 无反向配对`);
  }

  return { V, I };
}

// ---------------- 拼片包装与主入口 ----------------

function makePiece(reg) {
  const nV = reg.V.length / 6;
  const nT = reg.I.length / 3;
  if (nT === 0) throw new Error('切割产生空拼片');
  for (let i = 0; i < reg.I.length; i++) {
    if (reg.I[i] < 0 || reg.I[i] >= nV) throw new Error('索引越界');
  }
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < nV; i++) for (let c = 0; c < 3; c++) {
    const v = reg.V[i * 6 + c];
    if (!Number.isFinite(v)) throw new Error('顶点坐标非有限值');
    if (v < mn[c]) mn[c] = v;
    if (v > mx[c]) mx[c] = v;
  }
  const center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  let radius = 0;
  for (let i = 0; i < nV; i++) {
    const dd = Math.hypot(reg.V[i * 6] - center[0], reg.V[i * 6 + 1] - center[1], reg.V[i * 6 + 2] - center[2]);
    if (dd > radius) radius = dd;
  }
  return { positions: new Float32Array(reg.V), indices: new Uint32Array(reg.I), triCount: nT, center, radius };
}

const cache = new Map();

// 用显式平面序列切一个模型（不做缓存）。供标定工具与 splitIntoPieces 共用。
// palette 只影响顶点颜色，几何与切割平面表完全一致（标定结果对所有配色通用）。
export function splitWithPlanes(modelKey, planes, palette = 'classic') {
  const model = buildModel(modelKey, palette);
  const { positions, tris } = parseObj(model.obj);
  if (!positions.length || !tris.length) throw new Error('模型为空');

  // 按位置焊接重复顶点：box() 等生成器的每个面有独立的角落顶点副本（位置相同、
  // 索引不同），不焊接则索引级水密性不成立。位置相同 = 拓扑同一点。
  const weld = new Map();
  const V = [];
  const remap = new Uint32Array(positions.length / 6);
  for (let i = 0; i < positions.length / 6; i++) {
    const k = positions[i * 6].toFixed(6) + '|' + positions[i * 6 + 1].toFixed(6) + '|' + positions[i * 6 + 2].toFixed(6);
    let id = weld.get(k);
    if (id === undefined) {
      id = V.length / 6;
      for (let c = 0; c < 6; c++) V.push(positions[i * 6 + c]);
      weld.set(k, id);
    }
    remap[i] = id;
  }
  const I0 = new Array(tris.length);
  for (let i = 0; i < tris.length; i++) I0[i] = remap[tris[i]];

  for (let i = 0; i < V.length; i += 6) {
    V[i] -= model.center[0]; V[i + 1] -= model.center[1]; V[i + 2] -= model.center[2];
  }

  let cur = { V, I: I0 };
  const pieces = [];
  for (const [axisName, planePos] of planes) {
    const axis = AXIS[axisName];
    if (axis === undefined) throw new Error('未知切割轴: ' + axisName);
    const res = cutPass(cur.V, cur.I, axis, planePos);
    // 两侧都立即封盖：背侧定稿为拼片；前侧封成闭合壳再进入下一刀——
    // 下一刀会把旧封盖干净地剖分，剖分直边自动并入新边界闭曲线。
    // 若不封前侧，开放边界会跨平面蔓延出角点，补面行走必然断链（真实教训）。
    pieces.push(makePiece(capSide(res.back, axis, planePos, `${modelKey}#${pieces.length}`)));
    cur = capSide(res.front, axis, planePos, `${modelKey}f${pieces.length}`);
  }
  pieces.push(makePiece(cur)); // 最后一刀的前侧已封盖
  return { key: modelKey, name: model.name, emoji: model.emoji, totalTris: tris.length / 3, pieces };
}

// 把模型切成 n 块（2/3/4/6）→ { key, name, emoji, totalTris, pieces: [...] }
// palette 参与缓存键：同模型同块数不同配色是不同拼片（颜色不同、几何相同）。
export function splitIntoPieces(modelKey, n, palette = 'classic') {
  const ck = modelKey + '|' + n + '|' + palette;
  const hit = cache.get(ck);
  if (hit) return hit;
  const planes = CUT_TABLE[modelKey] && CUT_TABLE[modelKey][n];
  if (!planes) throw new Error(`不支持的块数 ${n}（模型 ${modelKey}，支持 2/3/4/6）`);

  const out = splitWithPlanes(modelKey, planes, palette);
  if (out.pieces.length !== n) throw new Error('拼片数量不符');
  out.palette = palette;
  cache.set(ck, out);
  return out;
}

// watertight 校验：按精确索引做有向边普查——每条有向边恰好出现一次，且
// 反向边恰好出现一次。顶点在切割与补面中已按位置/边去重（索引即几何身份）。
export function isWatertight(piece) {
  const count = new Map();
  const I = piece.indices;
  for (let t = 0; t < I.length / 3; t++) {
    const ids = [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
    for (let k = 0; k < 3; k++) {
      const key = ids[k] + '_' + ids[(k + 1) % 3];
      count.set(key, (count.get(key) || 0) + 1);
    }
  }
  for (const [key, c] of count) {
    if (c !== 1) return { ok: false, reason: `有向边出现 ${c} 次: ${key}` };
    const [a, b] = key.split('_');
    if (!count.has(b + '_' + a)) return { ok: false, reason: `有向边无反向配对: ${key}` };
  }
  return { ok: true };
}

// ---------------- 随机模式：运行时生成随机切割平面 ----------------
// 以标定表为基准，保持每个轴的刀数，把刀位在基准位置附近抖动；
// 每个候选都用 splitWithPlanes 实际切一次做水密/片数校验，失败重试，最终回退标定表。
export function generateRandomPlanes(modelKey, n, rng = Math.random) {
  const base = CUT_TABLE[modelKey] && CUT_TABLE[modelKey][n];
  if (!base) return null;
  const axes = ['x', 'y', 'z'];
  const baseByAxis = { x: [], y: [], z: [] };
  for (const [axis, pos] of base) baseByAxis[axis].push(pos);
  for (const axis of axes) baseByAxis[axis].sort((a, b) => a - b);

  for (let attempt = 0; attempt < 6; attempt++) {
    const planes = [];
    for (const axis of axes) {
      const arr = baseByAxis[axis];
      if (!arr.length) continue;
      const span = Math.max(0.5, arr[arr.length - 1] - arr[0]);
      const step = span / (arr.length + 1);
      const out = [];
      for (let i = 0; i < arr.length; i++) {
        const anchor = arr[0] + step * (i + 1);
        const jitter = (rng() - 0.5) * step * 0.30;
        out.push(anchor + jitter);
      }
      out.sort((a, b) => a - b);
      for (const p of out) planes.push([axis, +p.toFixed(5)]);
    }
    try {
      const res = splitWithPlanes(modelKey, planes);
      if (res.pieces.length === n && res.pieces.every((p) => isWatertight(p).ok)) return planes;
    } catch (e) { /* 该候选不可用，重试 */ }
  }
  return base.map(([axis, pos]) => [axis, pos]);
}