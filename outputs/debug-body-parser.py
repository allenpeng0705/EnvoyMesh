"""Trace the body parser step by step."""
call_args = '{\n    envelope: params.envelope,\n  }'
print(f"length: {len(call_args)}")
brace = call_args.find("{")
print(f"brace: {brace}")

depth = 0
body_end = None
for i in range(brace, len(call_args)):
    ch = call_args[i]
    print(f"  i={i}: ch={ch!r}, depth={depth}")
    if ch == "{":
        depth += 1
    elif ch == "}":
        if depth == 0:
            print(f"    body_end={i}")
            body_end = i
            break
        depth -= 1

print(f"final body_end: {body_end}")