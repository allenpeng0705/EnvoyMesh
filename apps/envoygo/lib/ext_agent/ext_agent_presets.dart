/// Ext Agent presets + install/docs metadata for EnvoyGo.
///
/// Mirrors `packages/api/src/ext-agent.ts` (`DEFAULT_EXT_AGENTS`,
/// `getExtAgentInstallInfo`). Keep in sync when presets change.
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

const defaultExtAgents = <ExtAgentPreset>[
  ExtAgentPreset(
    id: 'pi',
    name: 'Pi',
    adapter: 'envoymesh-message',
    url: 'http://127.0.0.1:8022/message',
    enabled: true,
  ),
  ExtAgentPreset(
    id: 'homeclaw',
    name: 'HomeClaw',
    adapter: 'envoymesh-message',
    url: 'http://127.0.0.1:8010/message',
    enabled: true,
  ),
  ExtAgentPreset(
    id: 'hermes',
    name: 'Hermes',
    adapter: 'envoymesh-message',
    url: 'http://127.0.0.1:8020/message',
    enabled: true,
  ),
  ExtAgentPreset(
    id: 'openhuman',
    name: 'OpenHuman',
    adapter: 'envoymesh-message',
    url: 'http://127.0.0.1:8021/message',
    enabled: false,
  ),
];

String defaultExtAgentStartHint(String agentId) {
  switch (agentId) {
    case 'homeclaw':
      return 'Start HomeClaw, then confirm http://127.0.0.1:8010/status responds.';
    case 'hermes':
      return 'Run `hermes gateway run` with API_SERVER_ENABLED=true (API on :8642).';
    case 'openhuman':
      return 'Start OpenHuman.app or the OpenHuman CLI core (health on :7788).';
    case 'pi':
      return 'Pi is built into the home node — no separate process needed.';
    default:
      return 'Start the external agent process, then confirm its HTTP endpoint is reachable.';
  }
}

ExtAgentInstallInfo getExtAgentInstallInfo(String agentId) {
  final id = agentId.trim().isEmpty ? 'pi' : agentId.trim();
  switch (id) {
    case 'pi':
      return ExtAgentInstallInfo(
        agentId: id,
        homepageUrl: 'https://github.com/earendil-works/pi',
        homepageLabel: 'Pi on GitHub',
        startHint: defaultExtAgentStartHint(id),
        builtIn: true,
      );
    case 'homeclaw':
      return ExtAgentInstallInfo(
        agentId: id,
        homepageUrl: 'https://www.homeclaw.cn/',
        homepageLabel: 'HomeClaw website',
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      );
    case 'hermes':
      return ExtAgentInstallInfo(
        agentId: id,
        homepageUrl: 'https://hermes-agent.nousresearch.com/docs/',
        homepageLabel: 'Hermes docs',
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      );
    case 'openhuman':
      return ExtAgentInstallInfo(
        agentId: id,
        homepageUrl: 'https://tinyhumans.ai/openhuman',
        homepageLabel: 'OpenHuman website',
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      );
    default:
      return ExtAgentInstallInfo(
        agentId: id,
        homepageLabel: 'Docs',
        startHint: defaultExtAgentStartHint(id),
        builtIn: false,
      );
  }
}

/// Merge home-configured agents with built-in presets (preset wins on missing fields).
List<Map<String, dynamic>> mergeExtAgentPresets(List<dynamic>? configured) {
  final byId = <String, Map<String, dynamic>>{
    for (final agent in defaultExtAgents)
      agent.id: Map<String, dynamic>.from(agent.toJson()),
  };
  for (final raw in configured ?? const []) {
    if (raw is! Map) continue;
    final id = raw['id']?.toString().trim();
    if (id == null || id.isEmpty) continue;
    final preset = byId[id];
    final incoming = Map<String, dynamic>.from(raw);
    if (preset == null) {
      byId[id] = {...incoming, 'id': id};
      continue;
    }
    final merged = {...preset, ...incoming, 'id': id};
    if (merged['name'] == 'Pi (built-in)') merged['name'] = preset['name'];
    byId[id] = merged;
  }
  return byId.values.toList();
}
