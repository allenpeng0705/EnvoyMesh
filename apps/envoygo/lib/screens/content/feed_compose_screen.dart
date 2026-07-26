import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../models/contact.dart';
import '../../providers/contact_provider.dart';
import '../../widgets/author_ai_draft_button.dart';
import '../../widgets/feed_media_grid.dart';

/// Compose a Feed (Friend Circle) post: text + up to 9 images, bonded default.
class FeedComposeScreen extends ConsumerStatefulWidget {
  const FeedComposeScreen({super.key});

  @override
  ConsumerState<FeedComposeScreen> createState() => _FeedComposeScreenState();
}

class _FeedComposeScreenState extends ConsumerState<FeedComposeScreen> {
  final _textCtrl = TextEditingController();
  String _visibility = 'bonded';
  final Set<String> _contactIds = {};
  final List<XFile> _images = [];
  final Map<String, Uint8List> _previews = {};
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _textCtrl.dispose();
    super.dispose();
  }

  List<Contact> get _selectableContacts {
    return ref
        .read(contactProvider)
        .bonds
        .where((c) => c.bondLevel != 'blocked' && c.ownerId.isNotEmpty)
        .toList();
  }

  Future<void> _pickImages() async {
    final picker = ImagePicker();
    final remaining = maxFeedPostImages - _images.length;
    if (remaining <= 0) return;
    final files = await picker.pickMultiImage(
      maxWidth: 1920,
      imageQuality: 85,
      limit: remaining,
    );
    if (files.isEmpty || !mounted) return;
    for (final file in files.take(remaining)) {
      try {
        _previews[file.path] = await file.readAsBytes();
      } catch (_) {
        /* preview optional */
      }
    }
    setState(() {
      _images.addAll(files.take(remaining));
    });
  }

  void _removeImage(int index) {
    final path = _images[index].path;
    setState(() {
      _images.removeAt(index);
      _previews.remove(path);
    });
  }

  String _mimeFor(XFile file) {
    final declared = file.mimeType?.trim().toLowerCase();
    if (declared != null && declared.startsWith('image/')) {
      if (declared == 'image/jpg') return 'image/jpeg';
      return declared;
    }
    final path = file.path.toLowerCase();
    if (path.endsWith('.png')) return 'image/png';
    if (path.endsWith('.webp')) return 'image/webp';
    if (path.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
  }

  Future<void> _applyDraft(String draft) async {
    final current = _textCtrl.text;
    if (current.trim().isEmpty) {
      setState(() => _textCtrl.text = draft);
      return;
    }
    final action = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('AI draft'),
        content: SingleChildScrollView(child: Text(draft)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Discard')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, 'insert'),
            child: const Text('Insert'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, 'replace'),
            child: const Text('Replace'),
          ),
        ],
      ),
    );
    if (!mounted || action == null) return;
    setState(() {
      _textCtrl.text = applyAuthorDraft(
        current,
        draft,
        replace: action == 'replace',
      );
    });
  }

  Future<void> _publish() async {
    final body = _textCtrl.text.trim();
    if (body.isEmpty && _images.isEmpty) {
      setState(() => _error = 'Add text or at least one photo');
      return;
    }
    if (_visibility == 'contacts' && _contactIds.isEmpty) {
      setState(() => _error = 'Select at least one contact');
      return;
    }
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
      final images = <Map<String, String>>[];
      for (final file in _images) {
        final bytes = _previews[file.path] ?? await file.readAsBytes();
        images.add({
          'contentBase64': base64Encode(bytes),
          'mimeType': _mimeFor(file),
          'fileName': file.name,
        });
      }
      final title = body.isNotEmpty
          ? (body.length > 48 ? body.substring(0, 48) : body)
          : 'Feed post';
      final result = await client.publishWebContentEntry(
        template: 'feed-post',
        title: title,
        body: body.isEmpty ? null : body,
        visibility: _visibility,
        contactIds: _visibility == 'contacts' ? _contactIds.toList() : null,
        images: images.isEmpty ? null : images,
      );
      if (!mounted) return;
      Navigator.of(context).pop(result.url);
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
    final contacts = _selectableContacts;
    final canPost = !_busy && (_visibility != 'contacts' || _contactIds.isNotEmpty);

    return Scaffold(
      appBar: AppBar(
        title: const Text('New post'),
        actions: [
          Padding(
            padding: const EdgeInsets.only(right: 8),
            child: FilledButton(
              onPressed: canPost ? _publish : null,
              child: Text(_busy ? 'Posting…' : 'Post'),
            ),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          if (_error != null) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: scheme.errorContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(_error!, style: TextStyle(color: scheme.onErrorContainer)),
            ),
            const SizedBox(height: 12),
          ],
          Row(
            children: [
              Text(
                "What's on your mind?",
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const Spacer(),
              AuthorAiDraftButton(
                surface: 'feed',
                existingText: () => _textCtrl.text,
                disabled: _busy,
                onDraft: (draft) => _applyDraft(draft),
              ),
            ],
          ),
          const SizedBox(height: 8),
          TextField(
            controller: _textCtrl,
            maxLines: 7,
            enabled: !_busy,
            style: const TextStyle(height: 1.45, fontSize: 16),
            decoration: InputDecoration(
              hintText: 'Share an update with bonded contacts…',
              filled: true,
              fillColor: scheme.surfaceContainerHighest.withValues(alpha: 0.45),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide.none,
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.5)),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(16),
                borderSide: BorderSide(color: scheme.primary, width: 1.5),
              ),
              contentPadding: const EdgeInsets.all(16),
            ),
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Text(
                'Photos',
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const Spacer(),
              Text(
                '${_images.length}/$maxFeedPostImages',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (var i = 0; i < _images.length; i++)
                Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: SizedBox(
                        width: 88,
                        height: 88,
                        child: _previews[_images[i].path] != null
                            ? Image.memory(
                                _previews[_images[i].path]!,
                                fit: BoxFit.cover,
                              )
                            : ColoredBox(
                                color: scheme.surfaceContainerHighest,
                                child: Icon(Icons.image_outlined, color: scheme.onSurfaceVariant),
                              ),
                      ),
                    ),
                    Positioned(
                      top: 4,
                      right: 4,
                      child: Material(
                        color: Colors.black54,
                        shape: const CircleBorder(),
                        child: InkWell(
                          customBorder: const CircleBorder(),
                          onTap: _busy ? null : () => _removeImage(i),
                          child: const Padding(
                            padding: EdgeInsets.all(4),
                            child: Icon(Icons.close, size: 14, color: Colors.white),
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              if (_images.length < maxFeedPostImages)
                Material(
                  color: scheme.primaryContainer.withValues(alpha: 0.4),
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    onTap: _busy ? null : _pickImages,
                    borderRadius: BorderRadius.circular(12),
                    child: SizedBox(
                      width: 88,
                      height: 88,
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.add_photo_alternate_outlined, color: scheme.primary),
                          const SizedBox(height: 4),
                          Text(
                            'Add',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: scheme.onPrimaryContainer,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 20),
          DropdownButtonFormField<String>(
            initialValue: _visibility,
            decoration: InputDecoration(
              labelText: 'Visibility',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
            ),
            items: const [
              DropdownMenuItem(value: 'bonded', child: Text('Bonded contacts')),
              DropdownMenuItem(value: 'contacts', child: Text('Selected contacts')),
              DropdownMenuItem(value: 'private', child: Text('Only me')),
            ],
            onChanged: _busy
                ? null
                : (v) {
                    if (v == null) return;
                    setState(() {
                      _visibility = v;
                      if (v != 'contacts') _contactIds.clear();
                    });
                  },
          ),
          if (_visibility == 'contacts') ...[
            const SizedBox(height: 16),
            Text(
              'Selected contacts',
              style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              'Only these contacts can see this post. Pick at least one.',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 8),
            if (contacts.isEmpty)
              Text(
                'No bonded contacts yet — add a contact first, or choose Bonded / Only me.',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurfaceVariant,
                    ),
              )
            else
              ...contacts.map((c) {
                final label = (c.displayName?.trim().isNotEmpty ?? false)
                    ? c.displayName!.trim()
                    : c.ownerId;
                final checked = _contactIds.contains(c.ownerId);
                return CheckboxListTile(
                  value: checked,
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text(label),
                  onChanged: _busy
                      ? null
                      : (v) {
                          setState(() {
                            if (v == true) {
                              _contactIds.add(c.ownerId);
                            } else {
                              _contactIds.remove(c.ownerId);
                            }
                          });
                        },
                );
              }),
          ],
        ],
      ),
    );
  }
}
