import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';
import 'content_files_tab.dart';

/// Full-screen “Your files” library (Knowledge → Browse → open).
///
/// Keeps search + the file list on their own route so the keyboard does not
/// crush a half-height list on the Browse hub.
class KnowledgeLibraryScreen extends StatelessWidget {
  const KnowledgeLibraryScreen({super.key, this.initialQuery});

  final String? initialQuery;

  static Future<void> open(
    BuildContext context, {
    String? initialQuery,
  }) {
    return Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => KnowledgeLibraryScreen(initialQuery: initialQuery),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.knowledgeLibraryHeading),
      ),
      body: ContentFilesTab(
        knowledgeBrowse: true,
        initialQuery: initialQuery,
      ),
    );
  }
}
