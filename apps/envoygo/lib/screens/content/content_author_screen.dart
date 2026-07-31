import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart';
import '../../widgets/author_ai_draft_button.dart';
import '../browser/browser_screen.dart';

/// Author subset: profile | blog-post | photo (home publishWebContentEntry).
class ContentAuthorScreen extends ConsumerStatefulWidget {
  final String? initialTemplate;

  const ContentAuthorScreen({super.key, this.initialTemplate});

  @override
  ConsumerState<ContentAuthorScreen> createState() =>
      _ContentAuthorScreenState();
}

class _ContentAuthorScreenState extends ConsumerState<ContentAuthorScreen> {
  late String _template;
  final _titleCtrl = TextEditingController();
  final _bodyCtrl = TextEditingController();
  final _displayNameCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();
  String _visibility = 'bonded';
  XFile? _photoFile;
  XFile? _avatarFile;
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _template = widget.initialTemplate ?? 'blog-post';
    if (_template == 'profile') {
      _visibility = 'public';
    }
    WidgetsBinding.instance.addPostFrameCallback((_) => _prefillProfile());
  }

  Future<void> _prefillProfile() async {
    if (_template != 'profile') return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final profile = await client.getHumanProfile();
      if (!mounted) return;
      setState(() {
        _displayNameCtrl.text = (profile['displayName'] as String?) ?? '';
        _bioCtrl.text = (profile['bio'] as String?) ?? '';
        _titleCtrl.text = (profile['username'] as String?) ??
            (profile['displayName'] as String?) ??
            '';
      });
    } catch (_) {
      // Prefill is best-effort.
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _bodyCtrl.dispose();
    _displayNameCtrl.dispose();
    _bioCtrl.dispose();
    super.dispose();
  }

  Future<void> _applyDraft(TextEditingController ctrl, String draft) async {
    final current = ctrl.text;
    if (current.trim().isEmpty) {
      setState(() => ctrl.text = draft);
      return;
    }
    final action = await showDialog<String>(
      context: context,
      builder: (ctx) {
        final l10n = AppLocalizations.of(ctx);
        return AlertDialog(
          title: Text(l10n.feedAiDraft),
          content: SingleChildScrollView(child: Text(draft)),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text(l10n.feedDiscard),
            ),
            TextButton(
              onPressed: () => Navigator.pop(ctx, 'insert'),
              child: Text(l10n.feedInsert),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, 'replace'),
              child: Text(l10n.feedReplace),
            ),
          ],
        );
      },
    );
    if (!mounted || action == null) return;
    setState(() {
      ctrl.text = applyAuthorDraft(
        current,
        draft,
        replace: action == 'replace',
      );
    });
  }

  Future<void> _pickPhoto({required bool avatar}) async {
    final picker = ImagePicker();
    final file = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1920,
      imageQuality: 85,
    );
    if (file == null || !mounted) return;
    setState(() {
      if (avatar) {
        _avatarFile = file;
      } else {
        _photoFile = file;
      }
    });
  }

  Future<String> _fileToBase64(XFile file) async {
    final bytes = await file.readAsBytes();
    return base64Encode(bytes);
  }

  String _mimeFor(XFile file) {
    final declared = file.mimeType?.trim().toLowerCase();
    if (declared != null && declared.startsWith('image/')) {
      if (declared == 'image/jpg') return 'image/jpeg';
      return declared;
    }
    final path = file.path.toLowerCase();
    final name = file.name.toLowerCase();
    final probe = '$path $name';
    if (probe.contains('.png')) return 'image/png';
    if (probe.contains('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  Future<void> _publish() async {
    final client = ref.read(nodeServiceProvider);
    final l10n = AppLocalizations.of(context);
    if (client == null) {
      setState(() => _error = l10n.commonNotConnectedHome);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    // Capture parent navigator before we pop this route — pushing with the
    // author screen's context after pop is unreliable.
    final navigator = Navigator.of(context);
    try {
      if (_template == 'profile') {
        final displayName = _displayNameCtrl.text.trim();
        final username = _titleCtrl.text.trim();
        if (displayName.isEmpty && username.isEmpty) {
          throw Exception(l10n.profileNameRequired);
        }
        if (_avatarFile != null) {
          await client.setPublicProfileThumbnail(
            contentBase64: await _fileToBase64(_avatarFile!),
            mimeType: _mimeFor(_avatarFile!),
          );
        }
        await client.updateHumanProfile({
          if (displayName.isNotEmpty) 'displayName': displayName,
          if (username.isNotEmpty) 'username': username,
          'bio': _bioCtrl.text,
        });
        final profile = await client.getHumanProfile();
        final ownerId = (profile['ownerId'] as String?) ?? '';
        final body = StringBuffer()
          ..writeln('# ${displayName.isNotEmpty ? displayName : username}')
          ..writeln()
          ..writeln(_bioCtrl.text.trim());
        final result = await client.publishWebContentEntry(
          template: 'profile',
          title: username.isNotEmpty ? username : displayName,
          visibility: 'public',
          body: body.toString(),
        );
        await client.syncProfileToBonds();
        if (!mounted) return;
        final browseUrl = result.url.isNotEmpty
            ? result.url
            : (ownerId.isNotEmpty ? 'envoy://$ownerId/' : null);
        navigator.pop(true);
        if (browseUrl != null) {
          await navigator.push(
            MaterialPageRoute(
              builder: (_) => BrowserScreen(initialUrl: browseUrl),
            ),
          );
        }
        return;
      }

      if (_template == 'photo') {
        final file = _photoFile;
        if (file == null) throw Exception(l10n.authorPickPhoto);
        final title = _titleCtrl.text.trim().isNotEmpty
            ? _titleCtrl.text.trim()
            : (file.name.isNotEmpty ? file.name : l10n.browserPhoto);
        final mime = _mimeFor(file);
        final ext = mime == 'image/png'
            ? 'png'
            : mime == 'image/webp'
                ? 'webp'
                : 'jpg';
        final result = await client.publishWebContentEntry(
          template: 'photo',
          title: title,
          visibility: _visibility,
          body: _bodyCtrl.text.trim().isEmpty ? null : _bodyCtrl.text.trim(),
          contentBase64: await _fileToBase64(file),
          mimeType: mime,
          fileName: file.name.isNotEmpty ? file.name : 'photo.$ext',
          gallery: 'wall',
        );
        if (!mounted) return;
        final browseUrl = result.listingUrl ??
            (result.url.isNotEmpty ? result.url : null);
        navigator.pop(true);
        if (browseUrl != null) {
          await navigator.push(
            MaterialPageRoute(
              builder: (_) => BrowserScreen(initialUrl: browseUrl),
            ),
          );
        }
        return;
      }

      // blog-post
      final title = _titleCtrl.text.trim();
      if (title.isEmpty) throw Exception(l10n.authorTitleRequired);
      final result = await client.publishWebContentEntry(
        template: 'blog-post',
        title: title,
        visibility: _visibility,
        body: _bodyCtrl.text,
      );
      if (!mounted) return;
      navigator.pop(true);
      if (result.url.isNotEmpty) {
        await navigator.push(
          MaterialPageRoute(
            builder: (_) => BrowserScreen(initialUrl: result.url),
          ),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.authorPublish),
        actions: [
          TextButton(
            onPressed: _busy ? null : _publish,
            child: _busy
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : Text(l10n.authorPublish),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Sites create is Blog-only. Profile / Photo open from Me with a
          // locked template (not offered as Sites types).
          if (_template == 'profile' || _template == 'photo')
            InputDecorator(
              decoration: InputDecoration(labelText: l10n.authorType),
              child: Text(
                _template == 'profile'
                    ? l10n.authorTypeProfile
                    : l10n.authorTypePhoto,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
            )
          else
            InputDecorator(
              decoration: InputDecoration(labelText: l10n.authorType),
              child: Text(l10n.authorTypeBlog),
            ),
          const SizedBox(height: 12),
          if (_template != 'profile')
            DropdownButtonFormField<String>(
              key: ValueKey('vis-$_visibility'),
              initialValue: _visibility,
              decoration: InputDecoration(labelText: l10n.feedVisibility),
              items: [
                DropdownMenuItem(
                  value: 'public',
                  child: Text(l10n.authorVisPublic),
                ),
                DropdownMenuItem(
                  value: 'bonded',
                  child: Text(l10n.authorVisBonded),
                ),
                DropdownMenuItem(
                  value: 'private',
                  child: Text(l10n.authorVisPrivate),
                ),
              ],
              onChanged: _busy
                  ? null
                  : (v) {
                      if (v != null) setState(() => _visibility = v);
                    },
            ),
          const SizedBox(height: 12),
          if (_template == 'profile') ...[
            TextField(
              controller: _displayNameCtrl,
              decoration: InputDecoration(labelText: l10n.meDisplayName),
              enabled: !_busy,
            ),
            const SizedBox(height: 8),
            TextField(
              controller: _titleCtrl,
              decoration: InputDecoration(labelText: l10n.profileUsername),
              enabled: !_busy,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: Text(l10n.profileBio)),
                AuthorAiDraftButton(
                  surface: 'bio',
                  existingText: () => _bioCtrl.text,
                  disabled: _busy,
                  onDraft: (d) => _applyDraft(_bioCtrl, d),
                ),
              ],
            ),
            TextField(
              controller: _bioCtrl,
              decoration: InputDecoration(labelText: l10n.profileBio),
              maxLines: 4,
              enabled: !_busy,
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _pickPhoto(avatar: true),
              icon: const Icon(Icons.face),
              label: Text(_avatarFile == null
                  ? l10n.authorChooseAvatar
                  : l10n.authorAvatarNamed(_avatarFile!.name)),
            ),
          ] else if (_template == 'photo') ...[
            TextField(
              controller: _titleCtrl,
              decoration: InputDecoration(labelText: l10n.authorTitle),
              enabled: !_busy,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: Text(l10n.authorCaption)),
                AuthorAiDraftButton(
                  surface: 'caption',
                  existingText: () => _bodyCtrl.text,
                  title: () => _titleCtrl.text,
                  disabled: _busy,
                  onDraft: (d) => _applyDraft(_bodyCtrl, d),
                ),
              ],
            ),
            TextField(
              controller: _bodyCtrl,
              decoration: InputDecoration(
                labelText: l10n.authorCaptionOptional,
              ),
              maxLines: 2,
              enabled: !_busy,
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              onPressed: _busy ? null : () => _pickPhoto(avatar: false),
              icon: const Icon(Icons.photo),
              label: Text(_photoFile == null
                  ? l10n.authorChoosePhoto
                  : l10n.authorPhotoNamed(_photoFile!.name)),
            ),
            if (_photoFile != null) ...[
              const SizedBox(height: 12),
                              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: FutureBuilder<Uint8List>(
                  future: _photoFile!.readAsBytes(),
                  builder: (context, snap) {
                    if (!snap.hasData) {
                      return const SizedBox(
                        height: 180,
                        child: Center(child: CircularProgressIndicator()),
                      );
                    }
                    return Image.memory(
                      snap.data!,
                      height: 180,
                      fit: BoxFit.cover,
                    );
                  },
                ),
              ),
            ],
          ] else ...[
            TextField(
              controller: _titleCtrl,
              decoration: InputDecoration(labelText: l10n.authorTitle),
              enabled: !_busy,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(child: Text(l10n.authorBody)),
                AuthorAiDraftButton(
                  surface: 'blog',
                  existingText: () => _bodyCtrl.text,
                  title: () => _titleCtrl.text,
                  disabled: _busy,
                  onDraft: (d) => _applyDraft(_bodyCtrl, d),
                ),
              ],
            ),
            TextField(
              controller: _bodyCtrl,
              decoration: InputDecoration(labelText: l10n.authorBodyMarkdown),
              maxLines: 12,
              enabled: !_busy,
            ),
          ],
          if (_error != null) ...[
            const SizedBox(height: 16),
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
