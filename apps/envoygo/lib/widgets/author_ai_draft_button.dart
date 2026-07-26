import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/contact_provider.dart';

/// Surfaces mirrored from `@envoymesh/api` AUTHOR_CONTENT_SURFACES.
const authorAiSurfaces = ['bio', 'blog', 'section', 'caption', 'feed'];

List<String> defaultTonesForSurface(String surface) {
  switch (surface) {
    case 'bio':
      return const ['professional', 'casual', 'playful'];
    case 'blog':
      return const ['informative', 'personal', 'punchy'];
    case 'section':
      return const ['clear', 'friendly'];
    case 'caption':
      return const ['descriptive', 'poetic'];
    case 'feed':
      return const ['casual', 'playful', 'personal'];
    default:
      return const ['casual'];
  }
}

String _sheetTitle(String surface) {
  switch (surface) {
    case 'bio':
      return 'Draft bio';
    case 'blog':
      return 'Draft blog post';
    case 'section':
      return 'Draft section';
    case 'caption':
      return 'Draft caption';
    case 'feed':
      return 'Draft Feed update';
    default:
      return 'Draft with AI';
  }
}

String _toneLabel(String tone) =>
    tone.isEmpty ? tone : '${tone[0].toUpperCase()}${tone.substring(1)}';

/// "Draft with AI" control — hidden/disabled when home AI is not configured.
///
/// Calls home `draftAuthorContent`. On success invokes [onDraft] with the text.
class AuthorAiDraftButton extends ConsumerStatefulWidget {
  final String surface;
  /// Read at open time so the latest field value is used.
  final ValueGetter<String> existingText;
  final ValueGetter<String?>? title;
  final ValueChanged<String> onDraft;
  final bool disabled;

  const AuthorAiDraftButton({
    super.key,
    required this.surface,
    required this.existingText,
    required this.onDraft,
    this.title,
    this.disabled = false,
  });

  @override
  ConsumerState<AuthorAiDraftButton> createState() => _AuthorAiDraftButtonState();
}

class _AuthorAiDraftButtonState extends ConsumerState<AuthorAiDraftButton> {
  bool _aiReady = false;
  bool _loadingConfig = true;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _refreshAiReady());
  }

  Future<void> _refreshAiReady() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      if (mounted) {
        setState(() {
          _aiReady = false;
          _loadingConfig = false;
        });
      }
      return;
    }
    try {
      final cfg = await client.getNodeConfig();
      final mp = (cfg['modelProviders'] as Map?)?.cast<String, dynamic>();
      final mode = (mp?['mode'] as String?) ?? 'disabled';
      if (!mounted) return;
      setState(() {
        _aiReady = mode != 'disabled';
        _loadingConfig = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _aiReady = false;
        _loadingConfig = false;
      });
    }
  }

  Future<void> _openSheet() async {
    if (!_aiReady || widget.disabled) return;
    final draft = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (ctx) => _AuthorAiDraftSheet(
        surface: widget.surface,
        existingText: widget.existingText(),
        title: widget.title?.call(),
      ),
    );
    if (draft != null && draft.trim().isNotEmpty && mounted) {
      widget.onDraft(draft.trim());
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final enabled = _aiReady && !widget.disabled && !_loadingConfig;
    return TextButton.icon(
      onPressed: enabled ? _openSheet : null,
      icon: Icon(
        Icons.auto_awesome,
        size: 18,
        color: enabled ? scheme.primary : scheme.onSurface.withValues(alpha: 0.35),
      ),
      label: Text(
        'Draft with AI',
        style: TextStyle(
          fontWeight: FontWeight.w600,
          color: enabled ? scheme.primary : scheme.onSurface.withValues(alpha: 0.35),
        ),
      ),
      style: TextButton.styleFrom(
        padding: const EdgeInsets.symmetric(horizontal: 8),
        visualDensity: VisualDensity.compact,
      ),
    );
  }
}

