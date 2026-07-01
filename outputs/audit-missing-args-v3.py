#!/usr/bin/env python3
"""Comprehensive audit of all CLI runtimes for missing-arg bugs.

Catches the same class of bug that Step 85 (broadcast), Step 86
(discovery), Step 87 (task.feedback), Step 88 (official.credential)
all had: the runtime calls a helper without all its required args.
"""
import re
import subprocess
from pathlib import Path

RUNTIME_DIR = Path("apps/node/src")

# Stopwords that look like fields but aren't real parameter names:
# - this, from, the (English words that appear in comments)
# - string, number, boolean, void, unknown, never, any (TS type names)
# - Record, Map, Set, Array, Buffer, Promise, Readonly (generic types)
# - LocalTaskStore, LocalPeerDirectoryStore, etc. (specific type aliases
#   the helper signature declares inline)
STOPWORDS = {
    "this", "from", "the", "string", "number", "boolean", "void", "unknown",
    "never", "any", "Record", "Map", "Set", "Array", "Buffer", "Promise",
    "Readonly",
}


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
    items = re.split(r"[,;\n]+", body)
    params = []
    for item in items:
        item = item.strip()
        if not item:
            continue
        # Skip optional fields: name? or name?: type
        nm = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\??\s*:?", item)
        if nm:
            # Check if this parameter is optional (followed by `?`).
            name = nm.group(1)
            if "?" in item:
                continue  # optional — skip
            params.append(name)
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
        # Strip comments line-by-line before parsing.
        cleaned = "\n".join(
            ln for ln in body.split("\n")
            if not (ln.lstrip().startswith("//") or ln.lstrip().startswith("/*"))
        )
        items = re.split(r"[,;\n]+", cleaned)
        names = []
        for item in items:
            item = item.strip()
            if not item:
                continue
            m2 = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:", item)
            if m2:
                names.append(m2.group(1))
            else:
                m2 = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)", item)
                if m2:
                    names.append(m2.group(1))
        # Filter out stopwords / type names.
        names = [n for n in names if n not in STOPWORDS]
        calls.append((helper, names))
    return calls


def main():
    runtimes = sorted(RUNTIME_DIR.glob("cli-mesh-inbound-*.ts"))
    helper_cache = {}
    issues = []
    for rt in runtimes:
        calls = find_runtime_calls(rt)
        for helper, args in calls:
            if helper not in helper_cache:
                src = find_helper_source(helper)
                if not src:
                    helper_cache[helper] = (None, None)
                    continue
                required = parse_required_params(src, helper)
                helper_cache[helper] = (required, src)
            required, src = helper_cache[helper]
            if required is None:
                continue
            missing = []
            for r in required:
                if r in STOPWORDS:
                    continue
                if r not in args:
                    missing.append(r)
            if missing:
                issues.append((rt.name, helper, missing))
    if issues:
        print(f"=== {len(issues)} missing-arg issues ===")
        for rt_name, helper, missing in issues:
            print(f"  {rt_name}: ctx.{helper}() missing args: {missing}")
        return 1
    print("=== No missing-arg issues found ===")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())