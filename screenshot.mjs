import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const url   = process.argv[2] || 'http://localhost:8080';
const label = process.argv[3] || '';

const dir = './temporary screenshots';
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

// Auto-increment: never overwrite existing files
const existing = fs.readdirSync(dir).filter(f => f.endsWith('.png'));
const nums = existing.map(f => parseInt(f.match(/\d+/)?.[0] ?? '0')).filter(n => !isNaN(n));
const next = nums.length ? Math.max(...nums) + 1 : 1;

const filename = label
  ? `screenshot-${next}-${label}.png`
  : `screenshot-${next}.png`;
const outPath = path.join(dir, filename);

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

// Alle reveal-Elemente sofort sichtbar machen (für fullPage-Screenshot)
await page.evaluate(() => {
  document.querySelectorAll('.reveal').forEach(el => {
    el.classList.add('visible');
  });
});

// Kurz scrollen damit lazy-iframes etc. laden
await page.evaluate(async () => {
  await new Promise(resolve => {
    let pos = 0;
    const step = 600;
    const id = setInterval(() => {
      window.scrollTo(0, pos);
      pos += step;
      if (pos > document.body.scrollHeight + 600) {
        clearInterval(id);
        window.scrollTo(0, 0);
        resolve();
      }
    }, 80);
  });
});

// Warten bis alles gerendert ist (inkl. externe Bilder von Google CDN)
await new Promise(r => setTimeout(r, 3500));

await page.screenshot({ path: outPath, fullPage: true });
await browser.close();

console.log(`Saved: ${outPath}`);
