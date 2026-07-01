"""Debug find_runtime_calls."""
import re
text = open('outputs/pre-fix-tf.ts').read()
print(f"file size: {len(text)}")
print(f"contents:")
print(text)
print()
print("regex matches:")
matches = list(re.finditer(r'ctx\.([a-zA-Z][a-zA-Z0-9]*)\s*\(', text))
print(f"  count: {len(matches)}")
for m in matches:
    print(f"  match: {m.group(0)}")