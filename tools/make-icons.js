/* 生成 App 图标。手写 PNG 编码，不引入任何依赖 ——
   整个项目坚持零 npm 包，图标也不破例。
   用法：node tools/make-icons.js */
const zlib = require('node:zlib');
const fs = require('node:fs');
const path = require('node:path');

function crc32(buf) {
  let c, crc = 0xFFFFFFFF;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xFF;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;                       // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;  // 8bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 画一个圆角方块 + 顶部标题条 + 2x3 的课表格子
function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const r = size * 0.22;            // 圆角半径
  const bg = [0x4A, 0x7C, 0xE8];    // 主色
  const fg = [0xFF, 0xFF, 0xFF];
  const put = (x, y, rgb) => {
    const i = (y * size + x) * 4;
    px[i] = rgb[0]; px[i + 1] = rgb[1]; px[i + 2] = rgb[2]; px[i + 3] = 255;
  };
  // 底：圆角方块（带 2x2 超采样抗锯齿）
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let hit = 0;
    for (const dy of [0.25, 0.75]) for (const dx of [0.25, 0.75]) {
      const fx = x + dx, fy = y + dy;
      const cx = Math.min(Math.max(fx, r), size - r);
      const cy = Math.min(Math.max(fy, r), size - r);
      if ((fx - cx) ** 2 + (fy - cy) ** 2 <= r * r) hit++;
    }
    if (hit) {
      const i = (y * size + x) * 4;
      const a = hit / 4;
      // PNG 用的是非预乘 alpha：颜色分量保持原值，只有 alpha 随抗锯齿变化
      px[i] = bg[0];
      px[i + 1] = bg[1];
      px[i + 2] = bg[2];
      px[i + 3] = Math.round(255 * a);
    }
  }
  // 前：横线标题条 + 2x3 的格子
  const m = Math.round(size * 0.24);        // 边距
  const barH = Math.round(size * 0.09);
  for (let y = m; y < m + barH; y++)       // 顶部标题条（整条横贯）
    for (let x = m; x < size - m; x++) put(x, y, fg);
  const gap = Math.round(size * 0.06);
  const gx0 = m, gy0 = m + barH + Math.round(size * 0.08);
  const cw = Math.round((size - 2 * m - 2 * gap) / 3);
  const ch = Math.round(cw * 0.9);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
    const x0 = gx0 + col * (cw + gap), y0 = gy0 + row * (ch + gap);
    for (let y = y0; y < y0 + ch && y < size - m; y++)
      for (let x = x0; x < x0 + cw && x < size - m; x++) put(x, y, fg);
  }
  return px;
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
for (const size of [192, 512]) {
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), png(size, size, draw(size)));
  console.log(`已生成 icons/icon-${size}.png`);
}
