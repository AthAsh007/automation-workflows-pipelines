import json, sys, subprocess, tempfile, os, io, re

path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "workflow-v2.json")
d = json.load(io.open(path, encoding="utf-8"))
names = {n["name"] for n in d["nodes"]}
ids = [n["id"] for n in d["nodes"]]
errs, warns = [], []

if len(set(ids)) != len(ids):
    errs.append("duplicate node ids")
if len(names) != len(d["nodes"]):
    errs.append("duplicate node names")

# connections resolve
for src, spec in d["connections"].items():
    if src not in names:
        errs.append("connection from unknown node: %s" % src)
    for outs in spec.get("main", []):
        for c in outs or []:
            if c["node"] not in names:
                errs.append("%s -> unknown node %s" % (src, c["node"]))

# merge input indexes fit numberInputs
merges = {n["name"]: n["parameters"].get("numberInputs", 2)
          for n in d["nodes"] if n["type"].endswith(".merge")}
seen = {m: set() for m in merges}
for src, spec in d["connections"].items():
    for outs in spec.get("main", []):
        for c in outs or []:
            if c["node"] in merges:
                seen[c["node"]].add(c["index"])
                if c["index"] >= merges[c["node"]]:
                    errs.append("%s feeds %s input %d but it has only %d"
                                % (src, c["node"], c["index"], merges[c["node"]]))
for m, s in seen.items():
    if len(s) != merges[m]:
        warns.append("merge %s declares %d inputs, %d connected: %s"
                     % (m, merges[m], len(s), sorted(s)))

# every non-trigger, non-sticky node has an inbound connection
TRIGGERS = ("webhook", "Trigger", "manualTrigger")
inbound = set()
for spec in d["connections"].values():
    for outs in spec.get("main", []):
        for c in outs or []:
            inbound.add(c["node"])
for n in d["nodes"]:
    t = n["type"]
    if t.endswith("stickyNote"):
        continue
    if any(k.lower() in t.lower() for k in TRIGGERS):
        continue
    if n["name"] not in inbound:
        errs.append("orphan node (no input): %s" % n["name"])

# node-name references inside expressions and code resolve
blob = json.dumps(d, ensure_ascii=False)
for ref in set(re.findall(r"\$\('([^']+)'\)", blob)):
    if ref not in names:
        errs.append("expression references unknown node: $('%s')" % ref)

# pinned data targets a real node
for k in d.get("pinData", {}):
    if k not in names:
        errs.append("pinData for unknown node: %s" % k)

# Code nodes parse as JS
codes = [(n["name"], n["parameters"]["jsCode"]) for n in d["nodes"] if n["type"].endswith(".code")]
for name, js in codes:
    with tempfile.NamedTemporaryFile("w", suffix=".js", delete=False, encoding="utf-8") as f:
        f.write("(async function(){\n" + js + "\n})")
        tmp = f.name
    r = subprocess.run(["node", "--check", tmp], capture_output=True, text=True)
    os.unlink(tmp)
    if r.returncode != 0:
        errs.append("Code node %r does not parse:\n%s" % (name, r.stderr.strip()[:600]))

print("nodes: %d  connections: %d  code nodes: %d" % (len(d["nodes"]), len(d["connections"]), len(codes)))
for w in warns:
    print("WARN ", w)
for e in errs:
    print("ERROR", e)
print("OK" if not errs else "FAILED")
sys.exit(1 if errs else 0)
