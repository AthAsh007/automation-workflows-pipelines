# Structural check on the built workflows. Run: python validate.py
#
# This is the §8 checklist in GUIDELINES.md, executed rather than remembered. It catches the
# failures that are invisible until import — a connection to a node that was renamed, an IF
# whose false branch goes nowhere, a credential id left in the file — plus the ones specific
# to this pipeline, where the cost of being wrong is a post on a company page.
import io, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..')
FILES = ['01-draft-and-approve.json', '02-publish-on-approval.json']

problems = []
notes = []


def check(cond, message):
    if not cond:
        problems.append(message)


for fname in FILES:
    path = os.path.join(OUT, fname)
    if not os.path.exists(path):
        problems.append('%s does not exist — run build.py' % fname)
        continue

    with io.open(path, encoding='utf-8') as f:
        raw = f.read()
    try:
        wf = json.loads(raw)
    except ValueError as e:
        problems.append('%s is not valid JSON: %s' % (fname, e))
        continue

    nodes = wf['nodes']
    names = [n['name'] for n in nodes]
    by_name = {n['name']: n for n in nodes}

    # ---------------------------------------------------------------- the config rule
    check(raw.count('$env') == 0,
          '%s: reads $env %d time(s). Every setting goes in the config node.'
          % (fname, raw.count('$env')))

    cfg_nodes = [n for n in nodes if n['name'] == 'config']
    check(len(cfg_nodes) == 1,
          '%s: has %d nodes named "config", expected exactly 1' % (fname, len(cfg_nodes)))
    if cfg_nodes:
        check(cfg_nodes[0]['type'] == 'n8n-nodes-base.code',
              '%s: the config node is a %s, not a Code node' % (fname, cfg_nodes[0]['type']))

    check(wf.get('settings', {}).get('executionOrder') == 'v1',
          '%s: settings.executionOrder is not "v1"' % fname)

    # ---------------------------------------------------------------- no duplicate names
    # n8n resolves $('name') and every connection by name. Two nodes sharing one is not
    # rejected on import — it silently wires the wrong one.
    dupes = set(n for n in names if names.count(n) > 1)
    check(not dupes, '%s: duplicate node names: %s' % (fname, ', '.join(sorted(dupes))))

    # ---------------------------------------------------------------- connections resolve
    for src, outs in wf['connections'].items():
        check(src in by_name,
              '%s: connection from "%s", which is not a node' % (fname, src))
        for group in outs.get('main', []):
            for conn in group:
                check(conn['node'] in by_name,
                      '%s: "%s" connects to "%s", which is not a node'
                      % (fname, src, conn['node']))

    # ---------------------------------------------------------------- every node is reached
    STARTERS = ('n8n-nodes-base.manualTrigger', 'n8n-nodes-base.scheduleTrigger',
                'n8n-nodes-base.webhook', 'n8n-nodes-base.stickyNote')
    reached = set()
    for outs in wf['connections'].values():
        for group in outs.get('main', []):
            for conn in group:
                reached.add(conn['node'])
    for n in nodes:
        if n['type'] in STARTERS:
            continue
        check(n['name'] in reached,
              '%s: nothing connects to "%s" — it can never run' % (fname, n['name']))

    # ---------------------------------------------------------------- IF branches both land
    # The rule that matters most: an IF whose false branch goes nowhere drops items silently.
    for n in nodes:
        if n['type'] != 'n8n-nodes-base.if':
            continue
        outs = wf['connections'].get(n['name'], {}).get('main', [])
        check(len(outs) == 2 and outs[0] and outs[1],
              '%s: IF "%s" does not wire both branches — a dropped item vanishes instead of '
              'reaching a named STOP' % (fname, n['name']))

    # A Switch must wire its fallback too, for the same reason.
    for n in nodes:
        if n['type'] != 'n8n-nodes-base.switch':
            continue
        rules = n['parameters']['rules']['values']
        outs = wf['connections'].get(n['name'], {}).get('main', [])
        check(len(outs) == len(rules) + 1,
              '%s: Switch "%s" has %d rules but %d wired outputs — the fallback output must '
              'be wired' % (fname, n['name'], len(rules), len(outs)))

    # ---------------------------------------------------------------- node references exist
    for n in nodes:
        for ref in set(re.findall(r"\$\('([^']+)'\)", json.dumps(n))):
            check(ref in by_name,
                  '%s: "%s" references $(\'%s\'), which is not a node in this workflow'
                  % (fname, n['name'], ref))

    # ---------------------------------------------------------------- Code nodes parse
    node_js = os.path.join(HERE, '_check.js')
    for n in nodes:
        if n['type'] != 'n8n-nodes-base.code':
            continue
        src = n['parameters']['jsCode']
        with io.open(node_js, 'w', encoding='utf-8', newline='\n') as f:
            # n8n wraps Code node bodies in an async function, so top-level await is legal.
            f.write('const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;\n')
            f.write('new AsyncFunction(%s);\n' % json.dumps(src))
        r = subprocess.run(['node', node_js], capture_output=True, text=True)
        check(r.returncode == 0,
              '%s: Code node "%s" does not parse: %s'
              % (fname, n['name'], r.stderr.strip().split('\n')[0] if r.stderr else '?'))
    if os.path.exists(node_js):
        os.remove(node_js)

    # ---------------------------------------------------------------- nothing secret ships
    check('credentials' not in raw or '"id"' not in raw.split('credentials')[-1][:200],
          '%s: looks like it carries a credential id — the file must be safe to hand over'
          % fname)
    for m in re.finditer(r"(?:_KEY|_TOKEN|_PASSWORD|_SECRET)\s*=\s*'([^']+)'", raw):
        problems.append('%s: a key/token constant has a non-empty literal: %s...'
                        % (fname, m.group(1)[:6]))

    # ---------------------------------------------------------------- credential naming
    CRED_TYPES = ('googleSheets', 'discord', 'httpRequest')
    for n in nodes:
        t = n['type'].split('.')[-1]
        needs = t in ('googleSheets', 'discord')
        if needs:
            check(n['name'].startswith('[cred] '),
                  '%s: "%s" needs a credential but is not prefixed [cred]'
                  % (fname, n['name']))

    # ---------------------------------------------------------------- STOP naming
    # A node that SETS _stopped is a gate's dead end and must say so in its name, so a
    # dropped run is legible in the execution list. Reading the field is not setting it —
    # the summary node reads it from whichever branch got there.
    for n in nodes:
        if n['type'] != 'n8n-nodes-base.code':
            continue
        if re.search(r"_stopped\s*:", n['parameters']['jsCode']):
            check(n['name'].startswith('STOP: '),
                  '%s: "%s" sets _stopped but is not named "STOP: ..."'
                  % (fname, n['name']))
        if n['name'].startswith('STOP: '):
            check(re.search(r"_stopped\s*:", n['parameters']['jsCode']) is not None,
                  '%s: "%s" is named as a STOP but never sets _stopped, so the summary '
                  'cannot tell what happened' % (fname, n['name']))

    notes.append('%-30s %3d nodes, %2d code, %2d stops, %2d [cred]'
                 % (fname, len(nodes),
                    sum(1 for n in nodes if n['type'] == 'n8n-nodes-base.code'),
                    sum(1 for n in names if n.startswith('STOP: ')),
                    sum(1 for n in names if n.startswith('[cred] '))))

