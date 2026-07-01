"""Audit each runtime by literally grepping the patch's call site for each ctx method.

This is more reliable than the previous regex-based script.
"""
import re
import subprocess
from pathlib import Path

INDEX_FILE = Path("apps/node/src/index.ts")
RUNTIMES = sorted(Path("apps/node/src").glob("cli-mesh-inbound-*.ts"))
RUNTIMES = [r for r in RUNTIMES if not r.name.endswith(".d.ts")]

issues = []
for rt_path in RUNTIMES:
    src = rt_path.read_text()
    # Find the function name
    fn_match = re.search(r"function (\w+)\(", src)
    if not fn_match:
        continue
    fn_name = fn_match.group(1)

    # Find the patch in index.ts: search for "<fn_name>(" followed by a
    # balanced { ... } context object.
    idx = INDEX_FILE.read_text()
    pattern = re.compile(re.escape(fn_name) + r"\(\s*\{", re.DOTALL)
    m = pattern.search(idx)
    if not m:
        print(f"  {rt_path.name}: NO PATCH FOUND")
        continue
    # Find the closing brace of the context object.
    start = m.end()  # position right after the opening {
    depth = 1
    end = None
    for i in range(start, len(idx)):
        ch = idx[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end is None:
        print(f"  {rt_path.name}: could not find matching close brace")
        continue
    ctx_text = idx[start:end]

    # Find the next "), " to find the end of the call (after the params obj).
    # The second arg is the params object.
    # We need to know where the context obj ends (already found `end`).
    # The context object text is `idx[start:end]`.

    # Collect all ctx.X method calls in the runtime
    ctx_methods = sorted(set(re.findall(r"ctx\.([a-zA-Z]+)", src)))

    # For each ctx method, check if its name appears in the context text
    missing = []
    for m in ctx_methods:
        # Match the name as a property key (e.g. `getTaskStore:`, `getTaskStore,`)
        # as a whole word.
        if not re.search(r"\b" + re.escape(m) + r"\b", ctx_text):
            missing.append(m)

    if missing:
        print(f"  {rt_path.name}:")
        for m in missing:
            print(f"    MISSING: ctx.{m}")
        issues.append((rt_path.name, missing))
    else:
        print(f"  {rt_path.name}: OK ({len(ctx_methods)} methods)")

print()
if issues:
    print(f"=== {len(issues)} issues found ===")
else:
    print("=== No issues found ===")