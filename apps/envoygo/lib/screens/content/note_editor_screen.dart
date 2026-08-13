// Create / edit Markdown notes under notes/ (Social NoteEditorView parity).
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;

class NoteEditorScreen extends ConsumerStatefulWidget {
  final String mode; // create | edit
  final String? relativePath;

  const NoteEditorScreen({
    super.key,
    required this.mode,
    this.relativePath,
  });

  @override
  ConsumerState<NoteEditorScreen> createState() => _NoteEditorScreenState();
}

class _NoteEditorScreenState extends ConsumerState<NoteEditorScreen> {
  final _filename = TextEditingController();
  final _content = TextEditingController();
  String _sensitivity = 'private';
  bool _alsoBlog = false;
  bool _busy = false;
  bool _loaded = false;
  String? _error;
  String? _editSubfolder;
  String? _editFilename;

  bool get _isEdit => widget.mode == 'edit';

  @override
  void initState() {
    super.initState();
    if (_isEdit && widget.relativePath != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _loadExisting());
    }
  }

  @override
  void dispose() {
    _filename.dispose();
    _content.dispose();
    super.dispose();
  }

  Future<void> _loadExisting() async {
    final client = ref.read(nodeServiceProvider);
    final path = widget.relativePath;
    if (client == null || path == null) return;
    setState(() => _busy = true);
    try {
      final raw = await client.readLibraryItemContent(
        relativePath: path,
        maxBytes: 512 * 1024,
      );
      final b64 = (raw['contentBase64'] as String?) ?? '';
      final text = b64.isEmpty
          ? ''
          : utf8.decode(base64Decode(b64), allowMalformed: true);
      final under = path.replaceFirst(RegExp(r'^notes/'), '');
      final parts = under.split('/');
      final fn = parts.isNotEmpty ? parts.removeLast() : under;
      if (!mounted) return;
      setState(() {
        _content.text = text;
        _editFilename = fn;
        _editSubfolder = parts.isEmpty ? null : parts.join('/');
        _filename.text = fn;
        _loaded = true;
        _busy = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _busy = false;
      });
    }
  }

  Future<void> _save() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final l10n = AppLocalizations.of(context);
    String filename;
    String? subfolder;
    if (_isEdit) {
      filename = _editFilename ?? '';
      subfolder = _editSubfolder;
    } else {
      var name = _filename.text.trim();
      if (name.isEmpty) {
        setState(() => _error = l10n.knowledgeNoteFilenameRequired);
        return;
      }
      if (!name.toLowerCase().endsWith('.md')) name = '$name.md';
      filename = name;
      subfolder = null;
    }
    if (filename.isEmpty) {
      setState(() => _error = l10n.knowledgeNoteFilenameRequired);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await client.createNote(
        filename: filename,
        content: _content.text,
        subfolder: subfolder,
        sensitivity: _sensitivity,
        alsoPublishAsBlog: !_isEdit && _alsoBlog,
      );
      if (!mounted) return;
      Navigator.pop(context, true);
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _busy = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(
          _isEdit ? l10n.knowledgeNoteEditTitle : l10n.knowledgeNoteNewTitle,
        ),
        actions: [
          TextButton(
            onPressed: _busy ? null : _save,
            child: Text(l10n.commonSave),
          ),
        ],
      ),
      body: _busy && _isEdit && !_loaded
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (!_isEdit)
                  TextField(
                    controller: _filename,
                    decoration: InputDecoration(
                      labelText: l10n.knowledgeNoteFilename,
                      hintText: 'my-note.md',
                    ),
                    textInputAction: TextInputAction.next,
                  ),
                if (_isEdit && widget.relativePath != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(
                      widget.relativePath!,
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: _sensitivity,
                  decoration: InputDecoration(
                    labelText: l10n.knowledgeNoteSensitivity,
                  ),
                  items: [
                    DropdownMenuItem(
                      value: 'private',
                      child: Text(l10n.knowledgeNotePrivate),
                    ),
                    DropdownMenuItem(
                      value: 'friends',
                      child: Text(l10n.knowledgeNoteFriends),
                    ),
                    DropdownMenuItem(
                      value: 'public',
                      child: Text(l10n.knowledgeNotePublished),
                    ),
                  ],
                  onChanged: _busy
                      ? null
                      : (v) {
                          if (v != null) setState(() => _sensitivity = v);
                        },
                ),
                if (!_isEdit)
                  SwitchListTile(
                    contentPadding: EdgeInsets.zero,
                    title: Text(l10n.knowledgeNoteAlsoBlog),
                    value: _alsoBlog,
                    onChanged: _busy
                        ? null
                        : (v) => setState(() => _alsoBlog = v),
                  ),
                const SizedBox(height: 8),
                TextField(
                  controller: _content,
                  decoration: InputDecoration(
                    labelText: l10n.knowledgeNoteContent,
                    alignLabelWithHint: true,
                  ),
                  minLines: 12,
                  maxLines: 24,
                  keyboardType: TextInputType.multiline,
                ),
                if (_error != null) ...[
                  const SizedBox(height: 12),
                  Text(
                    _error!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ],
              ],
            ),
    );
  }
}
