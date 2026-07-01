"""Cast src to any in the patch."""
from pathlib import Path
p = Path("apps/node/src/index.ts")
c = p.read_text()
old = "        upsertManyDiscoverySeeds: (addrs: string[], src: string) =>\n          discoverySeedStore.upsertMany(addrs, src),"
new = "        upsertManyDiscoverySeeds: (addrs: string[], src: string) =>\n          discoverySeedStore.upsertMany(addrs, src as any),"
if old not in c:
    raise SystemExit("NOT FOUND")
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")