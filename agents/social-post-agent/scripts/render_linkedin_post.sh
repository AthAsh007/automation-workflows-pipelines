#!/usr/bin/env bash
# Render a self-contained LinkedIn post template to a 2160x2700 PNG.
#
# Usage: render_linkedin_post.sh <template.html> <output.png>
#
# Brand-agnostic: the template carries all styling and an inlined logo. Both
# man_lin_pos and mch_lin_pos call this same script.
#
# The 2x device scale factor is set here, not passed in — the 1080x1350 canvas is
# fixed by the visual spec and doubling it is what produces the required export size.
# Playwright is resolved through NODE_PATH; `Cannot find module 'playwright'` means
# NODE_PATH is unset or points somewhere without it.
set -euo pipefail

TEMPLATE="${1:?usage: render_linkedin_post.sh <template.html> <output.png>}"
OUTPUT="${2:?usage: render_linkedin_post.sh <template.html> <output.png>}"

case "$TEMPLATE" in /*) ;; *) echo "template must be an absolute path: $TEMPLATE" >&2; exit 1;; esac
case "$OUTPUT" in /*) ;; *) echo "output must be an absolute path: $OUTPUT" >&2; exit 1;; esac
[[ -f "$TEMPLATE" ]] || { echo "template not found: $TEMPLATE" >&2; exit 1; }

export NODE_PATH="${NODE_PATH:-/usr/local/lib/hermes-agent/node_modules}"
mkdir -p "$(dirname "$OUTPUT")"

TEMPLATE="$TEMPLATE" OUTPUT="$OUTPUT" node <<'NODE'
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1080, height: 1350 },
    deviceScaleFactor: 2,
  });

  // The template inlines its CSS, fonts and SVG, so there is nothing to wait on the
  // network for — but a webfont or data-URI image still needs a beat to lay out.
  await page.goto('file://' + process.env.TEMPLATE, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(250);

  await page.screenshot({
    path: process.env.OUTPUT,
    clip: { x: 0, y: 0, width: 1080, height: 1350 },
  });

  await browser.close();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
NODE

[[ -s "$OUTPUT" ]] || { echo "render produced no output: $OUTPUT" >&2; exit 1; }
echo "rendered: $OUTPUT"
