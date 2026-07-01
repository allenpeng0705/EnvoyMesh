"""Cast replyWithEnvelope."""
from pathlib import Path
p = Path("apps/node/src/index.ts")
c = p.read_text()
old = "{ envelope, remotePeerId, remoteAddr, receivedAt, correlationId, replyWithEnvelope },"
new = "{ envelope, remotePeerId, remoteAddr, receivedAt, correlationId, replyWithEnvelope: replyWithEnvelope as any },"
if old not in c:
    raise SystemExit("NOT FOUND")
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")