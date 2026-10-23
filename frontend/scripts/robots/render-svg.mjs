// Renders assets/brand/zrodla/robot-tab-*.svg with Chrome at SIZE px (transparent background) into OUTDIR/hi-*.png.
// Usage (from frontend/): node scripts/robots/render-svg.mjs <OUTDIR> 1195 [names...]   (needs playwright-core and Chrome)
// names default to the five tab robots; "glowa" renders robot-glowa.svg (head only, used by build-watermark.py).
import { chromium } from 'playwright-core'; import fs from 'fs';
const [OUT, SIZE] = [process.argv[2], +process.argv[3]]; const SRC = 'assets/brand/zrodla';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
const NAMES = process.argv.length > 4 ? process.argv.slice(4) : ['sprawy', 'pisma', 'elon', 'forum', 'profil'];
for (const n of NAMES) {
  const file = n === 'glowa' ? 'robot-glowa.svg' : `robot-tab-${n}.svg`;
  const svg = fs.readFileSync(`${SRC}/${file}`, 'utf8').replace(/width="120" height="120"/, `width="${SIZE}" height="${SIZE}"`);
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/hi-${n}.png`, omitBackground: true, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
}
await b.close(); console.log('rendered', SIZE);
