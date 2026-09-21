# Structural check on both workflows. Run: python validate.py
import io, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = ['01-capture-and-confirm.json', '02-progress-and-ship.json']
fails = []

def check(ok, msg):
    print(('  ok   ' if ok else '  FAIL ') + msg)
    if not ok:
        fails.append(msg)

configs = {}
for fname in FILES:
    path = os.path.join(HERE, '..', fname)
    wf = json.load(io.open(path, encoding='utf-8'))
    raw = io.open(path, encoding='utf-8').read()
    names = [n['name'] for n in wf['nodes']]
    print('\n== %s  (%d nodes)' % (fname, len(names)))

    check(len(names) == len(set(names)), 'node names are unique')
    nameset = set(names)

    for src, conn in wf['connections'].items():
        check(src in nameset, 'source exists: ' + src)
        for outputs in conn.get('main', []):
            for link in outputs or []:
                check(link['node'] in nameset, src + ' -> ' + link['node'])

    targets = set()
    for conn in wf['connections'].values():
        for outputs in conn.get('main', []):
            for link in outputs or []:
                targets.add(link['node'])
    TRIGGERS = ('n8n-nodes-base.stickyNote', 'n8n-nodes-base.manualTrigger',
                'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.webhook',
                'n8n-nodes-base.respondToWebhook')
    for n in wf['nodes']:
        if n['type'] in TRIGGERS:
            continue
        check(n['name'] in targets, 'reachable: ' + n['name'])

    for n in wf['nodes']:
        if n['type'] == 'n8n-nodes-base.if':
            outs = wf['connections'].get(n['name'], {}).get('main', [])
            check(len(outs) == 2 and all(outs), 'both branches wired: ' + n['name'])
        if n['type'] == 'n8n-nodes-base.code':
            fd, tmp = tempfile.mkstemp(suffix='.js'); os.close(fd)
            io.open(tmp, 'w', encoding='utf-8').write(n['parameters']['jsCode'])
            r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
            os.unlink(tmp)
            check(r.returncode == 0, 'jsCode parses: ' + n['name'] +
                  ('' if r.returncode == 0 else '\n' + r.stderr))
        # executeOnce on a node that folds many items into one silently drops the rest
        if n['name'] in ('read the board', 'seen this order before?', 'use the demo board'):
            check(n.get('executeOnce') is not True, 'no executeOnce on: ' + n['name'])

    check('$env' not in raw, 'no $env anywhere')
    check(len([n for n in wf['nodes'] if n['name'] == 'config']) == 1, 'exactly one config node')
    check(wf['settings'].get('executionOrder') == 'v1', 'executionOrder is v1')
    check(not any('credentials' in n and n.get('credentials') for n in wf['nodes']),
          'no credential ids embedded')
    configs[fname] = [n for n in wf['nodes'] if n['name'] == 'config'][0]['parameters']['jsCode']

print('\n== the sheet')
import csv
meta = json.loads(subprocess.run(
    ['node', '-e', 'const c=new Function(require("fs").readFileSync("js/config.js","utf8"))()[0].json;'
                   'process.stdout.write(JSON.stringify({columns:c.columns,stages:c.stages}))'],
    cwd=HERE, capture_output=True, text=True).stdout)

with io.open(os.path.join(HERE, '..', 'sheet', 'Orders.csv'), encoding='utf-8-sig') as f:
    header = next(csv.reader(f))
check(len(header) == len(set(header)), 'sheet headings are unique')
missing = [v for v in meta['columns'].values() if v not in header]
extra = [h for h in header if h not in meta['columns'].values()]
check(not missing, 'every column the workflow writes exists in the sheet'
      + ('' if not missing else ': missing ' + str(missing)))
check(not extra, 'no heading in the sheet the workflow does not know'
      + ('' if not extra else ': extra ' + str(extra)))

print('\n== both workflows')
a, b = [configs[f] for f in FILES]
check(a == b, 'the two config nodes are identical')

cfgjs = a
check(re.search(r"const TEST_RUN\s*=\s*true", cfgjs) is not None, 'TEST_RUN ships true')
m = re.search(r"const TEST_EMAIL\s*=\s*'([^']*)'", cfgjs)
check(bool(m) and m.group(1) == '', 'TEST_EMAIL ships blank (so it ships in preview)')
for name in ('BOARD_SHEET_ID', 'REPLY_TO'):
    m = re.search(r"const " + name + r"\s*=\s*'([^']*)'", cfgjs)
    check(bool(m) and m.group(1) == '', name + ' ships blank')
for name in ('BOARD_READY', 'SHIPSTATION_READY'):
    m = re.search(r"const " + name + r"\s*=\s*false", cfgjs)
    check(bool(m), name + ' ships false (demo mode)')
m = re.search(r"const DEMO_MODE = BOARD_READY !== true", cfgjs)
check(bool(m), 'demo mode derives from BOARD_READY')

print()
if fails:
    print(len(fails), 'FAILED')
    sys.exit(1)
print('all checks passed')
