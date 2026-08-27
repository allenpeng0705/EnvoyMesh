import 'package:flutter/material.dart';

import '../../l10n/app_localizations.dart';

class EhChangesBanner extends StatelessWidget {
  const EhChangesBanner({
    super.key,
    required this.files,
    this.onReview,
    this.onReviewFile,
    this.onKeepAll,
    this.onRevertAll,
    this.reviewMinFiles,
    this.onReviewMinFilesChange,
  });

  final List<String> files;
  final VoidCallback? onReview;
  final ValueChanged<String>? onReviewFile;
  final VoidCallback? onKeepAll;
  final VoidCallback? onRevertAll;
  final int? reviewMinFiles;
  final ValueChanged<int>? onReviewMinFilesChange;

  @override
  Widget build(BuildContext context) {
    if (files.isEmpty) return const SizedBox.shrink();
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final showToggle = files.length > 3;

    return Material(
      color: scheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              l10n.ehChangesCount(files.length),
              style: Theme.of(context).textTheme.titleSmall,
            ),
            if (showToggle)
              _EhChangesFileList(
                files: files,
                onReviewFile: onReviewFile,
              )
            else if (files.length <= 3)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Wrap(
                  spacing: 8,
                  runSpacing: 4,
                  children: files
                      .map(
                        (path) => onReviewFile != null
                            ? ActionChip(
                                label: Text(
                                  path,
                                  style: const TextStyle(
                                    fontFamily: 'monospace',
                                    fontSize: 11,
                                  ),
                                ),
                                onPressed: () => onReviewFile!(path),
                              )
                            : Text(
                                path,
                                style: const TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 11,
                                ),
                              ),
                      )
                      .toList(),
                ),
              ),
            if (onReviewMinFilesChange != null && reviewMinFiles != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Row(
                  children: [
                    Text(
                      l10n.ehReviewAutoLabel,
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                    const SizedBox(width: 8),
                    DropdownButton<int>(
                      value: reviewMinFiles,
                      isDense: true,
                      items: [
                        DropdownMenuItem(
                          value: 0,
                          child: Text(l10n.ehReviewAutoAlways),
                        ),
                        const DropdownMenuItem(value: 1, child: Text('1')),
                        const DropdownMenuItem(value: 2, child: Text('2')),
                        const DropdownMenuItem(value: 5, child: Text('5')),
                      ],
                      onChanged: (value) {
                        if (value != null) onReviewMinFilesChange!(value);
                      },
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [
                if (onReview != null)
                  OutlinedButton(
                    onPressed: onReview,
                    child: Text(l10n.ehReviewChanges),
                  ),
                if (onKeepAll != null)
                  OutlinedButton(
                    onPressed: onKeepAll,
                    child: Text(l10n.ehChangesKeepAll),
                  ),
                if (onRevertAll != null)
                  OutlinedButton(
                    onPressed: onRevertAll,
                    child: Text(l10n.ehChangesRevert),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EhChangesFileList extends StatefulWidget {
  const _EhChangesFileList({
    required this.files,
    this.onReviewFile,
  });

  final List<String> files;
  final ValueChanged<String>? onReviewFile;

  @override
  State<_EhChangesFileList> createState() => _EhChangesFileListState();
}

class _EhChangesFileListState extends State<_EhChangesFileList> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextButton(
          onPressed: () => setState(() => _expanded = !_expanded),
          child: Text(
            _expanded ? l10n.ehChangesHideList : l10n.ehChangesShowList,
          ),
        ),
        if (_expanded)
          ...widget.files.map(
            (path) => ListTile(
              dense: true,
              title: Text(
                path,
                style: const TextStyle(fontFamily: 'monospace', fontSize: 12),
              ),
              onTap: widget.onReviewFile != null
                  ? () => widget.onReviewFile!(path)
                  : null,
            ),
          )
        else
          Text(
            '${widget.files.take(3).join(', ')}${widget.files.length > 3 ? ' +${widget.files.length - 3}' : ''}',
            style: const TextStyle(fontFamily: 'monospace', fontSize: 11),
          ),
      ],
    );
  }
}
