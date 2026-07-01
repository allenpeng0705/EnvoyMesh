"""Comprehensive audit: for each runtime, check that every ctx.helper({...}) call
passes all required parameters of the inner helper function.

Uses grep + heuristics since we don't have type definitions in
the runtime files (they use `ctx: any`).
"""
import re
import subprocess
from pathlib import Path

RUNTIME_DIR = Path("apps/node/src")
APPS_DIR = Path("apps/node/src")

# For each helper name, list the source files it might be defined in.
# We grep across all .ts files under apps/node/src.

def find_helper_source(helper_name):
    """Find the file + line that defines `helper_name`."""
    r = subprocess.run(
        ["grep", "-rn", "--include=*.ts",
         f"function {helper_name}(\\|export.*function {helper_name}(\\|export async function {helper_name}",
         str(APPS_DIR)],
        capture_output=True, text=True,
    )
    if not r.stdout:
        return None
    # First non-test match
    for line in r.stdout.splitlines():
        if ".test.ts" in line:
            continue
        return line.split(":")[0]
    return None


def parse_required_params(file_path, helper_name):
    """Parse the function signature, return list of required param names."""
    text = Path(file_path).read_text()
    # Find the signature line
    m = re.search(
        rf"(?:async\s+)?function\s+{re.escape(helper_name)}\(\s*input:\s*\{{([^}}]+)\}}\s*\)",
        text,
    )
    if not m:
        return None
    body = m.group(1)
    # Parse fields: name: type, name?: type, name (no type)
    params = []
    # Use comma+colon split, respecting nested parens
    depth = 0
    cur = ""
    items = []
    for ch in body:
        if ch in "([{<":
            depth += 1
            cur += ch
        elif ch in ")]}>":
            depth -= 1
            cur += ch
        elif ch == "," and depth == 0:
            items.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        items.append(cur.strip())
    for item in items:
        # Strip leading /** comments
        item = re.sub(r"^/\*\*?", "", item).strip()
        # Extract name
        name_match = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)", item)
        if name_match:
            params.append(name_match.group(1))
    return params


def find_runtime_calls(runtime_path):
    """Return list of (helper_name, [arg_names]) for each ctx.X() call with object args."""
    text = runtime_path.read_text()
    calls = []
    # Match ctx.helperName({...}) - simple parser for nested objects
    for m in re.finditer(r"ctx\.([a-zA-Z][a-zA-Z0-9]*)\s*\(", text):
        helper = m.group(1)
        # Find the matching close paren
        depth = 0
        args_end = None
        for i in range(m.end(), len(text)):
            ch = text[i]
            if ch == "(":
                depth += 1
            elif ch == ")":
                if depth == 0:
                    args_end = i
                    break
                depth -= 1
        if args_end is None:
            continue
        call_args = text[m.end():args_end]
        # Parse first object literal
        brace = call_args.find("{")
        if brace < 0:
            continue
        depth = 0
        body_end = None
        for i in range(brace, len(call_args)):
            ch = call_args[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                if depth == 0:
                    body_end = i
                    break
                depth -= 1
        if body_end is None:
            continue
        body = call_args[brace+1:body_end]
        # Tokenize on top-level commas
        depth = 0
        cur = ""
        items = []
        for ch in body:
            if ch in "([{<":
                depth += 1
                cur += ch
            elif ch in ")]}>":
                depth -= 1
                cur += ch
            elif ch == "," and depth == 0:
                items.append(cur.strip())
                cur = ""
            else:
                cur += ch
        if cur.strip():
            items.append(cur.strip())
        names = []
        for item in items:
            # Find name: key
            m2 = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:", item)
            if m2:
                names.append(m2.group(1))
            else:
                # Shorthand: just an identifier
                m2 = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)", item)
                if m2:
                    names.append(m2.group(1))
        calls.append((helper, names))
    return calls


# Find all cli-mesh-inbound-* runtimes
runtimes = sorted(RUNTIME_DIR.glob("cli-mesh-inbound-*.ts"))

# Cache helper signatures
helper_cache = {}
issues = []

for rt in runtimes:
    calls = find_runtime_calls(rt)
    for helper, args in calls:
        if helper in helper_cache:
            required = helper_cache[helper]
        else:
            src = find_helper_source(helper)
            if not src:
                continue
            required = parse_required_params(src, helper)
            helper_cache[helper] = required
        if required is None:
            continue
        # Check that every required param is in args (or is optional in the signature)
        missing = []
        for r in required:
            if r not in args:
                # Find whether it's optional in the signature
                src = helper_cache.get(helper + "_src") or find_helper_source(helper)
                if src:
                    text = Path(src).read_text()
                    m = re.search(
                        rf"function\s+{re.escape(helper)}\(\s*input:\s*\{{([^}}]+)\}}\s*\)",
                        text,
                    )
                    if m and (f"{r}?" in m.group(1) or f"{r}?:" in m.group(1)):
                        continue
                missing.append(r)
        if missing:
            issues.append((rt.name, helper, missing))

print()
if issues:
    print(f"=== {len(issues)} missing-arg issues ===")
    for rt_name, helper, missing in issues:
        print(f"  {rt_name}: ctx.{helper}() missing args: {missing}")
else:
    print("=== No missing-arg issues found ===")