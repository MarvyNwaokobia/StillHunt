import sharp from 'sharp';
import { readdirSync, renameSync } from 'fs';

// Trims the transparent margin off each baked catalogue PNG so the asset fills
// its crate frame (the square bakes leave a thin gun tiny inside lots of air).
// A small uniform pad is added back so nothing sits edge-to-edge.
const DIR = '/Users/marvy/Documents/HACK/StillHunt/apps/web/public/items';
const PAD_FRAC = 0.04;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.png'))) {
  const src = `${DIR}/${file}`;
  const trimmed = await sharp(src).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
  const { width, height } = trimmed.info;
  const pad = Math.round(Math.max(width, height) * PAD_FRAC);
  const tmp = `${DIR}/.tmp_${file}`;
  await sharp(trimmed.data)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toFile(tmp);
  renameSync(tmp, src);
  console.log('trimmed', file, `${width}x${height} +${pad}pad`);
}
console.log('DONE');
