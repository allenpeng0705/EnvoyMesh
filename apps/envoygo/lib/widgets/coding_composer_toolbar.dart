import 'package:flutter/material.dart';

import '../coding/coding_composer.dart';
import '../l10n/app_localizations.dart';

/// Compact Coding composer toolbar — Mode, Permissions, Fast, Think, Import.
class CodingComposerToolbar extends StatelessWidget {
  const CodingComposerToolbar({
    super.key,
    required this.caps,
    required this.prefs,
    required this.onPrefsChanged,
    this.onImportSession,
    this.onAttach,
    this.onPermissionPolicyChanged,
    this.modelController,
    this.modelSuggestions = const [],
  });

  final CodingComposerCapabilities caps;
  final CodingComposerPrefs prefs;
  final ValueChanged<CodingComposerPrefs> onPrefsChanged;
  final VoidCallback? onImportSession;
  final VoidCallback? onAttach;
  /// Optional side-effect hook (RPC). Prefer wiring policy RPCs inside
  /// [onPrefsChanged] and omit this to avoid duplicate calls — the toolbar
  /// invokes both when both are set.
  final ValueChanged<String>? onPermissionPolicyChanged;
  final TextEditingController? modelController;
  final List<String> modelSuggestions;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final showAnything = caps.model ||
        caps.workingMode ||
        caps.agentModes.isNotEmpty ||
        caps.permissions ||
        caps.fast ||
        caps.thinking ||
        caps.importSession;
    if (!showAnything) return const SizedBox.shrink();

    final agentModeId = prefs.agentModeId != null &&
            caps.agentModes.any((m) => m.id == prefs.agentModeId)
        ? prefs.agentModeId!
        : (caps.agentModes.isNotEmpty ? caps.agentModes.first.id : null);

    final permissionValue =
        caps.permissionAskDisabledReason != null &&
                prefs.permissionPolicy == 'always-confirm'
            ? 'safe-only'
            : prefs.permissionPolicy;

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
            if (caps.agentModes.isNotEmpty && agentModeId != null) ...[
              DropdownButton<String>(
                value: agentModeId,
                isDense: true,
                underline: const SizedBox.shrink(),
                items: [
                  for (final m in caps.agentModes)
                    DropdownMenuItem(value: m.id, child: Text(m.label)),
                ],
                onChanged: (id) {
                  if (id == null) return;
                  CodingAgentModeOption? opt;
                  for (final m in caps.agentModes) {
                    if (m.id == id) {
                      opt = m;
                      break;
                    }
                  }
                  onPrefsChanged(
                    prefs.copyWith(
                      agentModeId: id,
                      mode: opt?.workingMode ?? prefs.mode,
                    ),
                  );
                },
              ),
              const SizedBox(width: 6),
            ] else if (caps.workingMode)
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
            if (caps.permissions) ...[
              const SizedBox(width: 6),
              DropdownButton<String>(
                value: permissionValue,
                isDense: true,
                underline: const SizedBox.shrink(),
                items: [
                  DropdownMenuItem(
                    value: 'safe-only',
                    child: Text(l10n.codingPermSafe),
                  ),
                  DropdownMenuItem(
                    value: 'always-confirm',
                    enabled: caps.permissionAskDisabledReason == null,
                    child: Text(l10n.codingPermAsk),
                  ),
                  DropdownMenuItem(
                    value: 'off',
                    enabled: caps.permissionFullDisabledReason == null,
                    child: Text(l10n.codingPermFull),
                  ),
                ],
                onChanged: (v) {
                  if (v == null) return;
                  if (v == 'off' &&
                      caps.permissionFullDisabledReason != null) {
                    return;
                  }
                  if (v == 'always-confirm' &&
                      caps.permissionAskDisabledReason != null) {
                    return;
                  }
                  // Single prefs write — parents that also pass
                  // [onPermissionPolicyChanged] must not re-apply the same
                  // policy RPC from [onPrefsChanged].
                  onPrefsChanged(prefs.copyWith(permissionPolicy: v));
                  onPermissionPolicyChanged?.call(v);
                },
              ),
            ],
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
              TextButton(
                onPressed: onImportSession,
                child: Text(l10n.codingImportSession),
              ),
            ],
            if (onAttach != null) ...[
              const SizedBox(width: 4),
              IconButton(
                tooltip: l10n.codingAttachFile,
                icon: const Icon(Icons.attach_file, size: 18),
                onPressed: onAttach,
                visualDensity: VisualDensity.compact,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Keeps Autocomplete field text in sync when [modelController] is updated
/// asynchronously (e.g. status/model prefs load after first frame).
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
  TextEditingController? _fieldController;

  @override
  void initState() {
    super.initState();
    widget.modelController.addListener(_syncFromModelController);
  }

  @override
  void didUpdateWidget(covariant _CodingModelAutocomplete oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.modelController != widget.modelController) {
      oldWidget.modelController.removeListener(_syncFromModelController);
      widget.modelController.addListener(_syncFromModelController);
      _syncFromModelController();
    }
  }

  @override
  void dispose() {
    widget.modelController.removeListener(_syncFromModelController);
    super.dispose();
  }

  void _syncFromModelController() {
    final field = _fieldController;
    if (field == null) return;
    final next = widget.modelController.text;
    if (field.text == next) return;
    field.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: next.length),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Autocomplete<String>(
      initialValue: TextEditingValue(text: widget.modelController.text),
      optionsBuilder: (textEditingValue) {
        final q = textEditingValue.text.trim().toLowerCase();
        if (q.isEmpty) return widget.suggestions;
        return widget.suggestions.where((s) => s.toLowerCase().contains(q));
      },
      onSelected: (v) {
        widget.modelController.text = v;
        widget.onModelChanged(v);
      },
      fieldViewBuilder: (context, controller, focusNode, onFieldSubmitted) {
        _fieldController = controller;
        if (controller.text.isEmpty &&
            widget.modelController.text.isNotEmpty) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (!mounted) return;
            _syncFromModelController();
          });
        }
        return TextField(
          controller: controller,
          focusNode: focusNode,
          style: const TextStyle(fontSize: 13),
          decoration: InputDecoration(
            isDense: true,
            hintText: widget.hintText,
            border: const OutlineInputBorder(),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
          ),
          onChanged: (v) {
            widget.modelController.value = TextEditingValue(
              text: v,
              selection: TextSelection.collapsed(offset: v.length),
            );
            widget.onModelChanged(v);
          },
        );
      },
    );
  }
}
