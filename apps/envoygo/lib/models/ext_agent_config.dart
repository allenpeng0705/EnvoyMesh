/// External Agent Bridge presets and helpers (mirrors Social `ext-agent-defaults.ts`).

const customExtAgentNewId = '__new_custom__';

class ExtAgentPreset {
  final String id;
  final String name;
  final String adapter;
  final String url;
  final int port;
  final bool enabledByDefault;

  const ExtAgentPreset({
    required this.id,
    required this.name,
    required this.adapter,
    required this.url,
    required this.port,
    required this.enabledByDefault,
  });
}

const extAgentPresets = <ExtAgentPreset>[
  ExtAgentPreset(
    id: 'homeclaw',
    name: 'HomeClaw',
    adapter: 'envoymesh-message',
    url: 'http://127.0.0.1:8010/message',
    port: 8010,
    enabledByDefault: true,
  ),
  ExtAgentPreset(
    id: 'hermes',
    name: 'Hermes',
    adapter: 'envoymesh-message',
    url: 'http://127.0.0.1:8020/message',
    port: 8020,
    enabledByDefault: true,
  ),
  ExtAgentPreset(
    id: 'openhuman',
    name: 'OpenHuman',
    adapter: 'envoymesh-message',
    url: 'http://127.0.0.1:8021/message',
    port: 8021,
    enabledByDefault: false,
  ),
];

ExtAgentPreset? getExtAgentPreset(String? id) {
  if (id == null || id.isEmpty) return null;
  for (final p in extAgentPresets) {
    if (p.id == id) return p;
  }
  return null;
}

bool isBundledExtAgentId(String? id) => getExtAgentPreset(id) != null;

bool isCustomExtAgentSelection(String? id) {
  if (id == null || id.isEmpty) return false;
  if (id == customExtAgentNewId) return true;
  return !isBundledExtAgentId(id);
}

String slugifyExtAgentId(String input) {
  final slug = input
      .trim()
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9-]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
  if (slug.length <= 48) return slug;
  return slug.substring(0, 48);
}

class ExtAgentRegistryEntry {
  final String id;
  final String name;
  final String adapter;
  final String url;
  final bool enabled;
  final String? reachability;

  const ExtAgentRegistryEntry({
    required this.id,
    required this.name,
    required this.adapter,
    required this.url,
    required this.enabled,
    this.reachability,
  });

