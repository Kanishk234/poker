// Original placeholder mark, rendered without an image dependency.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(content));
  return Buffer.concat([length, content, crc]);
}
const outline = [
  [0.5, 0.23],
  [0.34, 0.4],
  [0.27, 0.5],
  [0.27, 0.57],
  [0.32, 0.63],
  [0.4, 0.64],
  [0.47, 0.59],
  [0.43, 0.77],
  [0.57, 0.77],
  [0.53, 0.59],
  [0.6, 0.64],
  [0.68, 0.63],
  [0.73, 0.57],
  [0.73, 0.5],
  [0.66, 0.4],
];
function inside(x, y) {
  let result = false;
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const [xi, yi] = outline[i];
    const [xj, yj] = outline[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      result = !result;
  }
  return result;
}
for (const size of [180, 192, 512]) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = y * (size * 3 + 1) + 1 + x * 3;
      raw.set(
        inside(x / size, y / size) ? [245, 196, 81] : [23, 51, 42],
        offset,
      );
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(
    new URL(
      `../apps/web/public/${size === 180 ? 'apple-touch-icon-180' : `icon-${size}`}.png`,
      import.meta.url,
    ),
    png,
  );
}
