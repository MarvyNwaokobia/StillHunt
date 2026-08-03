import { chromium } from 'playwright';
import { mkdirSync, statSync, renameSync } from 'fs';
import sharp from 'sharp';

const OUT = '/Users/marvy/Documents/HACK/StillHunt/apps/web/public/items';
mkdirSync(OUT, { recursive: true });

const ASSETS = [
  'gun_sidearm', 'gun_smg', 'gun_assault_rifle', 'gun_marksman', 'gun_legendary',
  'shield', 'ammo_standard', 'ammo_incendiary', 'optic', 'barrel', 'grip', 'magazine', 'booster',
];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 720, height: 720 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message));

// Dev-mode HMR occasionally throws a transient "Invalid or unexpected token"
// chunk error that renders an EMPTY (transparent) frame — those come out ~500B.
// Retry any asset whose PNG lands suspiciously small until it's a real render.
const MIN_BYTES = 2000;
for (const asset of ASSETS) {
  let ok = false;
  for (let attempt = 1; attempt <= 4 && !ok; attempt++) {
    await page.goto(`http://localhost:3100/dev/bake-items?asset=${asset}`, { waitUntil: 'domcontentloaded' });
    const canvas = await page.waitForSelector('canvas', { timeout: 60000 });
    await page.waitForTimeout(2200); // let the HDRI env + lighting/first frames settle
    await canvas.screenshot({ path: `${OUT}/${asset}.png`, omitBackground: true });
    const bytes = statSync(`${OUT}/${asset}.png`).size;
    ok = bytes >= MIN_BYTES;
    console.log(ok ? 'baked' : `retry (${bytes}B)`, asset, ok ? '' : `attempt ${attempt}`);
  }
  if (!ok) console.log('WARN: could not get a full render for', asset);
}

await browser.close();

// Trim the transparent margin off each bake so the asset fills its crate frame
// (a thin gun centred in a square canvas otherwise reads tiny). Small pad back.
const PAD_FRAC = 0.04;
for (const asset of ASSETS) {
  const src = `${OUT}/${asset}.png`;
  try {
    const t = await sharp(src).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    const pad = Math.round(Math.max(t.info.width, t.info.height) * PAD_FRAC);
    const tmp = `${OUT}/.tmp_${asset}.png`;
    await sharp(t.data).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } }).toFile(tmp);
    renameSync(tmp, src);
  } catch (e) { console.log('trim skipped', asset, e.message); }
}
console.log('DONE');
