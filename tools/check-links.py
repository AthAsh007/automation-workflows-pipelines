#!/usr/bin/env python3
"""Check that every relative Markdown link points at a file that exists.

A renamed directory is the usual cause of a broken link here, and a README that
sends a reader to a path that no longer exists is worse than one that says
nothing. External links (http, https, mailto) are not fetched.

Exit code 0 if clean, 1 if not.
"""

import os
import re
import sys
from urllib.parse import unquote

LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
# A link inside a code span or a fenced block is an example of the syntax, not a
# link to follow. `- [Title](file.md)` in a doc about an index format should not
# make this tool demand a file called file.md.
CODE_SPAN = re.compile(r"`[^`\n]*`")
FENCE = re.compile(r"^\s*(```|~~~)")
SKIP_DIRS = {".git", "node_modules", "__pycache__", ".venv", "venv"}


def strip_code(text):
    """Blank out fenced blocks and inline code, keeping line numbers intact."""
    out, in_fence = [], False
    for line in text.split("\n"):
        if FENCE.match(line):
            in_fence = not in_fence
            out.append("")
            continue
        out.append("" if in_fence else CODE_SPAN.sub("", line))
    return "\n".join(out)


def main(root="."):
    broken = []
    checked = 0
    for dp, dn, fn in os.walk(root):
        dn[:] = [d for d in dn if d not in SKIP_DIRS]
        for f in fn:
            if not f.endswith(".md"):
                continue
            path = os.path.join(dp, f)
            try:
                text = open(path, "rb").read().decode("utf-8-sig")
            except (UnicodeDecodeError, OSError):
                continue
            for m in LINK.finditer(strip_code(text)):
                target = m.group(1).strip().split(" ")[0]
                if target.startswith(("http://", "https://", "mailto:", "#")):
                    continue
                target = unquote(target.split("#")[0])
                if not target:
                    continue
                checked += 1
                resolved = os.path.normpath(os.path.join(dp, target))
                if not os.path.exists(resolved):
                    broken.append((os.path.relpath(path, root), target))
    if not broken:
        print("check-links: %d relative link(s) resolve" % checked)
        return 0
    for src, target in broken:
        print("%s: broken link -> %s" % (src.replace("\\", "/"), target))
    print("\ncheck-links: %d broken link(s) of %d checked." % (len(broken), checked))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else "."))
