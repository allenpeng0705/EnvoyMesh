import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../coding/coding_projects.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../widgets/home_folder_browser.dart';
import 'coding_new_task_sheet.dart';

/// Register a folder as a Coding project (parity with Social Add project).
///
/// Does not start a task — returns the saved [CodingProject] so the caller
/// can open New task with that path prefilled.
Future<CodingProject?> showCodingAddProjectSheet(
  BuildContext context,
  WidgetRef ref,
) {
  return showModalBottomSheet<CodingProject>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => const _CodingAddProjectSheet(),
  );
}

class _CodingAddProjectSheet extends ConsumerStatefulWidget {
  const _CodingAddProjectSheet();

  @override
  ConsumerState<_CodingAddProjectSheet> createState() =>
      _CodingAddProjectSheetState();
}

class _CodingAddProjectSheetState
    extends ConsumerState<_CodingAddProjectSheet> {
  final TextEditingController _pathController = TextEditingController();
  var _harness = CodingHarnessChoice.envoyHarness;
  var _busy = false;

  @override
  void dispose() {
    _pathController.dispose();
    super.dispose();
  }

  Future<void> _browse() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    final picked = await HomeFolderBrowser.open(
      context,
      client: client,
      initialPath: _pathController.text.trim().isEmpty
          ? null
          : _pathController.text.trim(),
      title: l10n.codingAddProjectTitle,
    );
    if (picked == null || !mounted) return;
    setState(() => _pathController.text = picked);
  }

  Future<void> _submit() async {
    final l10n = AppLocalizations.of(context);
    final path = normalizeCodingProjectPath(_pathController.text);
    if (path.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.chatsPiFolderRequired)),
      );
      return;
    }
    setState(() => _busy = true);
    try {
      final project = await addCodingProject(
        path,
        defaultHarness: codingHarnessWireId(_harness),
      );
      if (!mounted) return;
      Navigator.of(context).pop(project);
    } catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e
                .toString()
                .replaceFirst('Exception: ', '')
                .replaceFirst('Bad state: ', ''),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final client = ref.watch(nodeServiceProvider);

    return Padding(
      padding: EdgeInsets.only(
        left: 16,
        right: 16,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 16,
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                l10n.codingAddProjectTitle,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(
                l10n.codingAddProjectDesc,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 16),
              TextField(
                controller: _pathController,
                enabled: !_busy,
                decoration: InputDecoration(
                  labelText: l10n.chatsPiFolder,
                  hintText: l10n.chatsPiFolderHint,
                  border: const OutlineInputBorder(),
                  suffixIcon: IconButton(
                    tooltip: l10n.knowledgePanelBrowse,
                    onPressed: _busy || client == null
                        ? null
                        : () => unawaited(_browse()),
                    icon: const Icon(Icons.folder_open),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(
                l10n.codingHarnessLabel,
                style: Theme.of(context).textTheme.labelLarge,
              ),
              RadioListTile<CodingHarnessChoice>(
                dense: true,
                title: Text(l10n.chatsCodingEh),
                value: CodingHarnessChoice.envoyHarness,
                groupValue: _harness,
                onChanged: _busy
                    ? null
                    : (v) {
                        if (v != null) setState(() => _harness = v);
                      },
              ),
              RadioListTile<CodingHarnessChoice>(
                dense: true,
                title: Text(l10n.chatsCodingPi),
                value: CodingHarnessChoice.pi,
                groupValue: _harness,
                onChanged: _busy
                    ? null
                    : (v) {
                        if (v != null) setState(() => _harness = v);
                      },
              ),
              RadioListTile<CodingHarnessChoice>(
                dense: true,
                title: const Text('Claude Code'),
                value: CodingHarnessChoice.claudeCode,
                groupValue: _harness,
                onChanged: _busy
                    ? null
                    : (v) {
                        if (v != null) setState(() => _harness = v);
                      },
              ),
              RadioListTile<CodingHarnessChoice>(
                dense: true,
                title: const Text('Codex'),
                value: CodingHarnessChoice.codex,
                groupValue: _harness,
                onChanged: _busy
                    ? null
                    : (v) {
                        if (v != null) setState(() => _harness = v);
                      },
              ),
              RadioListTile<CodingHarnessChoice>(
                dense: true,
                title: const Text('OpenCode'),
                value: CodingHarnessChoice.openCode,
                groupValue: _harness,
                onChanged: _busy
                    ? null
                    : (v) {
                        if (v != null) setState(() => _harness = v);
                      },
              ),
              RadioListTile<CodingHarnessChoice>(
                dense: true,
                title: const Text('Cursor'),
                value: CodingHarnessChoice.cursor,
                groupValue: _harness,
                onChanged: _busy
                    ? null
                    : (v) {
                        if (v != null) setState(() => _harness = v);
                      },
              ),
              const SizedBox(height: 16),
              FilledButton(
                onPressed: _busy ? null : () => unawaited(_submit()),
                child: _busy
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : Text(l10n.codingAddProjectConfirm),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
