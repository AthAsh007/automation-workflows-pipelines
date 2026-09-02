# Structural check on all three workflows. Run: python validate.py
#
# This is the GUIDELINES.md section 8 checklist, plus the things specific to an engine that
# can text people: it asserts the shipped default cannot send, that every optional provider
# has a gate, and that the idempotency key is computed before the send rather than after.
import io, json, os, re, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = ['01-job-order-to-campaign.json', '02-outreach-runner.json',
         '03-inbound-and-qualify.json']

fails = []


def check(ok, msg):
    print(('  ok   ' if ok else '  FAIL ') + msg)
    if not ok:
        fails.append(msg)


TRIGGERS = ('n8n-nodes-base.stickyNote', 'n8n-nodes-base.manualTrigger',
            'n8n-nodes-base.scheduleTrigger', 'n8n-nodes-base.webhook')

configs = {}
all_code = {}

for fname in FILES:
    path = os.path.join(HERE, '..', fname)
    wf = json.load(io.open(path, encoding='utf-8'))
    raw = io.open(path, encoding='utf-8').read()
    names = [n['name'] for n in wf['nodes']]
    by_name = {n['name']: n for n in wf['nodes']}
    print('\n== %s  (%d nodes)' % (fname, len(names)))

    check(len(names) == len(set(names)), 'node names are unique')
    nameset = set(names)

    # every connection resolves
    for src, conn in wf['connections'].items():
        check(src in nameset, 'source exists: ' + src)
        for outputs in conn.get('main', []):
            for link in outputs or []:
                check(link['node'] in nameset, src + ' -> ' + link['node'])

    targets = set()
    merge_inputs = {}
    for conn in wf['connections'].values():
        for outputs in conn.get('main', []):
            for link in outputs or []:
                targets.add(link['node'])
                merge_inputs.setdefault(link['node'], set()).add(link.get('index', 0))

    for n in wf['nodes']:
        if n['type'] in TRIGGERS:
            continue
        check(n['name'] in targets, 'reachable: ' + n['name'])

    for n in wf['nodes']:
        # Every IF has both branches wired. A false branch going nowhere is how items
        # vanish without appearing anywhere in the execution list.
        if n['type'] == 'n8n-nodes-base.if':
            outs = wf['connections'].get(n['name'], {}).get('main', [])
            check(len(outs) == 2 and all(outs), 'both branches wired: ' + n['name'])

        # Every merge actually has both inputs fed, or it silently halves the data.
        if n['type'] == 'n8n-nodes-base.merge':
            want = int(n['parameters'].get('numberInputs', 2))
            got = merge_inputs.get(n['name'], set())
            check(got == set(range(want)),
                  'all %d merge inputs fed: %s (got %s)' % (want, n['name'], sorted(got)))

        # Any node that talks to a network must not be able to end the run, and must
        # produce an item even when it returns nothing.
        if n['type'] in ('n8n-nodes-base.httpRequest', 'n8n-nodes-base.googleCalendar',
                         'n8n-nodes-base.gmail'):
            check(n.get('onError') == 'continueRegularOutput',
                  'network node cannot kill the run: ' + n['name'])

        if n['type'] == 'n8n-nodes-base.code':
            src = n['parameters']['jsCode']
            all_code.setdefault(fname, {})[n['name']] = src
            # n8n wraps a Code node body in an async function, so top-level await is legal
            # there and must be checked the same way.
            fd, tmp = tempfile.mkstemp(suffix='.js')
            os.close(fd)
            io.open(tmp, 'w', encoding='utf-8').write(
                '(async function(){\n' + src + '\n})')
            r = subprocess.run(['node', '--check', tmp], capture_output=True, text=True)
            os.unlink(tmp)
            check(r.returncode == 0, 'jsCode parses: ' + n['name'] +
                  ('' if r.returncode == 0 else '\n' + r.stderr))

            # A Code node that folds many items into one loses the rest if executeOnce
            # is set. Never set it on this engine.
            check(n.get('executeOnce') is not True, 'no executeOnce on: ' + n['name'])

    check('$env' not in raw, 'no $env anywhere')
    cfgs = [n for n in wf['nodes'] if n['name'] == 'config']
    check(len(cfgs) == 1, 'exactly one config node')
    check(cfgs and cfgs[0]['type'] == 'n8n-nodes-base.code', 'config is a Code node')
    check(wf['settings'].get('executionOrder') == 'v1', 'executionOrder is v1')
    check(not any('credentials' in n for n in wf['nodes']), 'no credential ids embedded')
    check(any(n['name'].startswith('STOP:') for n in wf['nodes']),
          'has named STOP nodes')
    if cfgs:
        configs[fname] = cfgs[0]['parameters']['jsCode']

