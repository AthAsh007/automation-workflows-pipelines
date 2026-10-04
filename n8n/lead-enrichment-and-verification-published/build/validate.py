# Structural check on the workflow. Run: python validate.py
import io, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FILE = '01-enrich-and-verify.json'
JOB_URL = 'https://example.com/jobs/~022093767913249678699/'
fails = []


def check(ok, msg):
    print(('  ok   ' if ok else '  FAIL ') + msg)
    if not ok:
        fails.append(msg)


path = os.path.join(HERE, '..', FILE)
wf = json.load(io.open(path, encoding='utf-8'))
raw = io.open(path, encoding='utf-8').read()
nodes = wf['nodes']
names = [n['name'] for n in nodes]
by_name = {n['name']: n for n in nodes}

print('== %s  (%d nodes)' % (FILE, len(names)))
check(len(names) == len(set(names)), 'node names are unique')
nameset = set(names)

for src, conn in wf['connections'].items():
    check(src in nameset, 'source exists: ' + src)
    for outputs in conn.get('main', []):
        for link in outputs or []:
            check(link['node'] in nameset, src + ' -> ' + link['node'])

targets = {}
for conn in wf['connections'].values():
    for outputs in conn.get('main', []):
        for link in outputs or []:
            targets.setdefault(link['node'], set()).add(link['index'])

TRIGGERS = ('n8n-nodes-base.stickyNote', 'n8n-nodes-base.manualTrigger',
            'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.webhook')
for n in nodes:
    if n['type'] in TRIGGERS:
        continue
    check(n['name'] in targets, 'reachable: ' + n['name'])

print('\n== branches and joins')
for n in nodes:
    if n['type'] == 'n8n-nodes-base.if':
        outs = wf['connections'].get(n['name'], {}).get('main', [])
        check(len(outs) == 2 and all(outs), 'both branches wired: ' + n['name'])
    if n['type'] == 'n8n-nodes-base.merge':
        got = targets.get(n['name'], set())
        check(got == {0, 1}, 'both inputs fed: ' + n['name'] + ' (has ' + str(sorted(got)) + ')')
        check(n['parameters'].get('numberInputs') == 2, 'declares 2 inputs: ' + n['name'])

# Every IF that splits per item must rejoin through a Merge before anything aggregates,
# or the per-run dedupe, cap and counts see half the batch.
PER_ITEM_IFS = ['AI classification needed?', 'Apollo configured?', 'verification possible?']
for name in PER_ITEM_IFS:
    outs = wf['connections'].get(name, {}).get('main', [])
    reached = set()
    frontier = [l['node'] for o in outs for l in (o or [])]
    seen = set()
    while frontier:
        cur = frontier.pop()
        if cur in seen:
            continue
        seen.add(cur)
        if by_name[cur]['type'] == 'n8n-nodes-base.merge':
            reached.add(cur)
            continue
        for o in wf['connections'].get(cur, {}).get('main', []):
            frontier += [l['node'] for l in (o or [])]
    check(len(reached) == 1, name + ' rejoins at exactly one merge ' + str(sorted(reached)))

print('\n== code nodes')
for n in nodes:
    if n['type'] != 'n8n-nodes-base.code':
        continue
    fd, tmp = tempfile.mkstemp(suffix='.js')
    os.close(fd)
    io.open(tmp, 'w', encoding='utf-8').write(n['parameters']['jsCode'])
    r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
    os.unlink(tmp)
    check(r.returncode == 0, 'jsCode parses: ' + n['name'] +
          ('' if r.returncode == 0 else '\n' + r.stderr))
    # These fold many items into one answer; executeOnce would silently drop the rest.
    if n['name'] in ('decide who is safe to email', 'rows for the organisations tab',
                     'rows for the contacts tab', 'build the run summary'):
        check(n.get('executeOnce') is not True, 'no executeOnce on: ' + n['name'])

