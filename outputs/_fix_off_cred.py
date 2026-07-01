"""Fix the truncated test file by appending the missing closing."""
from pathlib import Path
p = Path("apps/node/test/cli-mesh-inbound-official-credential.test.ts")
c = p.read_text()
if c.endswith("});"):
    print("already complete")
    raise SystemExit(0)
if not c.endswith("' },\n"):
    raise SystemExit("unexpected ending")
c = c.rstrip() + "  ),\n});\n"
p.write_text(c)
print("OK")