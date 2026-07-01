"""Test the audit against the pre-fix task.feedback runtime."""
import re
from pathlib import Path

text = Path('/tmp/pre-fix-tf.ts').read_text()
print("PRE-FIX RUNTIME CALL:")
for m in re.finditer(r'ctx\.([a-zA-Z]+)\s*\(([^()]*(?:\([^)]*\)[^()]*)*)\)', text, re.DOTALL):
    helper = m.group(1)
    body = m.group(2)
    brace = body.find('{')
    if brace < 0: continue
    depth = 0; body_end = None
    for i in range(brace, len(body)):
        if body[i] == '{': depth += 1
        elif body[i] == '}':
            if depth == 0: body_end = i; break
            depth -= 1
    if body_end is None: continue
    inner = body[brace+1:body_end]
    items = re.split(r'[,;\n]+', inner)
    names = []
    for item in items:
        item = item.strip()
        if not item: continue
        m2 = re.match(r'([a-zA-Z_$][a-zA-Z0-9_$]*)', item)
        if m2: names.append(m2.group(1))
    print(f"  ctx.{helper}({names})")