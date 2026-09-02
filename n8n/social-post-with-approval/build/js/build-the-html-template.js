// Build the 1080x1350 HTML the renderer screenshots.
//
// This is the port of `render/build.js` from the drafts repo. The six layouts, the type
// scale and the three-zone accent rule are DESIGN.md's, reproduced here so the workflow
// renders the same picture the drafts repo does — the two are checked against each other by
// build/simulate.js, which renders a bank row through both and diffs the HTML.
//
// Fully self-contained on purpose: inline CSS, inline SVG logo, no external fetch of any
// kind. The renderer loads this with no network, so a linked font or a hosted logo is a
// blank space in a published image.
//
// Where the accent may appear, and nowhere else:
//   1. the logo mark
//   2. one phrase inside the headline, wrapped in <em>
//   3. the single focal element — last timeline node, last card, the band, the right split
//      column, the stat figure, or the last bar
// A fourth zone reads as decoration. `validate the layout` checks the count.

const cfg = $('config').first().json;
const p = $json;
const C = cfg.brand;

// Bank text is authored by us and deliberately carries markup — <br> for line breaks and
// <em> for the accent phrase. Everything else is escaped, so a stray < in a headline cannot
// break the document.
function text(v) {
  return String(v === undefined || v === null ? '' : v)
    .replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;')
    .replace(/<(?!\/?(br|em)\b)/gi, '&lt;');
}

// ---------------------------------------------------------------- the six layouts
function timeline(rows) {
  return '    <div class="timeline">' + rows.map(([title, desc], i) => {
    const last = i === rows.length - 1;
    return `
      <div class="titem${last ? ' last' : ''}">
        <div class="tcol">
          <div class="circle${last ? ' focal' : ''}">0${i + 1}</div>
          ${last ? '' : '<div class="tline"></div>'}
        </div>
        <div class="tbody">
          <div class="ttitle${last ? ' focal' : ''}">${text(title)}</div>
          <div class="tdesc">${text(desc)}</div>
        </div>
      </div>`;
  }).join('') + '\n    </div>';
}

function cards(rows) {
  return '    <div class="cards">' + rows.map(([eyebrow, title, desc], i) => {
    const last = i === rows.length - 1;
    return `
      <div class="card${last ? ' focal' : ''}">
        <div class="ceyebrow">${text(eyebrow)}</div>
        <div class="ctitle${last ? ' focal' : ''}">${text(title)}</div>
        <div class="cspacer"></div>
        <div class="cdesc">${text(desc)}</div>
      </div>`;
  }).join('') + '\n    </div>';
}

function grid(rows, band) {
  return '    <div class="grid">' + rows.map(([title, desc]) => `
      <div class="gcell">
        <div class="gx">&times;</div>
        <div class="gtitle">${text(title)}</div>
        <div class="gdesc">${text(desc)}</div>
      </div>`).join('') + `
    </div>
    <div class="band">${text(band)}</div>`;
}

function split(rows) {
  return '    <div class="split">' + rows.map(([head, cells], i) => {
    const focal = i === rows.length - 1;
    return `
      <div class="scol${focal ? ' focal' : ''}">
        <div class="shead">${text(head)}</div>
        <div class="srows">${(cells || []).map((r) => `
        <div class="srow">${text(r)}</div>`).join('')}
        </div>
      </div>`;
  }).join('') + '\n    </div>';
}

function stat(post) {
  return `    <div class="statwrap">
      <div class="statbig">${text(post.stat_big)}</div>
      <div class="statsub">${text(post.stat_sub)}</div>
    </div>
    <div class="statcols">` + (post.items || []).map(([label, desc]) => `
      <div class="scell">
        <div class="slabel">${text(label)}</div>
        <div class="sdesc">${text(desc)}</div>
      </div>`).join('') + '\n    </div>';
}

function stack(rows) {
  return '    <div class="stack">' + rows.map(([label, desc], i) => {
    const last = i === rows.length - 1;
    return `
      <div class="bar${last ? ' focal' : ''}">
        <div class="blabel">${text(label)}</div>
        <div class="bdesc">${text(desc)}</div>
      </div>`;
  }).join('') + '\n    </div>';
}

