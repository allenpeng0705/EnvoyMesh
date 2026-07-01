"""For each runtime, find which ctx methods the patch in index.ts provides.
Flag any runtime method that's NOT in the patch context.
"""
import re
from pathlib import Path

INDEX = Path("apps/node/src/index.ts").read_text()
RUNTIMES = Path("apps/node/src").glob("cli-mesh-inbound-*.ts")

issues = []
for runtime_path in sorted(RUNTIMES):
    if not runtime_path.name.endswith(".ts") or "test" in runtime_path.name:
        continue
    name = runtime_path.stem
    # Find the runtime's handle function
    src = runtime_path.read_text()
    fn_match = re.search(r"export async function (handle\w+VIA)Runtime\(", src)
    if not fn_match:
        # Try lower case
        fn_match = re.search(r"export async function (handle\w+VIA|Runtime)\(", src)
    if not fn_match:
        continue
    # Collect all ctx.X method calls
    ctx_methods = set(re.findall(r"ctx\.([a-zA-Z]+)", src))
    # Find the patch in index.ts (the call site)
    needle = f"{fn_match.group(1) if fn_match.lastindex else fn_match.group(0).replace('export async function ', '').split('(')[0]}("
    # Try a different needle
    needle = re.search(r"function (\w+)\(", src).group(1)
    patch_match = re.search(
        re.escape(needle) + r"\(\s*\{([^}]+)\}",
        INDEX,
        re.DOTALL,
    )
    if not patch_match:
        print(f"  {name}: NO PATCH FOUND (looking for {needle})")
        continue
    # Parse the patch context object for key:value pairs
    # Need to find the matching close brace
    # The regex above is naive; do it manually
    start = patch_match.start(1)  # start of { ... }
    # Find balanced braces
    depth = 0
    end = None
    for i, ch in enumerate(INDEX[start - 1:], start - 1):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    if end is None:
        continue
    ctx_text = INDEX[start - 1 : end + 1]
    # Extract key names (handle shorthand: `name,` or `name:` or `name: `)
    keys = set(re.findall(r"\n\s+([a-zA-Z]+)\s*[:,]|\n\s+([a-zA-Z]+)\s*,", ctx_text))
    flat = {a or b for a, b in keys}
    # Also match top-level imports (e.g. `createUnsignedEnvelope,`)
    import re
    flat = set()
    for m in re.finditer(r"^\s*([a-zA-Z]+)\s*[:,](?!\s*[a-zA-Z])", ctx_text, re.MULTILINE):
        flat.add(m.group(1))
    # Also match shorthand `name,` (no colon)
    for m in re.finditer(r"^\s*([a-zA-Z]+)\s*,\s*$", ctx_text, re.MULTILINE):
        flat.add(m.group(1))
    missing = ctx_methods - flat
    if missing:
        print(f"  {name}: MISSING in patch: {missing}")
        issues.append((name, missing))
    else:
        print(f"  {name}: OK ({len(ctx_methods)} methods)")

print()
if issues:
    print(f"=== {len(issues)} issues found ===")
else:
    print("=== No issues found ===")