// De-identify the -publish.json copies after tools/layout.py (GUIDELINES §10.6).
// layout.py has no text-replacement step, so the one provenance phrase in the working
// files is rewritten here, in the publish copies only. Run from this folder, after layout.py:
//   bun build/deidentify_publish.js
// The strings are matched against the raw JSON text, where a newline inside jsCode is the
// two characters backslash + n.
const fs = require('fs');
const EDITS = [
  [String.raw`before the client has created\n// an API client at all`,
   String.raw`before anyone has created\n// an API client at all`],
];
for (const f of ['01-lead-routing-publish.json', '02-stage-sweep-publish.json']) {
  let s = fs.readFileSync(f, 'utf8'), n = 0;
  for (const [a, b] of EDITS) while (s.includes(a)) { s = s.replace(a, b); n++; }
  fs.writeFileSync(f, s);
  console.log(`${f}: ${n} edit(s)`);
}
