"""Extract ONE arm of handleInboundMeshMessage as a runtime.

Test: extract the `system.ping` arm (lines 1007-1028, 20 lines, 1
intent) and verify the pattern works before extracting the whole
function.

This produces:
  - apps/node/src/cli-mesh-inbound-system-ping.ts: the runtime
  - A test file: apps/node/test/cli-mesh-inbound-system-ping.test.ts
  - A patch script that replaces the arm in index.ts with a call

Usage: python3 outputs/extract-cli-arm.py
"""
import re
import subprocess
from pathlib import Path

FILE = Path("apps/node/src/index.ts")
ARM_START = 1007
ARM_END = 1028  # inclusive

src = FILE.read_text()
lines = src.split("\n")
# Arm body is lines[ARM_START-1:ARM_END] (0-indexed exclusive end).
arm = "\n".join(lines[ARM_START - 1 : ARM_END])
print(f"Arm spans lines {ARM_START}–{ARM_END} ({ARM_END - ARM_START + 1} lines)")

# Tokenize the arm to find candidate closure deps.
identifiers = set()
in_string = None
in_line_comment = False
in_block_comment = False
i = 0
n = len(arm)
while i < n:
    ch = arm[i]
    if in_line_comment:
        if ch == "\n":
            in_line_comment = False
        i += 1
        continue
    if in_block_comment:
        if ch == "*" and i + 1 < n and arm[i + 1] == "/":
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
    if ch == "/" and i + 1 < n and arm[i + 1] == "/":
        in_line_comment = True
        i += 2
        continue
    if ch == "/" and i + 1 < n and arm[i + 1] == "*":
        in_block_comment = True
        i += 2
        continue
    if ch in ("'", '"', "`"):
        in_string = ch
        i += 1
        continue
    if re.match(r"[A-Za-z_$]", ch):
        start = i
        while i < n and re.match(r"[A-Za-z0-9_$]", arm[i]):
            i += 1
        identifiers.add(arm[start:i])
        continue
    i += 1

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
    "BigInt", "WeakMap", "WeakSet",
    "envelope", "receivedAt", "remotePeerId", "correlationId",
    "InboundMeshMessageParams", "NodeServiceImpl",
    # Already-properly-namespaced or that we don't want to rewrite
    "envelope.intent", "envelope.messageId", "envelope.createdAt",
    "envelope.senderPeerId", "envelope.payload", "envelope.signature",
}
# Locals declared in the arm.
LOCAL_PATTERN = re.compile(r"^\s*(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)")
locals = set()
for line in lines[ARM_START - 1 : ARM_END]:
    m = LOCAL_PATTERN.match(line)
    if m:
        locals.add(m.group(1))
# Parameter names.
locals.add("payload")

deps = sorted(identifiers - KEYWORDS - locals)
print(f"\nUnique identifiers: {len(identifiers)}")
print(f"Local/scope: {len(locals)}")
print(f"Candidate closure deps: {len(deps)}")
for d in deps:
    print(f"  {d}")