function body(post) {
  if (post.layout === 'cards') return cards(post.items);
  if (post.layout === 'grid') return grid(post.items, post.band);
  if (post.layout === 'split') return split(post.items);
  if (post.layout === 'stat') return stat(post);
  if (post.layout === 'stack') return stack(post.items);
  return timeline(post.items);
}

// ---------------------------------------------------------------- the logo
// Blank LOGO_SVG renders a plain wordmark rather than nothing. A missing logo has to LOOK
// missing — an empty box passes a glance and reaches the page.
const logo = cfg.logo_present
  ? cfg.logo_svg.trim()
  : '<div class="logofallback">ACME<span>&nbsp;/ logo not configured</span></div>';

// ---------------------------------------------------------------- the stylesheet
const css = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${cfg.canvas_width}px; height: ${cfg.canvas_height}px; }
  body {
    background: ${C.bg};
    font-family: ${C.font};
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
  }
  .strip { position: absolute; left: 0; right: 0; bottom: 0; height: 13px; background: ${C.accent}; }
  .content {
    position: absolute; inset: 74px 74px 88px 74px;
    display: flex; flex-direction: column;
  }
  .head { display: flex; align-items: center; justify-content: space-between; }
  .logo svg { width: 306px; height: auto; display: block; }
  .cat { color: ${C.muted}; font-size: 19px; letter-spacing: 0.3em; font-weight: bold; }

  .headline {
    margin-top: 74px;
    font-size: ${Number(p.headline_size) || 94}px; line-height: 1.06; font-weight: bold;
    color: ${C.white}; letter-spacing: -0.015em;
  }
  .headline em { color: ${C.accent}; font-style: normal; }
  .subhead { margin-top: 30px; font-size: 30px; line-height: 1.4; color: ${C.muted}; max-width: 830px; }

  .timeline { display: flex; flex-direction: column; flex: 1; margin-top: 56px; }
  .titem { display: flex; gap: 30px; flex: 1; }
  .titem.last { flex: none; }
  .tcol { width: 58px; flex: none; display: flex; flex-direction: column; align-items: center; }
  .circle {
    width: 58px; height: 58px; border-radius: 50%; flex: none;
    border: 1px solid ${C.line}; color: ${C.white};
    font-size: 21px; font-weight: bold;
    display: flex; align-items: center; justify-content: center;
  }
  .circle.focal { background: ${C.accent}; border-color: ${C.accent}; }
  .tline { width: 1px; flex: 1; background: ${C.line}; }
  .tbody { padding-top: 4px; padding-bottom: 32px; }
  .ttitle { font-size: 35px; font-weight: bold; color: ${C.white}; }
  .ttitle.focal { color: ${C.accent}; }
  .tdesc { margin-top: 11px; font-size: 25px; color: ${C.muted}; }

  .cards { display: flex; gap: 26px; flex: 1; margin-top: 58px; }
  .card {
    flex: 1; display: flex; flex-direction: column;
    border: 1px solid ${C.card_border}; border-radius: 14px;
    background: ${C.card_bg}; padding: 34px 30px;
  }
  .card.focal { border-color: ${C.accent}; background: rgba(220, 32, 86, 0.07); }
  .ceyebrow { font-size: 17px; letter-spacing: 0.11em; font-weight: bold; color: ${C.muted}; }
  .ctitle { margin-top: 22px; font-size: 41px; line-height: 1.12; font-weight: bold; color: ${C.white}; }
  .ctitle.focal { color: ${C.accent}; }
  .cspacer { flex: 1; min-height: 40px; }
  .cdesc { font-size: 23px; line-height: 1.42; color: ${C.muted}; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; flex: 1; margin-top: 48px; }
  .gcell {
    border: 1px solid ${C.card_border}; border-radius: 14px; background: ${C.card_bg};
    padding: 30px 28px; display: flex; flex-direction: column;
  }
  .gx { font-size: 42px; line-height: 0.9; font-weight: bold; color: ${C.muted}; }
  .gtitle { margin-top: 18px; font-size: 32px; font-weight: bold; color: ${C.white}; }
  .gdesc { margin-top: 10px; font-size: 23px; line-height: 1.4; color: ${C.muted}; }
  .band {
    margin-top: 24px; background: ${C.accent}; border-radius: 14px;
    padding: 28px 30px; text-align: center;
    color: ${C.white}; font-size: 29px; font-weight: bold; letter-spacing: 0.01em;
  }

  .split { display: flex; gap: 26px; flex: 1; margin-top: 48px; }
  .scol {
    flex: 1; display: flex; flex-direction: column;
    border: 1px solid ${C.card_border}; border-radius: 14px;
    background: ${C.card_bg}; padding: 30px 28px;
  }
  .scol.focal { border-color: ${C.accent}; background: rgba(220, 32, 86, 0.07); }
  .shead { font-size: 19px; letter-spacing: 0.2em; font-weight: bold; color: ${C.muted}; }
  .scol.focal .shead { color: ${C.accent}; }
  .srows { display: flex; flex-direction: column; flex: 1; margin-top: 14px; }
  .srow {
    flex: 1; display: flex; align-items: center;
    font-size: 25px; line-height: 1.3; color: ${C.muted};
    border-bottom: 1px solid ${C.card_border};
  }
  .srow:last-child { border-bottom: none; }
  .scol.focal .srow { color: ${C.white}; }

  .statwrap {
    flex: 1; display: flex; flex-direction: column;
    align-items: center; justify-content: center; text-align: center;
  }
  .statbig { font-size: 260px; line-height: 0.86; font-weight: bold; color: ${C.accent}; letter-spacing: -0.04em; }
  .statsub { margin-top: 26px; font-size: 30px; line-height: 1.35; color: ${C.muted}; max-width: 640px; }
  .statcols { display: flex; gap: 26px; margin-top: 10px; }
  .scell {
    flex: 1; border: 1px solid ${C.card_border}; border-radius: 14px;
    background: ${C.card_bg}; padding: 26px 24px;
  }
  .scell.focal { border-color: ${C.accent}; background: rgba(220, 32, 86, 0.07); }
  .slabel { font-size: 19px; letter-spacing: 0.16em; font-weight: bold; color: ${C.white}; }
  .scell.focal .slabel { color: ${C.accent}; }
  .sdesc { margin-top: 12px; font-size: 22px; line-height: 1.4; color: ${C.muted}; }

  .stack { display: flex; flex-direction: column; gap: 16px; flex: 1; margin-top: 50px; }
  .bar {
    flex: 1; display: flex; align-items: center; gap: 30px;
    border: 1px solid ${C.card_border}; border-radius: 14px;
    background: ${C.card_bg}; padding: 0 30px;
  }
  .bar.focal { border-color: ${C.accent}; background: rgba(220, 32, 86, 0.07); }
  .blabel {
    width: 210px; flex: none;
    font-size: 20px; letter-spacing: 0.16em; font-weight: bold; color: ${C.muted};
  }
  .bar.focal .blabel { color: ${C.accent}; }
  .bdesc { font-size: 27px; line-height: 1.3; color: ${C.white}; }

  .foot {
    margin-top: 40px; padding-top: 28px; border-top: 1px solid ${C.line};
    display: flex; justify-content: space-between; align-items: baseline;
    font-size: 25px; font-weight: bold;
  }
  .foot .take { color: ${C.white}; }
  .foot .site { color: ${C.white}; }
`;

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${text(p.slug)}</title>
<style>${css}</style></head>
<body>
  <div class="content">
    <div class="head">
      <div class="logo">${logo}</div>
      <div class="cat">${text(p.category)}</div>
    </div>
    <div class="headline">${text(p.headline)}</div>
    <div class="subhead">${text(p.subhead)}</div>
${body(p)}
    <div class="foot"><span class="take">${text(p.footer)}</span><span class="site">${C.site}</span></div>
  </div>
  <div class="strip"></div>
</body></html>
`;

return [{
  json: Object.assign({}, p, {
    _html: html,
    _html_bytes: html.length,
    _reason: 'built the ' + p.layout + ' template, ' + html.length + ' bytes'
  })
}];
