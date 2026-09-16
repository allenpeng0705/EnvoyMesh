import 'package:flutter/material.dart';

import '../coding/coding_composer.dart';
import '../l10n/app_localizations.dart';

/// Compact Paseo-style Coding composer toolbar (mode / fast / think / import / attach).
class CodingComposerToolbar extends StatelessWidget {
  const CodingComposerToolbar({
    super.key,
    required this.caps,
    required this.prefs,
    required this.onPrefsChanged,
    this.onImportSession,
    this.onAttach,
    this.modelController,
    this.modelSuggestions = const [],
  });

  final CodingComposerCapabilities caps;
  final CodingComposerPrefs prefs;
  final ValueChanged<CodingComposerPrefs> onPrefsChanged;
  final VoidCallback? onImportSession;
  final VoidCallback? onAttach;
  final TextEditingController? modelController;
  final List<String> modelSuggestions;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerHighest.withValues(alpha: 0.55),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        child: Row(
          children: [
            if (caps.model && modelController != null) ...[
              SizedBox(
                width: 120,
                height: 32,
                child: _CodingModelAutocomplete(
                  modelController: modelController!,
                  suggestions: modelSuggestions,
                  hintText: l10n.codingComposerModelHint,
                  onModelChanged: (v) =>
                      onPrefsChanged(prefs.copyWith(model: v)),
                ),
              ),
              const SizedBox(width: 6),
            ],
            if (caps.workingMode)
              SegmentedButton<String>(
                style: const ButtonStyle(
                  visualDensity: VisualDensity.compact,
                  tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                ),
                segments: [
                  ButtonSegment(value: 'ask', label: Text(l10n.codingModeAsk)),
                  ButtonSegment(
                    value: 'plan',
                    label: Text(l10n.codingModePlan),
                  ),
                  ButtonSegment(
                    value: 'code',
                    label: Text(l10n.codingModeCode),
                  ),
                ],
                selected: {prefs.mode},
                onSelectionChanged: (s) {
                  if (s.isEmpty) return;
                  onPrefsChanged(prefs.copyWith(mode: s.first));
                },
              ),
            if (caps.fast) ...[
              const SizedBox(width: 6),
              FilterChip(
                label: Text(l10n.codingModeFast),
                selected: prefs.fast,
                onSelected: (v) => onPrefsChanged(prefs.copyWith(fast: v)),
                visualDensity: VisualDensity.compact,
              ),
            ],
            if (caps.thinking) ...[
              const SizedBox(width: 6),
              PopupMenuButton<String>(
                tooltip: l10n.codingModeThink,
                onSelected: (v) =>
                    onPrefsChanged(prefs.copyWith(thinking: v)),
                itemBuilder: (_) => const [
                  PopupMenuItem(value: 'off', child: Text('Off')),
                  PopupMenuItem(value: 'low', child: Text('Low')),
                  PopupMenuItem(value: 'medium', child: Text('Medium')),
                  PopupMenuItem(value: 'high', child: Text('High')),
                ],
                child: Chip(
                  label: Text(
                    prefs.thinking == 'off'
                        ? l10n.codingModeThink
                        : '${l10n.codingModeThink}: ${prefs.thinking}',
                  ),
                  visualDensity: VisualDensity.compact,
                ),
              ),
            ],
            if (caps.importSession && onImportSession != null) ...[
              const SizedBox(width: 6),
              IconButton(
                tooltip: l10n.codingImportSession,
                onPressed: onImportSession,
                icon: const Icon(Icons.history, size: 18),
                visualDensity: VisualDensity.compact,
              ),
            ],
            if (caps.attach && onAttach != null) ...[
              const SizedBox(width: 2),
              IconButton(
                tooltip: l10n.codingAttachFile,
                onPressed: onAttach,
                icon: const Icon(Icons.attach_file, size: 18),
                visualDensity: VisualDensity.compact,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Stateful autocomplete so the Autocomplete field controller listener is
/// attached once and removed on dispose (avoids stacking on rebuild).
class _CodingModelAutocomplete extends StatefulWidget {
  const _CodingModelAutocomplete({
    required this.modelController,
    required this.suggestions,
    required this.hintText,
    required this.onModelChanged,
  });

  final TextEditingController modelController;
  final List<String> suggestions;
  final String hintText;
  final ValueChanged<String> onModelChanged;

  @override
  State<_CodingModelAutocomplete> createState() =>
      _CodingModelAutocompleteState();
}

class _CodingModelAutocompleteState extends State<_CodingModelAutocomplete> {
  TextEditingController? _acController;
  VoidCallback? _syncListener;

  void _detach() {
    if (_acController != null && _syncListener != null) {
      _acController!.removeListener(_syncListener!);
    }
    _acController = null;
    _syncListener = null;
  }

  @override
  void dispose() {
    _detach();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Autocomplete<String>(
      optionsBuilder: (text) {
        final q = text.text.trim().toLowerCase();
        if (q.isEmpty) return widget.suggestions;
        return widget.suggestions
            .where((s) => s.toLowerCase().contains(q));
      },
      onSelected: (v) {
        widget.modelController.text = v;
        widget.onModelChanged(v);
      },
      fieldViewBuilder: (ctx, controller, focus, onSubmit) {
        if (!identical(_acController, controller)) {
          _detach();
          _acController = controller;
          if (controller.text != widget.modelController.text) {
            controller.text = widget.modelController.text;
          }
          _syncListener = () {
            if (widget.modelController.text != controller.text) {
              widget.modelController.text = controller.text;
            }
          };
          controller.addListener(_syncListener!);
        }
        return TextField(
          controller: controller,
          focusNode: focus,
          onSubmitted: (_) => onSubmit(),
          decoration: InputDecoration(
            isDense: true,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 8,
            ),
            hintText: widget.hintText,
            border: const OutlineInputBorder(),
          ),
          style: const TextStyle(fontSize: 12),
          onChanged: widget.onModelChanged,
        );
      },
    );
  }
}
