"""Audit each runtime for argument-passing bugs.

For each `ctx.helper({arg1, arg2, ...})` call in the runtime, verify
that every argument name appears as a property in the patch's
context object. This catches bugs like the broadcast.response
taskStore regression.

Strategy:
1. For each runtime file, find every `ctx.<helperName>()` call.
2. Extract the argument names from the object literal (when present).
3. Find the corresponding patch in index.ts (search for
   `handle<X>ViaRuntime(`).
4. Extract the patch's context object text.
5. For each argument name, check if it appears as a key in the
   context object.
"""
import re
import sys
from pathlib import Path

INDEX_FILE = Path("apps/node/src/index.ts")
RUNTIMES = sorted(Path("apps/node/src").glob("cli-mesh-inbound-*.ts"))


def parse_args(call_args: str) -> list[str]:
    """Extract argument names from a function call's object literal.

    e.g. `ctx.helper({ envelope, taskStore: foo })` -> ["envelope", "taskStore"]
    """
    # Find the opening { after the first (
    start = call_args.find("({")
    if start < 0:
        return []
    start += 2  # skip past '({'
    depth = 0
    end = None
    for i in range(start, len(call_args)):
        ch = call_args[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            if depth == 0:
                end = i
                break
            depth -= 1
        elif ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
    if end is None:
        return []
    body = call_args[start:end]
    # Find all `name:` or shorthand `name` keys
    names = []
    depth = 0
    last_token = ""
    tokens = []
    cur = ""
    for ch in body:
        if ch in "({[":
            depth += 1
            cur += ch
        elif ch in ")]}":
            depth -= 1
            cur += ch
        elif ch == "," and depth == 0:
            tokens.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        tokens.append(cur.strip())
    for tok in tokens:
        # Strip trailing function bodies or comments.
        tok = tok.strip()
        if not tok or tok.startswith("//") or tok.startswith("/*"):
            continue
        # Find the key.
        m = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:", tok)
        if m:
            names.append(m.group(1))
        else:
            # Shorthand: just an identifier
            m = re.match(r"([a-zA-Z_$][a-zA-Z0-9_$]*)", tok)
            if m:
                names.append(m.group(1))
    return names


def find_patch_context(idx_src, runtime_fn_name):
    """Find the context object literal in the runtime's patch in index.ts."""
    # Find the runtime call: <runtime_fn>({ ... }, { ... });
    start_pat = runtime_fn_name + r"\(\s*\{"
    m = re.search(start_pat, idx_src)
    if not m:
        return None
    # Find matching close brace of the context object.
    brace_start = m.end() - 1
    depth = 0
    seen_open = False
    for i in range(brace_start, len(idx_src)):
        ch = idx_src[i]
        if ch == "{":
            depth += 1
            seen_open = True
        elif ch == "}":
            depth -= 1
            if seen_open and depth == 0:
                return idx_src[brace_start + 1:i]
    return None


issues = []

for rt_path in RUNTIMES:
    src = rt_path.read_text()
    fn_match = re.search(r"function (\w+)\(", src)
    if not fn_match:
        continue
    fn_name = fn_match.group(1)

    # Find all ctx.X(...) calls in the runtime.
    call_pat = re.compile(r"ctx\.([a-zA-Z]+)\(([^()]*(?:\([^)]*\)[^()]*)*)\)", re.DOTALL)
    calls = []
    for m in call_pat.finditer(src):
        helper_name = m.group(1)
        call_args = m.group(2)
        # Skip short primitive-returning helpers like getNodeService, getTaskStore.
        args = parse_args(call_args)
        if not args:
            continue
        calls.append((helper_name, args))

    if not calls:
        continue

    # Find the patch context.
    idx_src = INDEX_FILE.read_text()
    ctx_text = find_patch_context(idx_src, fn_name)
    if ctx_text is None:
        continue

    # For each call, check if every arg name is available in the
    # context object (either as a property key, or as a
    # closure capture that doesn't need to be in the patch).
    # We ONLY count it as "present" if it's a KEY in the context
    # object — i.e., it appears as `<name>:` or `<name>,` or `<name>\n`
    # at the start of a value. Occurrences inside function bodies
    # don't count (a `taskStore.appendAuditEvent(event)` reference is
    # NOT a context key).
    missing = []
    keys_pattern = re.compile(
        r"(?:^|[\,\n{])[\s]*([a-zA-Z_$][a-zA-Z0-9_$]*)[\s]*:",
        re.MULTILINE,
    )
    context_keys = set(keys_pattern.findall(ctx_text))
    for helper_name, args in calls:
        for arg in args:
            if arg not in context_keys:
                missing.append(f"{helper_name}('{arg}')")

    if missing:
        print(f"  {rt_path.name} ({fn_name}):")
        for m in missing:
            print(f"    MISSING ARG: ctx.{m}")
        issues.append((rt_path.name, missing))

print()
if issues:
    print(f"=== {len(issues)} issues found ===")
    sys.exit(1)
else:
    print("=== No issues found ===")