  factory ExtAgentRegistryEntry.fromJson(Map<String, dynamic> json) {
    return ExtAgentRegistryEntry(
      id: json['id'] as String? ?? '',
      name: json['name'] as String? ?? '',
      adapter: json['adapter'] as String? ?? 'envoymesh-message',
      url: json['url'] as String? ?? '',
      enabled: json['enabled'] as bool? ?? true,
      reachability: json['reachability'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'adapter': adapter,
        'url': url,
        'enabled': enabled,
      };

  ExtAgentRegistryEntry copyWith({
    String? name,
    String? url,
    String? adapter,
    bool? enabled,
  }) {
    return ExtAgentRegistryEntry(
      id: id,
      name: name ?? this.name,
      adapter: adapter ?? this.adapter,
      url: url ?? this.url,
      enabled: enabled ?? this.enabled,
      reachability: reachability,
    );
  }
}

class BridgeConfigView {
  final bool enabled;
  final int listenPort;
  final String? activeExtAgent;
  final String? activeExtAgentId;
  final List<ExtAgentRegistryEntry> extAgents;
  final String agentUrl;
  final String agentName;
  final String? adapter;

  const BridgeConfigView({
    required this.enabled,
    required this.listenPort,
    required this.extAgents,
    required this.agentUrl,
    required this.agentName,
    this.activeExtAgent,
    this.activeExtAgentId,
    this.adapter,
  });

  factory BridgeConfigView.fromJson(Map<String, dynamic>? json) {
    if (json == null) {
      return const BridgeConfigView(
        enabled: false,
        listenPort: 3031,
        extAgents: [],
        agentUrl: '',
        agentName: '',
      );
    }
    final rawAgents = json['extAgents'];
    final agents = rawAgents is List
        ? rawAgents
            .whereType<Map>()
            .map((e) => ExtAgentRegistryEntry.fromJson(
                  Map<String, dynamic>.from(e),
                ))
            .toList()
        : <ExtAgentRegistryEntry>[];
    return BridgeConfigView(
      enabled: json['enabled'] as bool? ?? false,
      listenPort: json['listenPort'] as int? ?? 3031,
      activeExtAgent: json['activeExtAgent'] as String?,
      activeExtAgentId: json['activeExtAgentId'] as String?,
      extAgents: agents,
      agentUrl: json['agentUrl'] as String? ?? '',
      agentName: json['agentName'] as String? ?? '',
      adapter: json['adapter'] as String?,
    );
  }

  String get activeId =>
      activeExtAgentId ?? activeExtAgent ?? extAgentPresets.first.id;
}

class ExtAgentEditOption {
  final String id;
  final String name;
  final String kind;

  const ExtAgentEditOption({
    required this.id,
    required this.name,
    required this.kind,
  });
}

List<ExtAgentEditOption> listEditAgentSelectOptions(
  List<ExtAgentRegistryEntry> registry,
) {
  final bundled = extAgentPresets.map((preset) {
    final existing = registry.where((e) => e.id == preset.id).firstOrNull;
    return ExtAgentEditOption(
      id: preset.id,
      name: existing?.name ?? preset.name,
      kind: 'bundled',
    );
  }).toList();

  final custom = registry
      .where((e) => !isBundledExtAgentId(e.id))
      .map((e) => ExtAgentEditOption(id: e.id, name: e.name, kind: 'custom'))
      .toList();

  return [...bundled, ...custom];
}

BridgeConfigView applyPresetToDraft(BridgeConfigView draft, String agentId) {
  final preset = getExtAgentPreset(agentId);
  if (preset == null) return draft;

  final registry = List<ExtAgentRegistryEntry>.from(draft.extAgents);
  final existingIdx = registry.indexWhere((e) => e.id == agentId);
  final nextEntry = ExtAgentRegistryEntry(
    id: preset.id,
    name: preset.name,
    adapter: preset.adapter,
    url: preset.url,
    enabled: existingIdx >= 0
        ? registry[existingIdx].enabled
        : preset.enabledByDefault,
  );
  if (existingIdx >= 0) {
    registry[existingIdx] = nextEntry;
  } else {
    registry.add(nextEntry);
  }

  return BridgeConfigView(
    enabled: draft.enabled,
    listenPort: draft.listenPort,
    extAgents: registry,
    agentUrl: preset.url,
    agentName: preset.name,
    activeExtAgent: agentId,
    activeExtAgentId: agentId,
    adapter: preset.adapter,
  );
}

BridgeConfigView applyCustomAgentSelect(
  BridgeConfigView draft,
  String agentId,
) {
  if (agentId == customExtAgentNewId) {
    return BridgeConfigView(
      enabled: draft.enabled,
      listenPort: draft.listenPort,
      extAgents: draft.extAgents,
      agentUrl: '',
      agentName: '',
      activeExtAgent: customExtAgentNewId,
      activeExtAgentId: customExtAgentNewId,
      adapter: 'envoymesh-message',
    );
  }

  final entry = draft.extAgents.where((e) => e.id == agentId).firstOrNull;
  if (entry == null) {
    return BridgeConfigView(
      enabled: draft.enabled,
      listenPort: draft.listenPort,
      extAgents: draft.extAgents,
      agentUrl: draft.agentUrl,
      agentName: draft.agentName,
      activeExtAgent: agentId,
      activeExtAgentId: agentId,
      adapter: draft.adapter,
    );
  }

  return BridgeConfigView(
    enabled: draft.enabled,
    listenPort: draft.listenPort,
    extAgents: draft.extAgents,
    agentUrl: entry.url,
    agentName: entry.name,
    activeExtAgent: agentId,
    activeExtAgentId: agentId,
    adapter: entry.adapter,
  );
}

BridgeConfigView finalizeExtAgentDraft({
  required BridgeConfigView draft,
  required String customAgentIdInput,
  required String name,
  required String url,
}) {
  final activeSaveId = draft.activeId;
  final isNewCustom = activeSaveId == customExtAgentNewId;
  final isExistingCustom =
      isCustomExtAgentSelection(activeSaveId) && !isNewCustom;

  if (isNewCustom || isExistingCustom) {
    final id = isNewCustom
        ? slugifyExtAgentId(customAgentIdInput.isNotEmpty
            ? customAgentIdInput
            : name)
        : activeSaveId;
    final entry = ExtAgentRegistryEntry(
      id: id,
      name: name.trim().isNotEmpty ? name.trim() : id,
      url: url.trim(),
      adapter: draft.adapter ?? 'envoymesh-message',
      enabled: true,
    );
    final registry = List<ExtAgentRegistryEntry>.from(draft.extAgents);
    final idx = registry.indexWhere((e) => e.id == id);
    if (idx >= 0) {
      registry[idx] = entry;
    } else {
      registry.add(entry);
    }
    return BridgeConfigView(
      enabled: draft.enabled,
      listenPort: draft.listenPort,
      extAgents: registry,
      agentUrl: entry.url,
      agentName: entry.name,
      activeExtAgent: id,
      activeExtAgentId: id,
      adapter: entry.adapter,
    );
  }

  if (isBundledExtAgentId(activeSaveId)) {
    final withPreset = applyPresetToDraft(draft, activeSaveId);
    final registry = withPreset.extAgents.map((entry) {
      if (entry.id != activeSaveId) return entry;
      return entry.copyWith(
        name: name.trim().isNotEmpty ? name.trim() : entry.name,
        url: url.trim().isNotEmpty ? url.trim() : entry.url,
      );
    }).toList();
    return BridgeConfigView(
      enabled: withPreset.enabled,
      listenPort: withPreset.listenPort,
      extAgents: registry,
      agentUrl: url.trim().isNotEmpty ? url.trim() : withPreset.agentUrl,
      agentName: name.trim().isNotEmpty ? name.trim() : withPreset.agentName,
      activeExtAgent: activeSaveId,
      activeExtAgentId: activeSaveId,
      adapter: withPreset.adapter,
    );
  }

  return draft;
}

Map<String, dynamic> bridgeConfigToUpdateParams(BridgeConfigView config) {
  return {
    'activeExtAgent': config.activeExtAgentId ?? config.activeExtAgent,
    'extAgents': config.extAgents.map((e) => e.toJson()).toList(),
    'agentUrl': config.agentUrl,
    'agentName': config.agentName,
    'listenPort': config.listenPort,
  };
}
