import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../knowledge/knowledge_nav.dart';
import '../../l10n/app_localizations.dart';
import '../../models/web_content.dart';
import '../../navigation/owner_tabs.dart';
import '../../services/envoy_url.dart';
import '../browser/browser_screen.dart';

/// Bottom sheet: Profile / Feed / Blog / Photo (+ custom sections when listing own site).
/// Feed + Blog open Social card tabs; Profile + Photo open Browser.
Future<void> showPublishedContentSheet(
  BuildContext context, {
  required String ownerId,
  String? displayName,
  List<WebContentSectionSummary>? sections,
}) {
  final name = (displayName != null && displayName.trim().isNotEmpty)
      ? displayName.trim()
      : ownerId;
  return showModalBottomSheet<void>(
    context: context,
    showDragHandle: true,
    builder: (ctx) {
      final l10n = AppLocalizations.of(ctx);
      final container = ProviderScope.containerOf(ctx, listen: false);
      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Text(
                l10n.publishedTitle(name),
                style: Theme.of(ctx).textTheme.titleMedium,
              ),
            ),
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(l10n.peopleProfile),
              onTap: () {
                Navigator.pop(ctx);
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => BrowserScreen(
                      initialUrl:
                          webContentUrl(ownerId, WebContentSurface.profile),
                    ),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.dynamic_feed_outlined),
              title: Text(l10n.publishedFeed),
              onTap: () {
                Navigator.pop(ctx);
                // Pop chat detail so Home Social tabs are visible.
                Navigator.of(context).popUntil((route) => route.isFirst);
                openSocialContentOn(
                  container,
                  surface: SocialSurfaces.feeds,
                  peerOwnerId: ownerId,
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.article_outlined),
              title: Text(l10n.peopleBlog),
              onTap: () {
                Navigator.pop(ctx);
                Navigator.of(context).popUntil((route) => route.isFirst);
                openSocialContentOn(
                  container,
                  surface: SocialSurfaces.blog,
                  peerOwnerId: ownerId,
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: Text(l10n.publishedPhotoWall),
              onTap: () {
                Navigator.pop(ctx);
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => BrowserScreen(
                      initialUrl:
                          webContentUrl(ownerId, WebContentSurface.photos),
                    ),
                  ),
                );
              },
            ),
            if (sections != null)
              for (final s in sections)
                ListTile(
                  leading: const Icon(Icons.folder_outlined),
                  title: Text(s.title),
                  onTap: () {
                    Navigator.pop(ctx);
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => BrowserScreen(initialUrl: s.url),
                      ),
                    );
                  },
                ),
            const SizedBox(height: 8),
          ],
        ),
      );
    },
  );
}