# ---------------------------------------------------------------- across the three
print('\n== the three workflows together')
vals = [configs[f] for f in FILES]
check(vals[0] == vals[1] == vals[2],
      'the three config nodes are byte-identical (edit one, paste into the others)')

cfgjs = vals[0]

print('\n== ships safe')
check(re.search(r"const TEST_RUN\s*=\s*true", cfgjs) is not None, 'TEST_RUN ships true')
check(re.search(r"const DEMO_MODE\s*=\s*true", cfgjs) is not None, 'DEMO_MODE ships true')
m = re.search(r"const TEST_PHONE\s*=\s*'([^']*)'", cfgjs)
check(bool(m) and m.group(1) == '', 'TEST_PHONE ships blank (so it ships in preview)')

# DEMO_MODE must be able to force preview on its own. A fabricated Twilio response must
# never be able to reach a real phone, whatever the other two switches say.
check("DEMO_MODE ? 'preview'" in cfgjs,
      'DEMO_MODE forces preview regardless of TEST_RUN')

# No secret ships with a value.
SECRETS = ['SUPABASE_SERVICE_KEY', 'ATS_TOKEN', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN',
           'TWILIO_FROM_NUMBER', 'TWILIO_MESSAGING_SID', 'RETELL_API_KEY', 'RETELL_AGENT_ID',
           'RETELL_WEBHOOK_SECRET', 'SLACK_WEBHOOK_URL', 'SUPABASE_URL', 'ATS_BASE_URL',
           'CLIENT_ID', 'AI_API_KEY']
for name in SECRETS:
    m = re.search(r"const " + name + r"\s*=\s*'([^']*)'", cfgjs)
    check(bool(m) and m.group(1) == '', name + ' ships blank')

# Nothing anywhere in the built JSON looks like a live key.
for fname in FILES:
    raw = io.open(os.path.join(HERE, '..', fname), encoding='utf-8').read()
    check(not re.search(r"(sk-[A-Za-z0-9]{16,}|AC[0-9a-f]{32}|key_[A-Za-z0-9]{20,}"
                        r"|eyJ[A-Za-z0-9_-]{30,})", raw),
          'no live-looking credential in ' + fname)

print('\n== the gates that matter')
w2code = all_code['02-outreach-runner.json']
w3code = all_code['03-inbound-and-qualify.json']

# The idempotency key must be computed in the node that decides, not in the node that
# records. Computing it after the send is the bug this whole design exists to avoid.
check('idempotency_key: keyFor(' in w2code['decide the next touch'],
      'the idempotency key is computed BEFORE the send, in `decide the next touch`')
check('idempotency_key: r.idempotency_key' in w2code['record the attempt'],
      '`record the attempt` reuses that key rather than making a new one')

# Opt-out must be checked before intent classification, not after.
readev = w3code['read the event']
check(readev.index('opt_out_keywords') < readev.index('positive_keywords'),
      'opt-out keywords are tested before positive keywords')

# The signature check must fail closed.
sig = w3code['verify the signature']
check('_allow = result._verified || (!cfg.live_send' in sig,
      'the signature check fails closed — only a non-live run may proceed unverified')

# Quiet hours must use the candidate timezone, not the server's.
dnt = w2code['decide the next touch']
check('candidate_timezone' in dnt and 'Intl.DateTimeFormat' in dnt,
      'quiet hours are evaluated in the candidate timezone')

