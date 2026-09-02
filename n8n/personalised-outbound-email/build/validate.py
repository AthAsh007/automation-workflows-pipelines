# Structural check on ../workflow.json. Run: python validate.py
import io, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
WF = os.path.join(HERE, '..', 'workflow.json')

wf = json.load(io.open(WF, encoding='utf-8'))
names = [n['name'] for n in wf['nodes']]
fails = []

def check(ok, msg):
    print(('  ok   ' if ok else '  FAIL ') + msg)
    if not ok:
        fails.append(msg)

print('nodes:', len(names))
check(len(names) == len(set(names)), 'every node name is unique')

# every connection resolves
nameset = set(names)
for src, conn in wf['connections'].items():
    check(src in nameset, 'source node exists: ' + src)
    for outputs in conn.get('main', []):
        for link in outputs or []:
            check(link['node'] in nameset, src + ' -> ' + link['node'])

# every non-trigger, non-sticky node is reachable
targets = set()
for conn in wf['connections'].values():
    for outputs in conn.get('main', []):
        for link in outputs or []:
            targets.add(link['node'])
for n in wf['nodes']:
    if n['type'] in ('n8n-nodes-base.stickyNote', 'n8n-nodes-base.manualTrigger',
                     'n8n-nodes-base.scheduleTrigger'):
        continue
    check(n['name'] in targets, 'reachable: ' + n['name'])

# every IF has both branches wired
for n in wf['nodes']:
    if n['type'] == 'n8n-nodes-base.if':
        outs = wf['connections'].get(n['name'], {}).get('main', [])
        check(len(outs) == 2 and all(outs), 'both branches wired: ' + n['name'])

# every Code node parses as JavaScript
node_bin = 'node'
for n in wf['nodes']:
    if n['type'] == 'n8n-nodes-base.code':
        fd, path = tempfile.mkstemp(suffix='.js')
        os.close(fd)
        io.open(path, 'w', encoding='utf-8').write(n['parameters']['jsCode'])
        r = subprocess.run([node_bin, '--check', path], capture_output=True, text=True)
        os.unlink(path)
        check(r.returncode == 0, 'jsCode parses: ' + n['name'] + ('' if r.returncode == 0 else '\n' + r.stderr))

# executeOnce on a node that is meant to fold many items into one silently drops the rest
for n in wf['nodes']:
    if n['name'] in ('collect attachments', 'build run summary'):
        check(n.get('executeOnce') is not True,
              'no executeOnce on the many-to-one node: ' + n['name'])

raw = io.open(WF, encoding='utf-8').read()
check('$env' not in raw, 'no $env anywhere')
check(len([n for n in wf['nodes'] if n['name'] == 'config']) == 1, 'exactly one config node')
check(wf['settings'].get('executionOrder') == 'v1', 'executionOrder is v1')
check(not any('credentials' in n for n in wf['nodes']), 'no credential ids embedded')

# no non-empty secret literals in the config node
cfgjs = [n for n in wf['nodes'] if n['name'] == 'config'][0]['parameters']['jsCode']
secrets = re.findall(r"(\w*(?:API_KEY|TOKEN|PASSWORD|SECRET))\s*=\s*'([^']*)'", cfgjs)
for k, v in secrets:
    check(v == '', 'secret is blank: ' + k)
check(bool(secrets), 'found secret constants to check')

# the safety switch ships in its safest position: preview, sending nowhere
m = re.search(r"const TEST_RUN" + chr(92) + r"s*=" + chr(92) + r"s*(" + chr(92) + r"w+)", cfgjs)
check(bool(m) and m.group(1) == 'true', 'TEST_RUN ships true')
m = re.search(r"const TEST_EMAIL" + chr(92) + r"s*=" + chr(92) + r"s*'([^']*)'", cfgjs)
check(bool(m) and m.group(1) == '', 'TEST_EMAIL ships blank (so the shipped mode is preview)')
check('DRY_RUN' not in cfgjs, 'no leftover DRY_RUN')

print()
if fails:
    print(len(fails), 'FAILED')
    sys.exit(1)
print('all checks passed')
