import 'package:flutter/material.dart';

import '../../models/web_content.dart';
import '../../services/envoy_url.dart';
import '../browser/browser_screen.dart';

/// Bottom sheet: Profile / Blog / PhotoWall (+ custom sections when listing own site).
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
      return SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Text(
                'Published content — $name',
                style: Theme.of(ctx).textTheme.titleMedium,
              ),
            ),
            ListTile(
              leading: const Icon(Icons.person_outline),
              title: const Text('Profile'),
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
              leading: const Icon(Icons.article_outlined),
              title: const Text('Blog'),
              onTap: () {
                Navigator.pop(ctx);
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => BrowserScreen(
                      initialUrl:
                          webContentUrl(ownerId, WebContentSurface.blog),
                    ),
                  ),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('PhotoWall'),
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
