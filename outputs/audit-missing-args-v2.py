"""Better audit: handles newlines in function signature bodies."""
import re, subprocess
from pathlib import Path

RUNTIME_DIR = Path("apps/node/src")


def find_helper_source(helper_name):
    r = subprocess.run(
        ["grep", "-rln", "--include=*.ts",
         f"function {helper_name}(\\|export.*function {helper_name}(\\|export async function {helper_name}(",
         str(RUNTIME_DIR)],
        capture_output=True, text=True,
    )
    if not r.stdout:
        return None
    for line in r.stdout.splitlines():
        if ".test.ts" in line or "cli-mesh-inbound" in line:
            continue
        return line
    return None


def parse_required_params(file_path, helper_name):
    text = Path(file_path).read_text()
    m = re.search(
        rf"(?:async\s+)?function\s+{re.escape(helper_name)}\(\s*input:\s*\{{([^}}]+)\}}\s*\)",
        text,
    )
    if not m:
        return None
    body = m.group(1)
    # Split on top-level semicolons, commas, OR newlines
    items = re.split(r"[,;\n]+", body)
    params = []
    for item in items:
        item = item.strip()
        if not item:
            continue
        nm = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)", item)
        if nm:
            params.append(nm.group(1))
    return params


def find_runtime_calls(runtime_path):
    text = runtime_path.read_text()
    calls = []
    for m in re.finditer(r"ctx\.([a-zA-Z][a-zA-Z0-9]*)\s*\(", text):
        helper = m.group(1)
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
                depth -= 1
                if depth == 0:
                    body_end = i
                    break
        if body_end is None:
            continue
        body = call_args[brace+1:body_end]
        items = re.split(r"[,;\n]+", body)
        names = []
        for item in items:
            item = item.strip()
            if not item or item.startswith("//") or item.startswith("/*"):
                continue
            m2 = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:", item)
            if m2:
                names.append(m2.group(1))
            else:
                m2 = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)", item)
                if m2:
                    names.append(m2.group(1))
        calls.append((helper, names))
    return calls


# Now run the audit
runtimes = sorted(RUNTIME_DIR.glob("cli-mesh-inbound-*.ts"))
helper_cache = {}
issues = []

for rt in runtimes:
    calls = find_runtime_calls(rt)
    for helper, args in calls:
        if helper not in helper_cache:
            src = find_helper_source(helper)
            if not src:
                helper_cache[helper] = None
                continue
            required = parse_required_params(src, helper)
            helper_cache[helper] = required
        required = helper_cache[helper]
        if required is None:
            continue
        # Check each required param
        missing = []
        src = find_helper_source(helper)
        for r in required:
            if r not in args:
                # Is it optional in the source?
                if src:
                    text = Path(src).read_text()
                    mm = re.search(
                        rf"function\s+{re.escape(helper)}\(\s*input:\s*\{{([^}}]+)\}}\s*\)",
                        text,
                    )
                    if mm and (f"{r}?" in mm.group(1) or f"{r}?:" in mm.group(1)):
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