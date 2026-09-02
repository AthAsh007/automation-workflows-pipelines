#!/usr/bin/env node
// Check that a LinkedIn post template lays out inside the 1080x1350 canvas.
//
//   NODE_PATH=<node_modules> node validate_linkedin_layout.js <template.html>
//
// Exit 0 and "OK" means the template is safe to render. A non-zero exit is blocking:
// fix the template, then re-run the renderer and this validator in that order, because
// the PNG on disk is stale until the render is repeated.
//
// Brand-agnostic — it measures geometry, not colours. Brand rules (one pink focal
// element, correct logo variant) are checked by the vision pass on the rendered PNG.

const { chromium } = require('playwright');

const CANVAS = { width: 1080, height: 1350 };
const MIN_BODY_PX = 20; // below this, copy is unreadable at LinkedIn's feed thumbnail size

async function main() {
  const template = process.argv[2];
  if (!template) {
    console.error('usage: validate_linkedin_layout.js <template.html>');
    process.exit(2);
  }
  if (!template.startsWith('/')) {
    console.error(`template must be an absolute path: ${template}`);
    process.exit(2);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: CANVAS, deviceScaleFactor: 2 });
  await page.goto('file://' + template, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);

  const issues = await page.evaluate(({ CANVAS, MIN_BODY_PX }) => {
    const found = [];
    const describe = (el) => {
      const id = el.id ? `#${el.id}` : '';
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).join('.')
        : '';
      return `${el.tagName.toLowerCase()}${id}${cls}`;
    };

    // Scroll extent catches content pushed past the fold even when no single
    // element reports an out-of-bounds rect.
    const doc = document.documentElement;
    if (doc.scrollWidth > CANVAS.width + 1) {
      found.push(`page overflows horizontally: ${doc.scrollWidth}px > ${CANVAS.width}px`);
    }
    if (doc.scrollHeight > CANVAS.height + 1) {
      found.push(`page overflows vertically: ${doc.scrollHeight}px > ${CANVAS.height}px`);
    }

    for (const el of document.body.querySelectorAll('*')) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;

      if (r.left < -1 || r.top < -1 || r.right > CANVAS.width + 1 || r.bottom > CANVAS.height + 1) {
        found.push(
          `${describe(el)} outside canvas: ` +
          `(${Math.round(r.left)}, ${Math.round(r.top)}) to (${Math.round(r.right)}, ${Math.round(r.bottom)})`
        );
      }

      // Clipped text reads as a design choice in the HTML and as a bug in the PNG.
      if (el.scrollWidth > el.clientWidth + 1 && style.overflowX === 'hidden') {
        found.push(`${describe(el)} clips its text horizontally (${el.scrollWidth}px in ${el.clientWidth}px)`);
      }

      const text = (el.textContent || '').trim();
      const hasOwnText = Array.from(el.childNodes)
        .some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim());
      if (hasOwnText && text) {
        const size = parseFloat(style.fontSize);
        if (size && size < MIN_BODY_PX) {
          found.push(`${describe(el)} font-size ${size}px is below the ${MIN_BODY_PX}px readable floor`);
        }
      }
    }

    // A template that fetches anything fails at render time: the renderer loads it
    // from file:// with no network.
    for (const el of document.querySelectorAll('img[src], link[href], script[src]')) {
      const url = el.getAttribute('src') || el.getAttribute('href') || '';
      if (/^https?:\/\//i.test(url)) {
        found.push(`external reference will not load under file://: ${url}`);
      }
    }

    return found;
  }, { CANVAS, MIN_BODY_PX });

  await browser.close();

  if (issues.length) {
    console.error(`FAIL: ${issues.length} issue(s) in ${template}`);
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log(`OK: layout fits ${CANVAS.width}x${CANVAS.height}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(2);
});