print('\n== outward-facing calls')
for n in nodes:
    if n['type'] == 'n8n-nodes-base.httpRequest':
        check(n.get('onError') == 'continueRegularOutput',
              'degrades instead of failing the run: ' + n['name'])
        check('timeout' in json.dumps(n['parameters'].get('options', {})),
              'has a timeout: ' + n['name'])

read_node = by_name['[cred] Sheets - read the raw list']
check(read_node.get('alwaysOutputData') is True,
      'the read node always outputs data (an empty tab must not end the run silently)')

print('\n== the config node')
check(len([n for n in nodes if n['name'] == 'config']) == 1, 'exactly one config node')
cfg_node = by_name['config']
check(cfg_node['type'] == 'n8n-nodes-base.code', 'config is a Code node')
cfgjs = cfg_node['parameters']['jsCode']

check('$env' not in raw, 'no $env anywhere')
check(wf['settings'].get('executionOrder') == 'v1', 'executionOrder is v1')
check(not any('credentials' in n for n in nodes), 'no credential ids embedded')

check(re.search(r"const TEST_RUN\s*=\s*true", cfgjs) is not None, 'TEST_RUN ships true')
check(re.search(r"const HOLD_UNVERIFIED\s*=\s*true", cfgjs) is not None,
      'HOLD_UNVERIFIED ships true')
check(re.search(r"const DEMO_VERIFIER\s*=\s*false", cfgjs) is not None,
      'DEMO_VERIFIER ships false')
for name in ('SHEET_ID', 'TEST_CAMPAIGN_ID', 'APOLLO_API_KEY', 'VERIFIER_API_KEY',
             'AI_API_KEY', 'INSTANTLY_API_KEY', 'INSTANTLY_CAMPAIGN_ID', 'ALERT_WEBHOOK_URL'):
    m = re.search(r"const " + name + r"\s*=\s*'([^']*)'", cfgjs)
    check(bool(m) and m.group(1) == '', name + ' ships blank')

# Nothing that looks like a live secret, whatever it is called.
leaks = re.findall(r"const \w*(?:KEY|TOKEN|SECRET|PASSWORD)\w*\s*=\s*'([^']{8,})'", cfgjs)
check(not leaks, 'no key, token or password has a value')

print('\n== the sheet')
import csv
meta = json.loads(subprocess.run(
    ['node', '-e', 'const c=new Function(require("fs").readFileSync("js/config.js","utf8"))()[0].json;'
                   'process.stdout.write(JSON.stringify({orgs:c.org_columns,contacts:c.contact_columns}))'],
    cwd=HERE, capture_output=True, text=True, check=True).stdout)

for tab, key in (('Organisations.csv', 'orgs'), ('Contacts.csv', 'contacts')):
    with io.open(os.path.join(HERE, '..', 'sheet', tab), encoding='utf-8-sig') as f:
        header = next(csv.reader(f))
    wanted = list(meta[key].values())
    check(len(header) == len(set(header)), tab + ': headings are unique')
    missing = [v for v in wanted if v not in header]
    extra = [h for h in header if h not in wanted]
    check(not missing, tab + ': every column the workflow writes exists' +
          ('' if not missing else ': missing ' + str(missing)))
    check(not extra, tab + ': no heading the workflow does not know' +
          ('' if not extra else ': extra ' + str(extra)))

# A rename in config that is not mirrored in the Sheets node's match field means the write
# appends duplicates forever instead of updating.
for n in nodes:
    if n['type'] == 'n8n-nodes-base.googleSheets':
        for mc in n['parameters'].get('columns', {}).get('matchingColumns', []):
            known = list(meta['orgs'].values()) + list(meta['contacts'].values())
            check(mc in known, n['name'] + ": matches on a column config knows ('" + mc + "')")

print('\n== the brief is on the canvas')
check(JOB_URL in raw, 'the job post link is in a sticky note')
stickies = [n for n in nodes if n['type'] == 'n8n-nodes-base.stickyNote']
check(len(stickies) >= 3, 'the canvas documents itself (%d sticky notes)' % len(stickies))

print()
if fails:
    print(len(fails), 'FAILED')
    sys.exit(1)
print('all checks passed')
