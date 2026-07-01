"""Fix the replyWithEnvelope cast."""
from pathlib import Path
p = Path("apps/node/src/index.ts")
c = p.read_text()
old = "      { envelope, remotePeerId, replyWithEnvelope },\n    );\n    return;\n  }"
new = "      { envelope, remotePeerId, replyWithEnvelope: replyWithEnvelope as any },\n    );\n    return;\n  }"
if old not in c:
    raise SystemExit("NOT FOUND")
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")