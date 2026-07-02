"""Cast PersistedNodeConfig to NodeConfig for the emit payload."""
from pathlib import Path
p = Path("apps/node/src/node-service-impl.ts")
c = p.read_text()
old = """    this.emit("home:config-updated", {
      config: (await this._configStore.load())!,
    });"""
new = """    this.emit("home:config-updated", {
      config: (await this._configStore.load())! as unknown as NodeConfig,
    });"""
if old not in c:
    print("anchor not found")
    raise SystemExit(1)
c = c.replace(old, new, 1)
p.write_text(c)
print("OK")