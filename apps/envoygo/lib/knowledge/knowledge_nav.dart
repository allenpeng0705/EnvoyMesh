// Deep-link Content → Knowledge (Browse / Plugins / Setup), mirrors Social
// `openContentKnowledge`.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/chat_provider.dart';
import '../providers/content_engage_provider.dart';

enum KnowledgeHubPanel { browse, plugins, setup }

/// Requested Knowledge sub-tab; consumed once by [KnowledgeScreen].
final knowledgeHubPanelRequestProvider =
    StateProvider<KnowledgeHubPanel?>((ref) => null);

/// Requested Content surface index (0 Feed, 1 Blog, 2 Knowledge, 3 People).
final contentSurfaceRequestProvider = StateProvider<int?>((ref) => null);

/// Jump to Content → Knowledge (optional panel). Owner home tabs only.
void openContentKnowledge(
  WidgetRef ref, {
  KnowledgeHubPanel panel = KnowledgeHubPanel.browse,
}) {
  ref.read(chatProvider.notifier).selectTab(2);
  ref.read(contentEngageProvider.notifier).dismiss(surface: 'all');
  ref.read(contentSurfaceRequestProvider.notifier).state = 2;
  ref.read(knowledgeHubPanelRequestProvider.notifier).state = panel;
  ref.read(contentSurfaceProvider.notifier).state = 2;
}
