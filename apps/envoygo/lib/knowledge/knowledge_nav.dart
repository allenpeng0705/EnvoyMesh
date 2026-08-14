// Deep-link Knowledge (Browse / Plugins / Setup) and Social → Explore.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../navigation/owner_tabs.dart';
import '../providers/chat_provider.dart';
import '../providers/content_engage_provider.dart';

enum KnowledgeHubPanel { browse, plugins, setup }

/// Requested Knowledge sub-tab; consumed once by [KnowledgeScreen].
final knowledgeHubPanelRequestProvider =
    StateProvider<KnowledgeHubPanel?>((ref) => null);

/// Requested Social surface index (0 Chats, 1 Feeds, 2 Blog, 3 Explore).
final contentSurfaceRequestProvider = StateProvider<int?>((ref) => null);

/// Jump to Knowledge tab (optional panel). Owner home tabs only.
void openContentKnowledge(
  WidgetRef ref, {
  KnowledgeHubPanel panel = KnowledgeHubPanel.browse,
}) {
  ref.read(chatProvider.notifier).selectTab(OwnerTabs.knowledge);
  ref.read(knowledgeHubPanelRequestProvider.notifier).state = panel;
}

/// Jump to Social → Explore (Browser).
void openSocialExplore(WidgetRef ref) {
  ref.read(chatProvider.notifier).selectTab(OwnerTabs.social);
  ref.read(contentSurfaceRequestProvider.notifier).state = SocialSurfaces.explore;
  ref.read(contentSurfaceProvider.notifier).state = SocialSurfaces.explore;
}
