"""Add home:config-updated emit + bidirectional sync listener on mobile.

1. Home node (apps/node/src/node-service-impl.ts): after
   updateNodeConfig, emit `home:config-updated` with the new config
   so subscribed clients can re-render.

2. Mobile: the settings screens subscribe to the event in initState
   and call _load() on receipt. This makes the screens reactive to
   changes from any source (Social UI, another mobile device, etc.).
"""
from pathlib import Path

# 1. Home node: emit after save.
nsi = Path("apps/node/src/node-service-impl.ts")
c = nsi.read_text()
old = """  async updateNodeConfig(config: Partial<NodeConfig>): Promise<void> {
    return updateNodeConfigViaRuntime(this._nodeConfigContext(), config);
  }"""
new = """  async updateNodeConfig(config: Partial<NodeConfig>): Promise<void> {
    await updateNodeConfigViaRuntime(this._nodeConfigContext(), config);
    // Bidirectional sync: notify subscribers (mobile, Social UI,
    // another EnvoyGo device) that the node config changed so they
    // can re-render.
    this.emit("home:config-updated", {
      config: (await this._configStore.load())!,
    });
  }"""
if old not in c:
    print("updateNodeConfig not found")
    raise SystemExit(1)
c = c.replace(old, new, 1)
nsi.write_text(c)
print("home-node: home:config-updated emit added")

# 2. Mobile: register a listener in the AI Model screen + AI Engine
# screen. They subscribe in initState and unsubscribe in dispose.

# AI Model screen: add the listener.
am = Path("apps/envoygo/lib/screens/settings/ai_model_settings_screen.dart")
c = am.read_text()
# Insert the listener setup right after _loaded = true; in
# initState, before _loadCurrent().
if "home:config-updated" in c:
    print("AI Model screen already listens")
else:
    # Add the listener in initState: subscribe after _endpointCtl etc.
    old_init = """    _endpointCtl = TextEditingController();
    _modelNameCtl = TextEditingController();
    _apiKeyCtl = TextEditingController();
    _loadCurrent();
  }"""
    new_init = """    _endpointCtl = TextEditingController();
    _modelNameCtl = TextEditingController();
    _apiKeyCtl = TextEditingController();
    // Bidirectional sync: re-load when the home node's config changes
    // (e.g. via the Social UI or another mobile device).
    nodeServiceProvider
        .whenValueAvailable()
        .then((c) => c?.on("home:config-updated", (_) {
              if (mounted) _loadCurrent();
            }));
    _loadCurrent();
  }"""
    if old_init not in c:
        print("AI Model initState anchor not found")
        raise SystemExit(1)
    c = c.replace(old_init, new_init, 1)
    am.write_text(c)
    print("AI Model screen: config-updated listener added")

# AI Engine screen: same pattern.
ae = Path("apps/envoygo/lib/screens/settings/ai_engine_settings_screen.dart")
c = ae.read_text()
if "home:config-updated" in c:
    print("AI Engine screen already listens")
else:
    old_init = """  @override
  void initState() {
    super.initState();
    _load();
  }"""
    new_init = """  @override
  void initState() {
    super.initState();
    // Bidirectional sync: re-load when the home node's config changes
    // (e.g. via the Social UI or another mobile device).
    nodeServiceProvider
        .whenValueAvailable()
        .then((c) => c?.on("home:config-updated", (_) {
              if (mounted) _load();
            }));
    _load();
  }"""
    if old_init not in c:
        print("AI Engine initState anchor not found")
        raise SystemExit(1)
    c = c.replace(old_init, new_init, 1)
    ae.write_text(c)
    print("AI Engine screen: config-updated listener added")

print("\nAll changes applied.")