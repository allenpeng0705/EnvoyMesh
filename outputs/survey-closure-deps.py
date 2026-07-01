"""Survey closure dependencies of handleInboundMeshMessage in index.ts.

Locates the function by walking past the params `{ ... }` then finding
the body's matching close brace.
"""
import re
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
TARGET_NAME = "handleInboundMeshMessage"

src = FILE.read_text()
lines = src.split("\n")

# Find the function declaration line.
fn_idx = None
for i, line in enumerate(lines):
    if f"function {TARGET_NAME}(" in line and "async" in line:
        fn_idx = i
        break
if fn_idx is None:
    raise SystemExit("function not found")

# Find the function's open paren, then walk to matching close paren.
par = lines[fn_idx].find("(")
depth = 0
paren_end = None
for i in range(fn_idx, len(lines)):
    for j, ch in enumerate(lines[i]):
        if par is not None and i == fn_idx and j < par:
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
            if depth == 0:
                paren_end = (i, j)
                break
    if paren_end is not None:
        break
if paren_end is None:
    raise SystemExit("could not find matching paren")

# After the paren, find the body's opening `{`.
rest = lines[paren_end[0]][paren_end[1] + 1:]
rest_stripped = rest.lstrip()
body_open = None
if rest_stripped.startswith("{"):
    body_open = (paren_end[0], paren_end[1] + 1 + lines[paren_end[0]].index("{", paren_end[1] + 1))
else:
    # Skip past the return-type annotation, find `{` on a later line.
    cur = (paren_end[0], paren_end[1] + 1 + len(rest) - len(rest.lstrip()))
    for i in range(cur[0], len(lines)):
        line = lines[i]
        for j, ch in enumerate(line):
            if i == cur[0] and j < cur[1]:
                continue
            if ch == "{":
                body_open = (i, j)
                break
        if body_open:
            break
if body_open is None:
    raise SystemExit("could not find body open brace")

# Walk braces from body_open to find the matching close.
depth = 0
seen_open = False
end_idx = None
for i in range(body_open[0], len(lines)):
    line = lines[i]
    for j, ch in enumerate(line):
        if i == body_open[0] and j < body_open[1]:
            continue
        if ch == "{":
            depth += 1
            seen_open = True
        elif ch == "}":
            depth -= 1
            if seen_open and depth == 0:
                end_idx = i
                break
    if end_idx is not None:
        break
if end_idx is None:
    raise SystemExit("could not find body close brace")

# Concatenate the function.
fn_lines = lines[fn_idx:end_idx + 1]
print(f"Function {TARGET_NAME}: lines {fn_idx + 1}–{end_idx + 1} ({end_idx - fn_idx + 1} lines)")

# Tokenize the body for identifiers.
body = "\n".join(fn_lines[1:])  # skip signature
identifiers = set()
in_string = None
in_line_comment = False
in_block_comment = False
i = 0
n = len(body)
while i < n:
    ch = body[i]
    if in_line_comment:
        if ch == "\n":
            in_line_comment = False
        i += 1
        continue
    if in_block_comment:
        if ch == "*" and i + 1 < n and body[i + 1] == "/":
            in_block_comment = False
            i += 2
            continue
        i += 1
        continue
    if in_string is not None:
        if ch == "\\" and i + 1 < n:
            i += 2
            continue
        if ch == in_string:
            in_string = None
        i += 1
        continue
    if ch == "/" and i + 1 < n and body[i + 1] == "/":
        in_line_comment = True
        i += 2
        continue
    if ch == "/" and i + 1 < n and body[i + 1] == "*":
        in_block_comment = True
        i += 2
        continue
    if ch in ("'", '"', "`"):
        in_string = ch
        i += 1
        continue
    if re.match(r"[A-Za-z_$]", ch):
        start = i
        while i < n and re.match(r"[A-Za-z0-9_$]", body[i]):
            i += 1
        identifiers.add(body[start:i])
        continue
    i += 1

# TS keywords + common globals + the function's own name + parameter
# names.
KEYWORDS = {
    "async", "await", "return", "if", "else", "for", "while", "do",
    "switch", "case", "default", "break", "continue", "throw", "try",
    "catch", "finally", "new", "typeof", "instanceof", "in", "of",
    "void", "delete", "class", "extends", "implements",
    "interface", "type", "enum", "namespace", "declare", "abstract",
    "public", "private", "protected", "readonly", "static", "get",
    "set", "import", "export", "from", "as", "is", "keyof", "infer",
    "satisfies", "this", "super", "true", "false", "null", "undefined",
    "const", "let", "var", "function", "yield",
    "Promise", "Error", "Array", "Object", "String", "Number",
    "Boolean", "Date", "JSON", "Math", "Map", "Set", "RegExp", "Symbol",
    "console", "Buffer", "process", "globalThis",
    "BigInt", "WeakMap", "WeakSet", "PromiseLike", "Partial", "Required",
    "Readonly", "Pick", "Omit", "Record", "Exclude", "Extract",
}
# Locals declared in the function body.
LOCAL_PATTERN = re.compile(r"^\s*(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)")
locals = set()
for line in fn_lines[1:]:
    m = LOCAL_PATTERN.match(line)
    if m:
        locals.add(m.group(1))
# Parameters: extract destructured names from the signature.
# The signature spans multiple lines; collect all `name:` tokens.
sig = lines[fn_idx]
for m in re.finditer(r"\b([A-Za-z_$][A-Za-z0-9_$]*)\s*:", sig):
    locals.add(m.group(1))
# The function's own name.
locals.add(TARGET_NAME)
# Common parameter names used in the destructure.
for n in ("inboundEnvelope", "remotePeerId", "replyWithEnvelope", "remoteAddr",
         "envelope", "receivedAt", "guardDecision"):
    locals.add(n)

unknown = sorted(identifiers - KEYWORDS - locals)
print(f"\nTotal unique identifiers: {len(identifiers)}")
print(f"Local/scope: {len(locals)}")
print(f"Candidate closure deps: {len(unknown)}")
print()
print("Candidate closure deps (alphabetical):")
for name in unknown:
    print(f"  {name}")