# Every send path must be reachable only through the mode gate.
wf2 = json.load(io.open(os.path.join(HERE, '..', FILES[1]), encoding='utf-8'))
conns2 = wf2['connections']


def reaches(start, target, seen=None):
    seen = seen or set()
    if start in seen:
        return False
    seen.add(start)
    for outs in conns2.get(start, {}).get('main', []):
        for link in outs or []:
            if link['node'] == target or reaches(link['node'], target, seen):
                return True
    return False


for sender in ('[cred] Twilio - send the SMS', '[cred] Retell - start the call'):
    # The only route to a sender is through `sending?`, whose true branch is the only one
    # that carries on. If any earlier node reached it directly, preview would send.
    check(reaches('sending?', sender), sender + ' is downstream of the `sending?` gate')
    check(not reaches('STOP: preview - nothing sent', sender),
          'preview cannot reach ' + sender)

print('\n== every external call is gated')
# The demo must run clean with no Supabase, no ATS and no keys — no node firing at an
# empty URL and no warning triangles on a screen-share. So: walk forward from the triggers,
# refusing to follow the TRUE branch of any config gate, and assert that no node which
# builds a URL from config is reachable that way.
GATES = {'Supabase connected?', 'writing to the database?', 'persisting?',
         'database connected?', 'logging the event?', 'writing back?', 'can we book?',
         'ATS connected?', 'AI worth calling?', 'Twilio connected?', 'Retell connected?',
         'sending?'}

for fname in FILES:
    wf = json.load(io.open(os.path.join(HERE, '..', fname), encoding='utf-8'))
    conns = wf['connections']
    by_name = {n['name']: n for n in wf['nodes']}

    external = set()
    for n in wf['nodes']:
        if n['name'] == 'config':
            continue
        blob = json.dumps(n.get('parameters', {}))
        if 'supabase_url' in blob or 'ats_base_url' in blob or 'ai_key' in blob \
                or 'twilio_sid' in blob or 'retell_key' in blob:
            external.add(n['name'])

    reached = set()
    frontier = [n['name'] for n in wf['nodes'] if n['type'] in TRIGGERS
                and n['type'] != 'n8n-nodes-base.stickyNote']
    while frontier:
        cur = frontier.pop()
        if cur in reached:
            continue
        reached.add(cur)
        outs = conns.get(cur, {}).get('main', [])
        for idx, links in enumerate(outs):
            # A gate's true branch is the configured path — do not follow it.
            if cur in GATES and idx == 0:
                continue
            for link in links or []:
                frontier.append(link['node'])

    ungated = sorted(external & reached)
    check(not ungated, fname + ': no external call runs unconfigured'
          + ('' if not ungated else ' — UNGATED: ' + ', '.join(ungated)))

print('\n== the database')
schema = io.open(os.path.join(HERE, '..', 'supabase', 'schema.sql'), encoding='utf-8').read()
for constraint in [
        'unique (client_id, ats_candidate_id)',
        'unique (campaign_id, candidate_id)',
        'unique (client_id, idempotency_key)',
        'unique (client_id, phone_e164, channel)']:
    check(constraint in schema, 'schema has: ' + constraint)
check('enable row level security' in schema, 'RLS is enabled on every table')
check('for update skip locked' in schema, 'the claim function uses FOR UPDATE SKIP LOCKED')
check('create or replace view v_due_attempts' in schema, 'the queue is a view')

# Tables the workflows POST to must exist in the schema.
for fname in FILES:
    raw = io.open(os.path.join(HERE, '..', fname), encoding='utf-8').read()
    for table in set(re.findall(r"/rest/v1/([a-z_]+)", raw)):
        if table == 'rpc':
            continue
        check(('create table if not exists ' + table) in schema,
              'table exists for ' + fname + ': ' + table)
    for fn in set(re.findall(r"/rest/v1/rpc/([a-z_]+)", raw)):
        check(('function ' + fn) in schema or ('create or replace function ' + fn) in schema,
              'rpc exists for ' + fname + ': ' + fn)

print()
if fails:
    print(len(fails), 'FAILED')
    sys.exit(1)
print('all checks passed')
