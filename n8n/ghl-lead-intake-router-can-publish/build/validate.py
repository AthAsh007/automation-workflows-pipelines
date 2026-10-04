# Structural check on both workflows. Run: python validate.py
import io, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = ['01-intake-and-routing.json', '02-follow-up-sequence.json']
fails = []


def check(ok, msg):
    print(('  ok   ' if ok else '  FAIL ') + msg)
    if not ok:
        fails.append(msg)


TRIGGERS = ('n8n-nodes-base.stickyNote', 'n8n-nodes-base.manualTrigger',
            'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.webhook')

configs = {}
for fname in FILES:
    path = os.path.join(HERE, '..', fname)
    wf = json.load(io.open(path, encoding='utf-8'))
    raw = io.open(path, encoding='utf-8').read()
    names = [n['name'] for n in wf['nodes']]
    nameset = set(names)
    print('\n== %s  (%d nodes)' % (fname, len(names)))

    check(len(names) == len(set(names)), 'node names are unique')

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
    for n in wf['nodes']:
        if n['type'] in TRIGGERS:
            continue
        check(n['name'] in targets, 'reachable: ' + n['name'])

    # Nothing should end without saying what happened: every node with no outgoing connection
    # (triggers and sticky notes aside) must be End.
    sources = set(wf['connections'].keys())
    terminal = [n['name'] for n in wf['nodes']
                if n['type'] not in TRIGGERS and n['name'] not in sources]
    check(set(terminal) == {'End'}, 'the only sink is End: ' + str(sorted(terminal)))

    for n in wf['nodes']:
        if n['type'] == 'n8n-nodes-base.if':
            outs = wf['connections'].get(n['name'], {}).get('main', [])
            check(len(outs) == 2 and all(outs), 'both branches wired: ' + n['name'])
        if n['type'] == 'n8n-nodes-base.code':
            fd, tmp = tempfile.mkstemp(suffix='.js')
            os.close(fd)
            io.open(tmp, 'w', encoding='utf-8').write(n['parameters']['jsCode'])
            r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
            os.unlink(tmp)
            check(r.returncode == 0, 'jsCode parses: ' + n['name'] +
                  ('' if r.returncode == 0 else '\n' + r.stderr))

    check('$env' not in raw, 'no $env anywhere')
    check(len([n for n in wf['nodes'] if n['name'] == 'config']) == 1, 'exactly one config node')
    check(wf['settings'].get('executionOrder') == 'v1', 'executionOrder is v1')
    check(not any('credentials' in n for n in wf['nodes']), 'no credential ids embedded')

    # A refused call has to be a visible step, not a swallowed one.
    for n in wf['nodes']:
        if n['type'] == 'n8n-nodes-base.httpRequest':
            check(n.get('onError') == 'continueErrorOutput',
                  'the GoHighLevel call routes failures to a visible branch: ' + n['name'])

    # The convention (GUIDELINES §7): a yellow "— start here" note pinned top-left.
    notes = [n for n in wf['nodes'] if n['type'] == 'n8n-nodes-base.stickyNote']
    yellow = [n for n in notes if n['parameters'].get('color') == 1
              and 'start here' in str(n['parameters'].get('content', ''))]
    check(len(yellow) == 1, 'exactly one yellow "start here" note')
    if yellow:
        min_y = min(n['position'][1] for n in wf['nodes'])
        check(yellow[0]['position'][1] == min_y,
              'the start-here note is the topmost note (y=%s)' % yellow[0]['position'][1])

    configs[fname] = [n for n in wf['nodes'] if n['name'] == 'config'][0]['parameters']['jsCode']

print('\n== both workflows')
a, b = [configs[f] for f in FILES]
check(a == b, 'the two config nodes are identical')

js = a
check(re.search(r'const DRY_RUN\s*=\s*true', js) is not None, 'DRY_RUN ships true (ships in preview)')
for name in ('GHL_LOCATION_ID', 'GHL_API_KEY', 'GHL_PIPELINE_ID'):
    m = re.search(r"const " + name + r"\s*=\s*'([^']*)'", js)
    check(bool(m) and m.group(1) == '', name + ' ships blank')
check(re.search(r'const MAX_TOUCHES\s*=\s*(\d+)', js) is not None, 'the touch cap is a number in code')

print()
if fails:
    print(len(fails), 'FAILED')
    sys.exit(1)
print('all checks passed')
