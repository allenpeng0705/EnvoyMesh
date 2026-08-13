// Extensible Knowledge plugin contract (mirrors Social KnowledgePluginsPanel).
//
// First-party cards (Obsidian, Notion/MCP) are registered by id. Unknown plugins
// from `listKbPlugins` render via [KnowledgePluginRegistry.genericBuilder].

import 'package:flutter/widgets.dart';

import '../services/node_service_client.dart';

typedef KnowledgeBasePatch = Map<String, dynamic>;

class KnowledgePluginInfo {
  final String pluginId;
  final String? title;
  final String status; // active | disabled | error | registered
  final String? errorMessage;
  final Map<String, dynamic> raw;

  const KnowledgePluginInfo({
    required this.pluginId,
    this.title,
    required this.status,
    this.errorMessage,
    this.raw = const {},
  });

  factory KnowledgePluginInfo.fromJson(Map<String, dynamic> json) {
    return KnowledgePluginInfo(
      pluginId: (json['pluginId'] as String?) ?? '',
      title: json['title'] as String?,
      status: (json['status'] as String?) ?? 'registered',
      errorMessage: json['errorMessage'] as String?,
      raw: json,
    );
  }

  bool get isActive => status == 'active';
}

/// Actions shared by all Knowledge plugin cards.
class KnowledgePluginActions {
  final NodeServiceClient client;
  final Future<void> Function() reloadPlugins;
  final Future<void> Function(KnowledgeBasePatch patch) patchKnowledgeBase;
  final void Function(String message, {bool error}) notify;

  const KnowledgePluginActions({
    required this.client,
    required this.reloadPlugins,
    required this.patchKnowledgeBase,
    required this.notify,
  });

  Future<void> activate(String pluginId) async {
    final result = await client.activateKbPlugin(pluginId: pluginId);
    if (result['ok'] == false) {
      notify(
        'Activate failed${result['reason'] != null ? ': ${result['reason']}' : ''}',
        error: true,
      );
    }
    await reloadPlugins();
  }

  Future<void> deactivate(String pluginId) async {
    final result = await client.deactivateKbPlugin(pluginId: pluginId);
    if (result['ok'] == false) {
      notify(
        'Deactivate failed${result['reason'] != null ? ': ${result['reason']}' : ''}',
        error: true,
      );
    }
    await reloadPlugins();
  }

  /// Social uses activate again as “Sync now”.
  Future<void> sync(String pluginId) async {
    await activate(pluginId);
  }
}

typedef KnowledgePluginCardBuilder = Widget Function({
  required BuildContext context,
  required KnowledgePluginInfo? info,
  required KnowledgePluginActions actions,
  required KnowledgeBasePatch knowledgeBase,
  required bool busy,
});

class KnowledgePluginRegistry {
  KnowledgePluginRegistry();

  final Map<String, KnowledgePluginCardBuilder> _builders = {};
  KnowledgePluginCardBuilder? genericBuilder;

  void register(String pluginId, KnowledgePluginCardBuilder builder) {
    _builders[pluginId] = builder;
  }

  void unregister(String pluginId) {
    _builders.remove(pluginId);
  }

  void clear() {
    _builders.clear();
    genericBuilder = null;
  }

  KnowledgePluginCardBuilder? builderFor(String pluginId) => _builders[pluginId];

  Iterable<String> get registeredIds => _builders.keys;
}

/// Default singleton used by Knowledge → Plugins.
final knowledgePluginRegistry = KnowledgePluginRegistry();
