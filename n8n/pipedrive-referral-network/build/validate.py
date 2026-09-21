# Structural check on both workflows. Run: python validate.py
import io, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = ['01-activity-guard.json', '02-recruitment-reporting.json']
JOB_URL = 'https://example.com/jobs/~022093811915701331307/'

# IFs that split a per-item stream. Each must rejoin at exactly one Merge before anything
# aggregates, or the summary is computed on whichever half happened to fire.
PER_ITEM_IFS = {
    '01-activity-guard.json': ['creating this activity?'],
    '02-recruitment-reporting.json': ['writing the dashboard?'],
}
# Code nodes that fold many items into one answer. executeOnce would silently drop the rest.
FOLDERS = {
    '01-activity-guard.json': ['decide the next activity', 'build the run summary'],
    '02-recruitment-reporting.json': ['compute the KPIs', 'rows for the gaps tab',
                                      'rows for the by rep tab',
                                      'rows for the by practice tab'],
}

fails = []


def check(ok, msg):
    print(('  ok   ' if ok else '  FAIL ') + msg)
    if not ok:
        fails.append(msg)


configs = {}

for FILE in FILES:
    path = os.path.join(HERE, '..', FILE)
    wf = json.load(io.open(path, encoding='utf-8'))
    raw = io.open(path, encoding='utf-8').read()
    nodes = wf['nodes']
    names = [n['name'] for n in nodes]
    by_name = {n['name']: n for n in nodes}

    print('\n== %s  (%d nodes)' % (FILE, len(names)))
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
    for n in nodes:
        if n['type'] in ('n8n-nodes-base.manualTrigger', 'n8n-nodes-base.scheduleTrigger'):
            check(n['name'] in wf['connections'], 'trigger is wired: ' + n['name'])

    print('  -- branches and joins')
    for n in nodes:
        if n['type'] == 'n8n-nodes-base.if':
            outs = wf['connections'].get(n['name'], {}).get('main', [])
            check(len(outs) == 2 and all(outs), 'both branches wired: ' + n['name'])
        if n['type'] == 'n8n-nodes-base.merge':
            got = targets.get(n['name'], set())
            check(got == {0, 1},
                  'both inputs fed: ' + n['name'] + ' (has ' + str(sorted(got)) + ')')
            check(n['parameters'].get('numberInputs') == 2, 'declares 2 inputs: ' + n['name'])

    for name in PER_ITEM_IFS[FILE]:
        outs = wf['connections'].get(name, {}).get('main', [])
        reached, seen = set(), set()
        frontier = [l['node'] for o in outs for l in (o or [])]
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
        check(len(reached) == 1,
              name + ' rejoins at exactly one merge ' + str(sorted(reached)))

    print('  -- code nodes')
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
        if n['name'] in FOLDERS[FILE]:
            check(n.get('executeOnce') is not True, 'no executeOnce on: ' + n['name'])

    # Every $('...') reference inside a Code node must name a node that exists in THIS file.
    # A shared source file moved between workflows is exactly how that breaks.
    for n in nodes:
        if n['type'] != 'n8n-nodes-base.code':
            continue
        for ref in set(re.findall(r"\$\('([^']+)'\)", n['parameters']['jsCode'])):
            check(ref in nameset, n['name'] + " references $('" + ref + "') which exists")

    print('  -- outward-facing calls')
    for n in nodes:
        if n['type'] == 'n8n-nodes-base.httpRequest':
            check(n.get('onError') == 'continueRegularOutput',
                  'degrades instead of failing the run: ' + n['name'])
            check('timeout' in json.dumps(n['parameters'].get('options', {})),
                  'has a timeout: ' + n['name'])
    for n in nodes:
        if n['name'].startswith('[cred] Pipedrive - ') and n['name'].find('create') == -1:
            check(n.get('alwaysOutputData') is True,
                  'always outputs data (an empty read must not end the run silently): '
                  + n['name'])

    print('  -- the config node')
    check(len([n for n in nodes if n['name'] == 'config']) == 1, 'exactly one config node')
    cfg_node = by_name['config']
    check(cfg_node['type'] == 'n8n-nodes-base.code', 'config is a Code node')
    configs[FILE] = cfg_node['parameters']['jsCode']
    cfgjs = configs[FILE]

    check('$env' not in raw, 'no $env anywhere')
    check(wf['settings'].get('executionOrder') == 'v1', 'executionOrder is v1')
    check(not any('credentials' in n for n in nodes), 'no credential ids embedded')

    check(re.search(r"const TEST_RUN\s*=\s*true", cfgjs) is not None, 'TEST_RUN ships true')
    check(re.search(r"const DEMO_PIPELINE\s*=\s*true", cfgjs) is not None,
          'DEMO_PIPELINE ships true, so the first run works with no account')
    for name in ('COMPANY_DOMAIN', 'API_TOKEN', 'PIPELINE_ID', 'SHEET_ID',
                 'ALERT_WEBHOOK_URL', 'MANAGER_WEBHOOK_URL', 'TEST_OWNER_ID'):
        m = re.search(r"const " + name + r"\s*=\s*'([^']*)'", cfgjs)
        check(bool(m) and m.group(1) == '', name + ' ships blank')

    leaks = re.findall(r"const \w*(?:KEY|TOKEN|SECRET|PASSWORD)\w*\s*=\s*'([^']{8,})'", cfgjs)
    check(not leaks, 'no key, token or password has a value')

    print('  -- the PHI boundary')
    check('check the PHI boundary' in nameset, 'the PHI check is in the workflow')
    phi = by_name['check the PHI boundary']['parameters']['jsCode']
    check('throw new Error' in phi,
          'a workflow configured to read a PHI-shaped field stops the run')
    # The check must sit between the read and anything that consumes deal data.
    downstream = wf['connections'].get('check the PHI boundary', {}).get('main', [[]])[0]
    check(bool(downstream) and downstream[0]['node'] == 'check every deal for a next activity',
          'the PHI check runs before any deal is read')

    print('  -- the brief is on the canvas')
    check(JOB_URL in raw, 'the job post link is in a sticky note')
    stickies = [n for n in nodes if n['type'] == 'n8n-nodes-base.stickyNote']
    check(len(stickies) >= 3, 'the canvas documents itself (%d sticky notes)' % len(stickies))

print('\n== the two workflows agree')
check(configs[FILES[0]] == configs[FILES[1]],
      'both files carry a byte-identical config node — a stage renamed in one is renamed '
      'in both')

print('\n== the sheet')
import csv
meta = json.loads(subprocess.run(
    ['node', '-e',
     'const c=new Function(require("fs").readFileSync("js/config.js","utf8"))()[0].json;'
     'process.stdout.write(JSON.stringify({dash:c.dashboard_columns,gaps:c.gap_columns,'
     'rep:c.by_rep_columns,prac:c.by_practice_columns}))'],
    cwd=HERE, capture_output=True, text=True, check=True).stdout)

for tab, key in (('Dashboard.csv', 'dash'), ('Gaps.csv', 'gaps'),
                 ('By rep.csv', 'rep'), ('By practice.csv', 'prac')):
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

print()
if fails:
    print(len(fails), 'FAILED')
    sys.exit(1)
print('all checks passed')
