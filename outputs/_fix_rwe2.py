"""Cast replyWithEnvelope."""
from pathlib import Path
p = Path("apps/node/src/index.ts")
c = p.read_text()
old = "profileDir: args.profileDir, replyWithEnvelope"
new = "profileDir: args.profileDir, replyWithEnvelope: replyWithEnvelope as any"
if old not in c:
    raise SystemExit("NOT FOUND")
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")