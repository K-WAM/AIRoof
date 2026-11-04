// Run from the repository root: node docs/sales/render.cjs
const { chromium } = require('playwright');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
    await page.goto(pathToFileURL(path.join(__dirname, 'luxor-crm-overview.html')).href);
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready);
    const layout = await page.evaluate(() => Array.from(document.querySelectorAll('.page')).map(sheet => {
      const bounds = sheet.getBoundingClientRect();
      const footer = sheet.querySelector('.footer').getBoundingClientRect();
      const content = Array.from(sheet.children).filter(el => !el.classList.contains('footer'));
      return {
        page: sheet.getAttribute('aria-label'),
        bottomGap: Math.round(footer.top - Math.max(...content.map(el => el.getBoundingClientRect().bottom))),
        overflow: Array.from(sheet.querySelectorAll('*')).some(el => {
          const r = el.getBoundingClientRect();
          return r.right > bounds.right + 1 || r.left < bounds.left - 1 || r.bottom > bounds.bottom + 1;
        }),
      };
    }));
    if (layout.some(p => p.overflow || p.bottomGap < 12)) throw new Error(JSON.stringify(layout));
    await page.pdf({ path: path.join(__dirname, 'luxor-crm-overview.pdf'), format: 'Letter', preferCSSPageSize: true, printBackground: true, displayHeaderFooter: false });
    console.log(JSON.stringify(layout, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