class _AuthorAiDraftSheet extends ConsumerStatefulWidget {
  final String surface;
  final String existingText;
  final String? title;

  const _AuthorAiDraftSheet({
    required this.surface,
    required this.existingText,
    this.title,
  });

  @override
  ConsumerState<_AuthorAiDraftSheet> createState() => _AuthorAiDraftSheetState();
}

class _AuthorAiDraftSheetState extends ConsumerState<_AuthorAiDraftSheet> {
  final _hintCtrl = TextEditingController();
  late String _tone;
  late String _mode;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final tones = defaultTonesForSurface(widget.surface);
    _tone = tones.first;
    _mode = widget.existingText.trim().isEmpty ? 'write' : 'rewrite';
  }

  @override
  void dispose() {
    _hintCtrl.dispose();
    super.dispose();
  }

  Future<void> _generate() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() => _error = 'Not connected to home node');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final title = widget.title?.trim();
      final existing = widget.existingText.trim();
      final result = await client.draftAuthorContent(
        surface: widget.surface,
        mode: _mode,
        tone: _tone,
        hint: _hintCtrl.text.trim().isEmpty ? null : _hintCtrl.text.trim(),
        title: (title == null || title.isEmpty) ? null : title,
        existingText: existing.isEmpty ? null : existing,
      );
      if (!mounted) return;
      final ok = result['ok'] == true;
      if (!ok) {
        final reason = (result['reason'] as String?) ?? 'failed';
        setState(() {
          _error = reason == 'no_model_providers'
              ? 'No AI model configured. Open Settings → AI on the home node.'
              : 'Could not draft ($reason)';
        });
        return;
      }
      final text = (result['text'] as String?)?.trim() ?? '';
      if (text.isEmpty) {
        setState(() => _error = 'Empty draft from model');
        return;
      }
      Navigator.of(context).pop(text);
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final tones = defaultTonesForSurface(widget.surface);
    final hasExisting = widget.existingText.trim().isNotEmpty;
    final bottom = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.fromLTRB(20, 8, 20, 20 + bottom),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              _sheetTitle(widget.surface),
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _hintCtrl,
              enabled: !_busy,
              maxLines: 3,
              decoration: const InputDecoration(
                labelText: 'What should it emphasize? (optional)',
                hintText: 'e.g. weekend hike with friends',
                border: OutlineInputBorder(),
                alignLabelWithHint: true,
              ),
            ),
            if (hasExisting) ...[
              const SizedBox(height: 12),
              Text(
                'Mode',
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                children: [
                  for (final m in const ['rewrite', 'expand', 'shorten'])
                    ChoiceChip(
                      label: Text(m[0].toUpperCase() + m.substring(1)),
                      selected: _mode == m,
                      onSelected: _busy
                          ? null
                          : (_) => setState(() => _mode = m),
                    ),
                ],
              ),
            ],
            const SizedBox(height: 12),
            Text(
              'Tone',
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final tone in tones)
                  ChoiceChip(
                    label: Text(_toneLabel(tone)),
                    selected: _tone == tone,
                    onSelected: _busy
                        ? null
                        : (_) => setState(() => _tone = tone),
                  ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: scheme.error)),
            ],
            const SizedBox(height: 16),
            Row(
              children: [
                TextButton(
                  onPressed: _busy ? null : () => Navigator.pop(context),
                  child: const Text('Cancel'),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: _busy ? null : _generate,
                  child: Text(_busy ? 'Generating…' : 'Generate'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Apply a draft into an existing field (replace when empty, else offer insert).
String applyAuthorDraft(String previous, String draft, {required bool replace}) {
  final d = draft.trim();
  if (d.isEmpty) return previous;
  if (replace || previous.trim().isEmpty) return d;
  final prev = previous.trimRight();
  return prev.isEmpty ? d : '$prev\n\n$d';
}