# ---------------------------------------------------------------------- the safety switch
cfg_src = io.open(os.path.join(HERE, 'js', 'config.js'), encoding='utf-8').read()
check(re.search(r'^const TEST_RUN\s*=\s*true;', cfg_src, re.M) is not None,
      'config.js: TEST_RUN must ship as true. This is the switch that stops a first run '
      'after import from publishing to a company page.')
check(re.search(r"^const TEST_CHANNEL_ID\s*=\s*'';", cfg_src, re.M) is not None,
      'config.js: TEST_CHANNEL_ID must ship blank')
check(re.search(r"^const LINKEDIN_ACCESS_TOKEN\s*=\s*'';", cfg_src, re.M) is not None,
      'config.js: LINKEDIN_ACCESS_TOKEN must ship blank')
check(re.search(r"^const LLM_API_KEY\s*=\s*'';", cfg_src, re.M) is not None,
      'config.js: LLM_API_KEY must ship blank')
check(re.search(r"^const RENDER_KEY\s*=\s*'';", cfg_src, re.M) is not None,
      'config.js: RENDER_KEY must ship blank')
check(re.search(r"^const DISCORD_CHANNEL_ID\s*=\s*'';", cfg_src, re.M) is not None,
      'config.js: DISCORD_CHANNEL_ID must ship blank')

# The two config nodes must be byte-identical, or the workflows disagree about the mode.
c1 = json.loads(io.open(os.path.join(OUT, FILES[0]), encoding='utf-8').read())
c2 = json.loads(io.open(os.path.join(OUT, FILES[1]), encoding='utf-8').read())
g1 = [n for n in c1['nodes'] if n['name'] == 'config']
g2 = [n for n in c2['nodes'] if n['name'] == 'config']
if g1 and g2:
    check(g1[0]['parameters']['jsCode'] == g2[0]['parameters']['jsCode'],
          'the config node differs between the two workflows. They must be identical — one '
          'in preview and one live is a pipeline that drafts and then refuses to publish, '
          'or worse.')

# The publish node must never retry.
pub = [n for n in c2['nodes'] if n['name'] == '[cred] LinkedIn - publish the post']
if pub:
    check(not pub[0].get('retryOnFail'),
          'the LinkedIn publish node has retryOnFail on. A publish that times out may have '
          'succeeded; retrying double-posts, and that cannot be undone.')

# ---------------------------------------------------------------------- report
print('\n'.join(notes))
if problems:
    print('\n%d problem(s):' % len(problems))
    for p in problems:
        print('  - ' + p)
    sys.exit(1)
print('\nvalidate: ok')
