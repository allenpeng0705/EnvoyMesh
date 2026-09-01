// Deep-link Knowledge (Browse / Plugins / Setup) and Social surfaces.
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../navigation/owner_tabs.dart';
import '../providers/chat_provider.dart';
import '../providers/content_engage_provider.dart';

enum KnowledgeHubPanel { browse, plugins, setup }

/// Requested Knowledge sub-tab; consumed once by [KnowledgeScreen].
final knowledgeHubPanelRequestProvider =
    StateProvider<KnowledgeHubPanel?>((ref) => null);

/// Requested Social surface index
/// (0 Chats, 1 Feeds, 2 Blog, 3 Market, 4 Discover, 5 Explore).
final contentSurfaceRequestProvider = StateProvider<int?>((ref) => null);

/// Contact peer filter for Social → Feed / Blog card tabs (from Chat shortcuts).
final socialContentPeerOwnerIdProvider = StateProvider<String?>((ref) => null);

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
  openSocialContent(
    ref,
    surface: SocialSurfaces.explore,
    peerOwnerId: null,
  );
}

/// Jump to Social → Discover (people search / Say Hello).
void openSocialDiscover(WidgetRef ref) {
  openSocialContent(
    ref,
    surface: SocialSurfaces.discover,
    peerOwnerId: null,
  );
}

/// Jump to Social → Market (Browse by default, or My Shop).
void openSocialMarket(WidgetRef ref, {bool myShop = false}) {
  openSocialContent(
    ref,
    surface: SocialSurfaces.market,
    peerOwnerId: null,
  );
  if (myShop) {
    ref.read(marketPreferShopProvider.notifier).state = true;
  }
}

/// When true, next Market tab open prefers My Shop (consumed once).
final marketPreferShopProvider = StateProvider<bool>((ref) => false);

/// Jump to Social → Feed / Blog / Explore. Optional [peerOwnerId] filters card tabs.
void openSocialContent(
  WidgetRef ref, {
  required int surface,
  String? peerOwnerId,
}) {
  final id = peerOwnerId?.trim();
  ref.read(chatProvider.notifier).selectTab(OwnerTabs.social);
  ref.read(socialContentPeerOwnerIdProvider.notifier).state =
      (id != null && id.isNotEmpty) ? id : null;
  ref.read(contentSurfaceRequestProvider.notifier).state = surface;
  ref.read(contentSurfaceProvider.notifier).state = surface;
}

/// Same as [openSocialContent] for callers that only have a [ProviderContainer]
/// (e.g. modal sheets).
void openSocialContentOn(
  ProviderContainer container, {
  required int surface,
  String? peerOwnerId,
}) {
  final id = peerOwnerId?.trim();
  container.read(chatProvider.notifier).selectTab(OwnerTabs.social);
  container.read(socialContentPeerOwnerIdProvider.notifier).state =
      (id != null && id.isNotEmpty) ? id : null;
  container.read(contentSurfaceRequestProvider.notifier).state = surface;
  container.read(contentSurfaceProvider.notifier).state = surface;
}
