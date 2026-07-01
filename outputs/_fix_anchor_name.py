"""Fix the test by renaming anchor-1 to avoid OXC parser confusion."""
from pathlib import Path
p = Path("apps/node/test/cli-mesh-inbound-official-credential.test.ts")
c = p.read_text()
c = c.replace('anchor-1', 'anchorOne')
c = c.replace('anchor-1:', 'anchorOne:')
c = c.replace('"key-pem"', '"anchorOneKey"')
p.write_text(c)
print("OK")