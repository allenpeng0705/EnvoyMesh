/// Ext Agent presets for EnvoyGo.
///
/// **Home node is the source of truth.** All Ext Agent presets come
/// from the home node via `getBridgeStatus().extAgents` and the wire
/// protocol — EnvoyGo does NOT maintain a parallel list. This file
/// only contains the **empty default** used when the home node has
/// never been connected (i.e. brand-new install, before first sync).
///
/// Sync timing — there are exactly 4 sync points, all in
/// `ext_agent_switcher.dart` and `ai_engine_settings_screen.dart`:
///
/// 1. **App start** — `initState()` calls `_reload()` / `_load()`,
///    which fetches `getBridgeStatus()` and renders immediately.
/// 2. **Wire event `bridge:status`** — home pushes whenever its
///    bridge state changes (agent reachability, port, etc.).
/// 3. **Wire event `home:config-updated`** — home pushes when its
///    own config changes (toggle bridgeEnabled, add agent, etc.).
/// 4. **Bridge reconnect** — when `nodeServiceProvider` swaps to a
///    new client (user lost connection and came back), the listener
///    re-registers AND immediately calls `_reload()` / `_load()`.
///    This is the case where the user opens the app on a different
///    network or comes back from offline: they must see the latest
///    home-side agent list without having to pull-to-refresh.
///
/// Adding a new Ext Agent in `packages/api/src/ext-agent.ts` is therefore
/// sufficient — no Dart-side update is required. The next sync point
/// (any of the four above) will pick it up.
///
/// Why this file still exists: the `ExtAgentPreset` model + merge
/// function are kept here so the Flutter widget tree has a stable
/// shape to render against even before the first sync arrives.
library;

class ExtAgentPreset {
  final String id;
  final String name;
  final String adapter;
  final String url;
  final bool enabled;

  const ExtAgentPreset({
    required this.id,
    required this.name,
    required this.adapter,
    required this.url,
    required this.enabled,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'adapter': adapter,
        'url': url,
        'enabled': enabled,
      };

  factory ExtAgentPreset.fromJson(Map<String, dynamic> json) {
    return ExtAgentPreset(
      id: (json['id'] as String?)?.trim() ?? '',
      name: (json['name'] as String?)?.trim() ?? '',
      adapter: (json['adapter'] as String?)?.trim() ?? 'envoymesh-message',
      url: (json['url'] as String?)?.trim() ?? '',
      enabled: json['enabled'] == true,
    );
  }
}

class ExtAgentInstallInfo {
  final String agentId;
  final String? homepageUrl;
  final String homepageLabel;
  final String startHint;
  final bool builtIn;

  const ExtAgentInstallInfo({
    required this.agentId,
    required this.homepageLabel,
    required this.startHint,
    required this.builtIn,
    this.homepageUrl,
  });
}

/// Empty default — home node's `getBridgeStatus()` is the source of truth.
///
/// Kept as a `const <ExtAgentPreset>[]` for shape compatibility with
/// `mergeExtAgentPresets(null)` (which now returns just the home-pushed
/// list verbatim). Adding a preset here would re-introduce the
/// "Dart defaults shown when home has no agents" bug — see commit
/// history for context.
const defaultExtAgents = <ExtAgentPreset>[];

/// Generic "connect to home" hint — install docs live on the home
/// node (see `packages/api/src/ext-agent.ts:INSTALL_TABLE`). EnvoyGo
/// never owns install instructions; it just surfaces the home's
/// reachability status and lets the user click through.
String defaultExtAgentStartHint(String agentId) {
  // Intentionally unrecognised — the home node has the real install
  // instructions. EnvoyGo always defers to home for these.
  return 'Connect to the home node for install instructions.';
}

/// Generic install-info fallback — real install commands come from the
/// home node (`packages/api/src/ext-agent.ts:INSTALL_TABLE`). EnvoyGo
/// renders the home's response verbatim when the bridge is connected.
ExtAgentInstallInfo getExtAgentInstallInfo(String agentId) {
  return ExtAgentInstallInfo(
    agentId: agentId,
    homepageLabel: 'Connect to home for install instructions',
    startHint: defaultExtAgentStartHint(agentId),
    builtIn: false,
  );
}

/// Merge home-configured agents with built-in presets.
///
/// **The `defaultExtAgents` list is intentionally empty** (see comment
/// above). With the home as source of truth, this function just
/// returns the home-pushed list verbatim — preset merging only applies
/// to unknown / custom agent ids (which still receive the generic
/// fallback from `getExtAgentInstallInfo`).
List<Map<String, dynamic>> mergeExtAgentPresets(List<dynamic>? configured) {
  final result = <String, Map<String, dynamic>>{};
  for (final raw in configured ?? const []) {
    if (raw is! Map) continue;
    final id = raw['id']?.toString().trim();
    if (id == null || id.isEmpty) continue;
    result[id] = Map<String, dynamic>.from(raw)..['id'] = id;
  }
  return result.values.toList();
}
