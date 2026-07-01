"""Run the EXACT find_runtime_calls code inline on the pre-fix file."""
import re
from pathlib import Path

runtime_path = Path('outputs/pre-fix-tf.ts')


def find_runtime_calls(runtime_path):
    text = runtime_path.read_text()
    print(f"Text length: {len(text)}")
    calls = []
    for m in re.finditer(r"ctx\.([a-zA-Z][a-zA-Z0-9]*)\s*\(", text):
        helper = m.group(1)
        print(f"  regex matched helper={helper} at pos {m.start()}-{m.end()}")
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
            print(f"    args_end is None, skipping")
            continue
        call_args = text[m.end():args_end]
        print(f"    call_args: {call_args!r}")
        brace = call_args.find("{")
        if brace < 0:
            print(f"    no brace, skipping")
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
            print(f"    body_end is None, skipping")
            continue
        body = call_args[brace+1:body_end]
        print(f"    body: {body!r}")
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
        print(f"    found call: {helper}({names})")
    return calls


result = find_runtime_calls(runtime_path)
print(f"\nFINAL: {result}")