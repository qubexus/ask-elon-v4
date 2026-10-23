// Renders assets/brand/zrodla/robot-tab-*.svg with Chrome at SIZE px (transparent background) into OUTDIR/hi-*.png.
// Usage (from frontend/): node scripts/robots/render-svg.mjs <OUTDIR> 1195   (needs playwright-core and Chrome)
import { chromium } from 'playwright-core'; import fs from 'fs';
const [OUT, SIZE] = [process.argv[2], +process.argv[3]]; const SRC = 'assets/brand/zrodla';
fs.mkdirSync(OUT, { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
for (const n of ['sprawy', 'pisma', 'elon', 'forum', 'profil']) {
  const svg = fs.readFileSync(`${SRC}/robot-tab-${n}.svg`, 'utf8').replace(/width="120" height="120"/, `width="${SIZE}" height="${SIZE}"`);
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: `${OUT}/hi-${n}.png`, omitBackground: true, clip: { x: 0, y: 0, width: SIZE, height: SIZE } });
}
await b.close(); console.log('rendered', SIZE);
