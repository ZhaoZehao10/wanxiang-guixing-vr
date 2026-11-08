// 生成 万象归形 的 APK 启动图标（拼图块：青绿 + 金色两块互扣）
// 零依赖：手写 PNG 编码（zlib deflate），仅构建 APK 时运行。
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function px(u, v) {
  // 圆角方底（同随机游走 VR 的版式，保持合集视觉一致）
  const r = 0.18, m = 0.02;
  const inBox = u > m && u < 1 - m && v > m && v < 1 - m;
  const cx = Math.min(Math.max(u, m + r), 1 - m - r);
  const cy = Math.min(Math.max(v, m + r), 1 - m - r);
  const corner = (u - cx) ** 2 + (v - cy) ** 2 > r * r;
  if (!inBox || corner) return null;

  const t = (u + v) / 2;
  let R = Math.round(13 + t * 28), G = Math.round(16 + t * 12), B = Math.round(32 + t * 64);

  const inRect = (x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
  const inCircle = (x0, y0, rr) => (u - x0) ** 2 + (v - y0) ** 2 <= rr * rr;

  // 金色块（右下）：方块 + 左中凹口
  if (inRect(0.46, 0.46, 0.84, 0.84) && !inCircle(0.46, 0.65, 0.095)) {
    if (inCircle(0.84, 0.65, 0.075)) return [255, 240, 190, 255]; // 右凸头高光
    return [255, 205, 74, 255];
  }
  // 青绿块（左上）：方块 + 底中凸头 + 右中凹口（与金色块互扣）
  if ((inRect(0.16, 0.16, 0.54, 0.54) || inCircle(0.35, 0.54, 0.095)) && !inCircle(0.54, 0.35, 0.095)) {
    if (inCircle(0.35, 0.54, 0.05)) return [190, 255, 245, 255]; // 凸头高光
    return [64, 208, 200, 255];
  }
  // 细网格线（浅）
  if (Math.abs(u - 0.5) < 0.006 || Math.abs(v - 0.5) < 0.006) return [90, 116, 180, 255];
  return [R, G, B, 255];
}

function crcTable() {
  const tb = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tb[n] = c >>> 0;
  }
  return tb;
}
const CRC = crcTable();
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const b of body) crc = CRC[(crc ^ b) & 0xff] ^ (crc >>> 8);
  crc = (crc ^ 0xffffffff) >>> 0;
  const cb = Buffer.alloc(4); cb.writeUInt32BE(crc);
  return Buffer.concat([len, body, cb]);
}
function makePng(s) {
  const raw = Buffer.alloc(s * (s * 4 + 1));
  for (let y = 0; y < s; y++) {
    raw[y * (s * 4 + 1)] = 0;
    for (let x = 0; x < s; x++) {
      const c = px((x + 0.5) / s, (y + 0.5) / s) || [0, 0, 0, 0];
      const o = y * (s * 4 + 1) + 1 + x * 4;
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = c[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(s, 0); ihdr.writeUInt32BE(s, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ROOT = path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '..', '..');
const resDir = path.join(ROOT, 'apk-puzzle', 'res');
for (const [dpi, s] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  const d = path.join(resDir, `mipmap-${dpi}`);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'ic_launcher.png'), makePng(s));
}
console.log('拼图图标已生成 apk-puzzle/res/mipmap-*');
