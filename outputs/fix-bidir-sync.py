"""Fix the broken bidirectional sync (Issue 1) and memory leak (Issue 2).

The previous code used `nodeServiceProvider.whenValueAvailable()`,
which is NOT a Riverpod method. This commit replaces it with
`ref.listenManual<NodeServiceClient?>` — a real Riverpod pattern
that:
  1. Fires immediately with the current client value (if any)
  2. Re-fires whenever the client becomes available / changes
  3. Lets us clean up on dispose (memory leak fix)

Pattern:
  - In initState: subscribe via ref.listenManual. When the client
    becomes available, attach the home:config-updated listener.
  - In dispose: close the provider subscription AND call the
    listener's unsubscribe function (which HomeRemoteClient.on()
    returns).
"""
from pathlib import Path

# === AI Model screen ===
am = Path("apps/envoygo/lib/screens/settings/ai_model_settings_screen.dart")
c = am.read_text()
if "ref.listenManual" in c:
    print("AI Model screen: already fixed")
else:
    # 1. Add 2 fields + listenManual in initState.
    # Add the field declarations after "_loaded = false;"
    old_fields = """  bool _saving = false;
  bool _loaded = false;

  @override
  void initState() {"""
    new_fields = """  bool _saving = false;
  bool _loaded = false;
  // Bidirectional sync — handles the subscription so we can tear it
  // down on dispose. The Riverpod Provider is a synchronous lookup
  // (no Future/Stream), so we use listenManual to react to client
  // changes (e.g. user pairs/disconnects while the screen is open).
  // ignore: unused_field
  ProviderSubscription<NodeServiceClient?>? _clientSub;
  // ignore: unused_field
  void Function()? _configUnsub;

  @override
  void initState() {"""
    if old_fields not in c:
        print("AI Model field anchor not found")
        raise SystemExit(1)
    c = c.replace(old_fields, new_fields, 1)

    # 2. Replace the broken `whenValueAvailable` with `listenManual`.
    old_init = """    _endpointCtl = TextEditingController();
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
    new_init = """    _endpointCtl = TextEditingController();
    _modelNameCtl = TextEditingController();
    _apiKeyCtl = TextEditingController();
    // Bidirectional sync: re-load when the home node's config changes
    // (e.g. via the Social UI or another mobile device). We use
    // ref.listenManual to react to client changes (not a Future),
    // and we tear down the listener in dispose() to avoid leaks.
    _clientSub = ref.listenManual<NodeServiceClient?>(
      nodeServiceProvider,
      (prev, next) {
        _configUnsub?.call();
        _configUnsub = null;
        if (next != null) {
          _configUnsub = next.on('home:config-updated', (_) {
            if (mounted) _loadCurrent();
          });
        }
      },
      fireImmediately: true,
    );
    _loadCurrent();
  }"""
    if old_init not in c:
        print("AI Model initState anchor not found")
        raise SystemExit(1)
    c = c.replace(old_init, new_init, 1)

    # 3. Update dispose() to clean up the listener.
    old_dispose = """  @override
  void dispose() {
    _endpointCtl.dispose();
    _modelNameCtl.dispose();
    _apiKeyCtl.dispose();
    super.dispose();
  }"""
    new_dispose = """  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    _endpointCtl.dispose();
    _modelNameCtl.dispose();
    _apiKeyCtl.dispose();
    super.dispose();
  }"""
    if old_dispose not in c:
        print("AI Model dispose anchor not found")
        raise SystemExit(1)
    c = c.replace(old_dispose, new_dispose, 1)
    am.write_text(c)
    print("AI Model screen: bidirectional sync fixed")

# === AI Engine screen ===
ae = Path("apps/envoygo/lib/screens/settings/ai_engine_settings_screen.dart")
c = ae.read_text()
if "ref.listenManual" in c:
    print("AI Engine screen: already fixed")
else:
    # 1. Add 2 fields after `_saving = false;`
    old_fields = """  bool _saving = false;

  @override
  void initState() {"""
    new_fields = """  bool _saving = false;
  // Bidirectional sync — see comment in ai_model_settings_screen.
  // ignore: unused_field
  ProviderSubscription<NodeServiceClient?>? _clientSub;
  // ignore: unused_field
  void Function()? _configUnsub;

  @override
  void initState() {"""
    if old_fields not in c:
        print("AI Engine field anchor not found")
        raise SystemExit(1)
    c = c.replace(old_fields, new_fields, 1)

    # 2. Replace the broken `whenValueAvailable` with `listenManual`.
    old_init = """  @override
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
    new_init = """  @override
  void initState() {
    super.initState();
    _clientSub = ref.listenManual<NodeServiceClient?>(
      nodeServiceProvider,
      (prev, next) {
        _configUnsub?.call();
        _configUnsub = null;
        if (next != null) {
          _configUnsub = next.on('home:config-updated', (_) {
            if (mounted) _load();
          });
        }
      },
      fireImmediately: true,
    );
    _load();
  }"""
    if old_init not in c:
        print("AI Engine initState anchor not found")
        raise SystemExit(1)
    c = c.replace(old_init, new_init, 1)

    # 3. Add dispose() if not present (check first).
    if "void dispose()" not in c:
        # Find the closing `super.dispose();` at the very end and insert
        # before it.
        # Simpler: append a new dispose before the final class close.
        # Find the last `super.dispose()` in the file.
        idx = c.rfind("super.dispose();")
        if idx < 0:
            print("AI Engine: no super.dispose found, adding one")
            c = c + """\n  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    super.dispose();
  }
"""
        else:
            # Insert a new dispose method before the last super.dispose.
            # Find the start of the method that contains the last
            # super.dispose.
            method_start = c.rfind("@override\n  void dispose()", 0, idx)
            if method_start < 0:
                # Add a new method just before the closing `}` of the
                # class (after the last super.dispose).
                # Simpler: append at end.
                c = c + """\n  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    super.dispose();
  }
"""
            else:
                # Replace the existing dispose with one that cleans up
                # the listener too.
                close = c.find("}", idx)
                c = (
                    c[:method_start]
                    + """  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    super.dispose();
  }
"""
                    + c[close + 1:]
                )
    else:
        # Update existing dispose to also tear down the listener.
        old_dispose = """  @override
  void dispose() {
    super.dispose();
  }"""
        new_dispose = """  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    super.dispose();
  }"""
        if old_dispose not in c:
            # The AI Engine screen has a different dispose — try to
            # find the actual one.
            import re
            m = re.search(r"  @override\n  void dispose\(\) \{[\s\S]*?super\.dispose\(\);\n  \}", c)
            if m:
                # Replace it.
                new = """  @override
  void dispose() {
    _configUnsub?.call();
    _configUnsub = null;
    _clientSub?.close();
    _clientSub = null;
    super.dispose();
  }"""
                c = c[:m.start()] + new + c[m.end():]
                print("AI Engine: replaced existing dispose()")
            else:
                print("AI Engine: dispose() not found")
                raise SystemExit(1)
        else:
            c = c.replace(old_dispose, new_dispose, 1)
            print("AI Engine: updated existing dispose()")
    ae.write_text(c)
    print("AI Engine screen: bidirectional sync fixed")

print("\nAll fixes applied.")