import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../l10n/app_localizations.dart';

import '../../providers/contact_provider.dart'
    show contactProvider, nodeServiceProvider;
import '../../providers/node_provider.dart';
import '../../providers/social_context_provider.dart'
    show phoneSocialBackendProvider, socialContextProvider;
import '../../services/feature_flags.dart';
import '../../services/product/library_read_cache.dart';
import '../../services/product/node_service_client.dart';
import '../../services/product/vault_content_fetch.dart';

/// Display name for the phone persona.
///
/// When paired, the phone is the same human on the mesh, so an unset phone name
/// falls back to the home profile's name instead of showing the "EnvoyGo"
/// placeholder. An explicit phone name still wins.
String effectivePhoneDisplayName({
  required String? phoneName,
  required String? homeName,
}) {
  final phone = phoneName?.trim() ?? '';
  if (phone.isNotEmpty) return phone;
  return homeName?.trim() ?? '';
}

/// Unified profile view / edit — same UX for Me and bonded contacts.
///
/// Self: view + edit display name, bio, username, avatar, and gallery photos.
/// Peer: read-only view of name / bio / avatar from cache + contacts.
class ProfileScreen extends ConsumerStatefulWidget {
  /// Null or matching self → home-node profile (editable).
  final String? ownerId;
  final bool startInEditMode;

  const ProfileScreen({
    super.key,
    this.ownerId,
    this.startInEditMode = false,
  });

  @override
  ConsumerState<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends ConsumerState<ProfileScreen> {
  bool _loading = true;
  bool _editing = false;
  bool _saving = false;
  String? _error;

  String? _ownerId;
  String _displayName = '';
  String _username = '';
  String _bio = '';
  Uint8List? _thumbBytes;
  List<_GalleryItem> _gallery = const [];

  final _displayNameCtrl = TextEditingController();
  final _usernameCtrl = TextEditingController();
  final _bioCtrl = TextEditingController();
  final _interestCtrl = TextEditingController();
  final _knowledgeCtrl = TextEditingController();
  XFile? _pendingAvatar;

  /// Published discovery interests. Without these the phone advertises only the
  /// broad `mesh.discovery` capability, so nobody can find it by interest.
  List<String> _hobbies = const [];
  List<String> _knowledge = const [];

  final _avatarKey = GlobalKey<_ProfileAvatarHostState>();

  /// Unpaired/phone persona: the profile lives on this phone, not on a home node.
  ///
  /// False while the mobile node feature is off — there is no phone persona to
  /// edit, so the screen follows the home/pair path instead.
  bool get _isPhonePersona =>
      ref.read(socialContextProvider).isPhone &&
      ref.read(mobileNodeEnabledProvider);

  bool get _isSelf {
    final target = widget.ownerId?.trim();
    if (target == null || target.isEmpty) return true;
    final self = _isPhonePersona
        ? ref.read(phoneSocialBackendProvider)?.ownerId.trim()
        : ref.read(nodeProvider).ownerId?.trim();
    return self != null && self == target;
  }

  static List<String> _stringList(Object? raw) => raw is List
      ? raw
          .map((e) => e.toString().trim())
          .where((e) => e.isNotEmpty)
          .toList(growable: false)
      : const <String>[];

  void _addInterest({required bool knowledge}) {
    final value = _interestCtrl.text.trim();
    if (value.isEmpty) return;
    setState(() {
      if (knowledge) {
        if (!_knowledge.contains(value)) _knowledge = [..._knowledge, value];
      } else if (!_hobbies.contains(value)) {
        _hobbies = [..._hobbies, value];
      }
      _interestCtrl.clear();
    });
  }

  void _removeInterest({required bool knowledge, required String value}) {
    setState(() {
      if (knowledge) {
        _knowledge = _knowledge.where((e) => e != value).toList();
      } else {
        _hobbies = _hobbies.where((e) => e != value).toList();
      }
    });
  }

  @override
  void initState() {
    super.initState();
    _editing = widget.startInEditMode;
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void dispose() {
    _displayNameCtrl.dispose();
    _usernameCtrl.dispose();
    _bioCtrl.dispose();
    _interestCtrl.dispose();
    _knowledgeCtrl.dispose();
    super.dispose();
  }

  Future<void> _load({bool bypassVaultCache = false}) async {
    // Phone persona (unpaired): the profile is stored on this phone and drives
    // phone-mesh discovery advertising — it must be editable without a home.
    if (_isPhonePersona && _isSelf) {
      await _loadPhoneSelf();
      return;
    }
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _loading = false;
        _error = AppLocalizations.of(context).commonNotConnectedHome;
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      if (_isSelf) {
        final profile = await client.getHumanProfile();
        final ownerId = (profile['ownerId'] as String?)?.trim() ?? '';
        final displayName = (profile['displayName'] as String?)?.trim() ?? '';
        final username = (profile['username'] as String?)?.trim() ?? '';
        final bio = (profile['bio'] as String?)?.trim() ?? '';
        final homePeerId =
            ref.read(nodeProvider).activeNode?.homePeerId.trim() ?? '';
        Uint8List? thumb;
        if (!bypassVaultCache && ownerId.isNotEmpty) {
          thumb = await LibraryReadCache.instance
              .peekBlob(peerThumbCacheKey(ownerId));
        }
        final pub = profile['publicThumbnail'];
        final path = pub is Map
            ? (pub['vaultRelativePath'] as String?)?.trim()
            : null;
        if (path != null && path.isNotEmpty) {
          try {
            final fetched = homePeerId.isNotEmpty
                ? await getOrFetchVaultContent(
                    ({required relativePath, int? maxBytes, int? offset}) =>
                        client.readLibraryItemContent(
                      relativePath: relativePath,
                      maxBytes: maxBytes,
                      offset: offset,
                    ),
                    homePeerId: homePeerId,
                    relativePath: path,
                    bypassCache: bypassVaultCache,
                  )
                : await fetchVaultContent(
                    ({required relativePath, int? maxBytes, int? offset}) =>
                        client.readLibraryItemContent(
                      relativePath: relativePath,
                      maxBytes: maxBytes,
                      offset: offset,
                    ),
                    relativePath: path,
                  );
            if (fetched.bytes.isNotEmpty) {
              thumb = fetched.bytes;
              if (ownerId.isNotEmpty) {
                await LibraryReadCache.instance.putBlob(
                  peerThumbCacheKey(ownerId),
                  thumb,
                  contentType:
                      (pub is Map ? pub['mimeType'] as String? : null) ??
                          fetched.mimeType,
                );
              }
            }
          } catch (_) {
            /* keep cache / empty */
          }
        }
        final gallery = <_GalleryItem>[];
        final rawGallery = profile['galleryPhotos'];
        if (rawGallery is List) {
          for (final g in rawGallery) {
            if (g is! Map) continue;
            final gPath = (g['vaultRelativePath'] as String?)?.trim();
            if (gPath == null || gPath.isEmpty) continue;
            try {
              final fetched = homePeerId.isNotEmpty
                  ? await getOrFetchVaultContent(
                      ({required relativePath, int? maxBytes, int? offset}) =>
                          client.readLibraryItemContent(
                        relativePath: relativePath,
                        maxBytes: maxBytes,
                        offset: offset,
                      ),
                      homePeerId: homePeerId,
                      relativePath: gPath,
                    )
                  : await fetchVaultContent(
                      ({required relativePath, int? maxBytes, int? offset}) =>
                          client.readLibraryItemContent(
                        relativePath: relativePath,
                        maxBytes: maxBytes,
                        offset: offset,
                      ),
                      relativePath: gPath,
                    );
              if (fetched.bytes.isEmpty) continue;
              gallery.add(_GalleryItem(
                photoId: (g['photoId'] as String?) ?? gPath,
                path: gPath,
                bytes: fetched.bytes,
                label: (g['label'] as String?)?.trim(),
              ));
            } catch (_) {
              /* skip broken gallery item */
            }
          }
        }
        if (!mounted) return;
        setState(() {
          _ownerId = ownerId;
          _displayName = displayName;
          _username = username;
          _bio = bio;
          _thumbBytes = thumb;
          _gallery = gallery;
          _displayNameCtrl.text = displayName;
          _usernameCtrl.text = username;
          _bioCtrl.text = bio;
          _loading = false;
        });
      } else {
        final ownerId = widget.ownerId!.trim();
        String displayName = '';
        String bio = '';
        final contacts = ref.read(contactProvider).bonds;
        for (final c in contacts) {
          if (c.ownerId == ownerId) {
            displayName = c.displayName?.trim() ?? '';
            break;
          }
        }
        Uint8List? thumb;
        final cached =
            await LibraryReadCache.instance.peekBlob(peerThumbCacheKey(ownerId));
        if (cached != null) {
          thumb = cached;
        }
        try {
          final row = await client.getPeerProfile(ownerId);
          final name = (row['displayName'] as String?)?.trim();
          if (name != null && name.isNotEmpty) displayName = name;
          final b = (row['bio'] as String?)?.trim();
          if (b != null) bio = b;
          final user = (row['username'] as String?)?.trim();
          if (user != null) _username = user;
          final b64 = row['thumbnailContentBase64'] as String?;
          if (b64 != null && b64.isNotEmpty) {
            thumb = base64Decode(b64);
            await LibraryReadCache.instance.putBlob(
              peerThumbCacheKey(ownerId),
              thumb,
              contentType: 'image/jpeg',
            );
          }
        } catch (_) {
          /* cache / contact fallback */
        }
        if (!mounted) return;
        setState(() {
          _ownerId = ownerId;
          _displayName = displayName.isNotEmpty
              ? displayName
              : ownerId.replaceFirst('envoy:owner:', '');
          _bio = bio;
          _thumbBytes = thumb;
          _gallery = const [];
          _loading = false;
        });
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
      return;
    }
  }

  Future<void> _pickAvatar() async {
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      imageQuality: 85,
    );
    if (file == null || !mounted) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _pendingAvatar = file;
      _thumbBytes = bytes;
    });
  }

  Future<void> _addGalleryPhoto() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final file = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: 1920,
      imageQuality: 85,
    );
    if (file == null) return;
    setState(() => _saving = true);
    try {
      final bytes = await file.readAsBytes();
      final mime = _mimeFor(file);
      await client.upsertProfileGalleryPhoto(
        contentBase64: base64Encode(bytes),
        mimeType: mime,
        visibility: 'public',
      );
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _removeGalleryPhoto(_GalleryItem item) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final l10n = AppLocalizations.of(ctx);
        return AlertDialog(
          title: Text(l10n.profileRemovePhotoTitle),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text(l10n.commonCancel),
            ),
            FilledButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: Text(l10n.commonRemove),
            ),
          ],
        );
      },
    );
    if (ok != true) return;
    setState(() => _saving = true);
    try {
      await client.removeProfileGalleryPhoto(vaultRelativePath: item.path);
      final homePeerId =
          ref.read(nodeProvider).activeNode?.homePeerId.trim() ?? '';
      if (homePeerId.isNotEmpty) {
        await LibraryReadCache.instance
            .invalidateBlob(vaultCacheKey(homePeerId, item.path));
      }
      await _load();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _mimeFor(XFile file) {
    final declared = file.mimeType?.trim().toLowerCase();
    if (declared != null && declared.startsWith('image/')) {
      if (declared == 'image/jpg') return 'image/jpeg';
      return declared;
    }
    final probe = '${file.path} ${file.name}'.toLowerCase();
    if (probe.contains('.png')) return 'image/png';
    if (probe.contains('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  /// Load the phone persona's own profile (no home node required).
  Future<void> _loadPhoneSelf() async {
    final backend = ref.read(phoneSocialBackendProvider);
    setState(() {
      _loading = true;
      _error = null;
    });
    if (backend == null) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = AppLocalizations.of(context).commonNotConnectedHome;
      });
      return;
    }
    Map<String, dynamic> profile = const {};
    try {
      profile = await backend.getHumanProfile() ?? const {};
    } catch (_) {
      /* fall through to the "not set up yet" state */
    }
    // An unsaved profile comes back with a display default — keep the fields
    // empty so setup reads as setup, not as an already-chosen name.
    final saved = backend.hasProfile;
    final phoneName =
        saved ? (profile['displayName'] as String?)?.trim() ?? '' : '';

    // Paired: this phone is the same human, so borrow the home identity's
    // photo (and name when the phone has none of its own) instead of showing
    // initials on one page and a photo on the other.
    String? homeName;
    Uint8List? homeThumb;
    final homeClient = ref.read(nodeServiceProvider);
    // Only the *owner* profile's face may be borrowed: a family member using
    // this phone must not be shown the owner's photo on their own page.
    if (_isPhonePersona &&
        homeClient != null &&
        ref.read(nodeProvider).isOwnerProfile) {
      try {
        final homeProfile = await homeClient.getHumanProfile();
        homeName = (homeProfile['displayName'] as String?)?.trim();
        homeThumb = await _loadHomeThumbnail(homeClient, homeProfile);
      } catch (_) {
        /* unpaired/degraded: fall back to initials */
      }
    }
    final displayName =
        effectivePhoneDisplayName(phoneName: phoneName, homeName: homeName);
    final username =
        saved ? (profile['username'] as String?)?.trim() ?? '' : '';
    final bio = saved ? (profile['bio'] as String?)?.trim() ?? '' : '';
    if (!mounted) return;
    setState(() {
      _ownerId = backend.ownerId;
      _displayName = displayName;
      _username = username;
      _bio = bio;
      _hobbies = _stringList(profile['hobbies']);
      _knowledge = _stringList(profile['knowledge']);
      _displayNameCtrl.text = displayName;
      _usernameCtrl.text = username;
      _bioCtrl.text = bio;
      _thumbBytes = homeThumb;
      _gallery = const [];
      _loading = false;
    });
  }

  /// Cached home-profile thumbnail bytes, or fetch them from the home vault.
  ///
  /// Reuses the same cache key the home profile screen uses, so the two pages
  /// cannot disagree about which photo is current.
  Future<Uint8List?> _loadHomeThumbnail(
    NodeServiceClient client,
    Map<String, dynamic> homeProfile,
  ) async {
    final ownerId = (homeProfile['ownerId'] as String?)?.trim() ?? '';
    final thumb = homeProfile['publicThumbnail'];
    final path = thumb is Map ? (thumb['vaultRelativePath'] as String?)?.trim() : null;
    if (ownerId.isNotEmpty) {
      final cached =
          await LibraryReadCache.instance.peekBlob(peerThumbCacheKey(ownerId));
      if (cached != null && cached.isNotEmpty) return cached;
    }
    if (path == null || path.isEmpty) return null;
    try {
      final homePeerId = ref.read(nodeProvider).activeNode?.homePeerId.trim() ?? '';
      final fetched = homePeerId.isNotEmpty
          ? await getOrFetchVaultContent(
              ({required relativePath, int? maxBytes, int? offset}) =>
                  client.readLibraryItemContent(
                relativePath: relativePath,
                maxBytes: maxBytes,
                offset: offset,
              ),
              homePeerId: homePeerId,
              relativePath: path,
            )
          : await fetchVaultContent(
              ({required relativePath, int? maxBytes, int? offset}) =>
                  client.readLibraryItemContent(
                relativePath: relativePath,
                maxBytes: maxBytes,
                offset: offset,
              ),
              relativePath: path,
            );
      if (fetched.bytes.isEmpty) return null;
      if (ownerId.isNotEmpty) {
        await LibraryReadCache.instance.putBlob(
          peerThumbCacheKey(ownerId),
          fetched.bytes,
          contentType: (thumb is Map ? thumb['mimeType'] as String? : null) ??
              fetched.mimeType,
        );
      }
      return fetched.bytes;
    } catch (_) {
      return null;
    }
  }

  Future<void> _save() async {
    final isPhone = _isPhonePersona;
    final displayName = _displayNameCtrl.text.trim();
    final username = _usernameCtrl.text.trim();
    if (displayName.isEmpty && username.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).profileNameRequired)),
      );
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      if (isPhone) {
        // Phone persona: persist locally and let the next checkin advertise
        // these interests (computePhoneDiscoveryTopics reads this profile).
        final backend = ref.read(phoneSocialBackendProvider);
        if (backend == null) {
          throw StateError('Phone profile storage is unavailable');
        }
        await backend.updateHumanProfile({
          if (displayName.isNotEmpty) 'displayName': displayName,
          if (username.isNotEmpty) 'username': username,
          'bio': _bioCtrl.text,
          'hobbies': _hobbies,
          'knowledge': _knowledge,
          'profileVisibility': 'public',
        });
        _pendingAvatar = null;
        if (!mounted) return;
        setState(() => _editing = false);
        await _load();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).profileSaved)),
        );
        return;
      }
      // Home persona from here on: needs the home node RPC client.
      final client = ref.read(nodeServiceProvider);
      if (client == null) {
        if (mounted) setState(() => _saving = false);
        return;
      }
      String? avatarVaultPath;
      if (_pendingAvatar != null) {
        final bytes = await _pendingAvatar!.readAsBytes();
        await client.setPublicProfileThumbnail(
          contentBase64: base64Encode(bytes),
          mimeType: _mimeFor(_pendingAvatar!),
        );
        // Same vault path is reused — drop stale disk/memory thumb.
        final homePeerId =
            ref.read(nodeProvider).activeNode?.homePeerId.trim() ?? '';
        final ownerId = _ownerId?.trim() ??
            ref.read(nodeProvider).ownerId?.trim() ??
            '';
        final profile = await client.getHumanProfile();
        final pub = profile['publicThumbnail'];
        avatarVaultPath = pub is Map
            ? (pub['vaultRelativePath'] as String?)?.trim()
            : null;
        if (homePeerId.isNotEmpty &&
            avatarVaultPath != null &&
            avatarVaultPath.isNotEmpty) {
          await LibraryReadCache.instance
              .invalidateBlob(vaultCacheKey(homePeerId, avatarVaultPath));
        }
        if (ownerId.isNotEmpty) {
          await LibraryReadCache.instance
              .invalidateBlob(peerThumbCacheKey(ownerId));
        }
      }
      await client.updateHumanProfile({
        if (displayName.isNotEmpty) 'displayName': displayName,
        if (username.isNotEmpty) 'username': username,
        'bio': _bioCtrl.text,
        'hobbies': _hobbies,
        'knowledge': _knowledge,
      });
      await client.syncProfileToBonds();
      _pendingAvatar = null;
      if (!mounted) return;
      setState(() => _editing = false);
      await _load(bypassVaultCache: avatarVaultPath != null);
      _avatarKey.currentState?.reload();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).profileSaved)),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final title = _isSelf
        ? l10n.profileMyTitle
        : (_displayName.isNotEmpty ? _displayName : l10n.profileTitle);

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar(
            expandedHeight: 200,
            pinned: true,
            stretch: true,
            actions: [
              if (_isSelf && !_editing)
                IconButton(
                  tooltip: l10n.commonEdit,
                  onPressed: _loading
                      ? null
                      : () => setState(() => _editing = true),
                  icon: const Icon(Icons.edit_outlined),
                ),
              if (_isSelf && _editing) ...[
                TextButton(
                  onPressed: _saving
                      ? null
                      : () {
                          setState(() {
                            _editing = false;
                            _displayNameCtrl.text = _displayName;
                            _usernameCtrl.text = _username;
                            _bioCtrl.text = _bio;
                            _pendingAvatar = null;
                          });
                          _load();
                        },
                  child: Text(l10n.commonCancel),
                ),
                TextButton(
                  onPressed: _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : Text(l10n.commonSave),
                ),
              ],
            ],
            flexibleSpace: FlexibleSpaceBar(
              background: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      scheme.primary.withValues(alpha: 0.85),
                      scheme.tertiary.withValues(alpha: 0.75),
                      scheme.surface,
                    ],
                    stops: const [0, 0.45, 1],
                  ),
                ),
                child: SafeArea(
                  child: Center(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        const SizedBox(height: 28),
                        GestureDetector(
                          // Phone persona: the photo follows the home profile
                          // (see _loadPhoneSelf), so there is nothing local to pick.
                          onTap: _isSelf && _editing && !_isPhonePersona
                              ? _pickAvatar
                              : null,
                          child: Stack(
                            alignment: Alignment.bottomRight,
                            children: [
                              _ProfileAvatarHost(
                                key: _avatarKey,
                                radius: 48,
                                bytes: _thumbBytes,
                                displayName: _displayName.isNotEmpty
                                    ? _displayName
                                    : _username,
                                ownerId: _ownerId,
                                isSelf: _isSelf,
                              ),
                              if (_isSelf && _editing && !_isPhonePersona)
                                Container(
                                  padding: const EdgeInsets.all(6),
                                  decoration: BoxDecoration(
                                    color: scheme.surface,
                                    shape: BoxShape.circle,
                                    boxShadow: [
                                      BoxShadow(
                                        color: Colors.black.withValues(alpha: 0.2),
                                        blurRadius: 6,
                                      ),
                                    ],
                                  ),
                                  child: Icon(
                                    Icons.camera_alt_outlined,
                                    size: 16,
                                    color: scheme.primary,
                                  ),
                                ),
                            ],
                          ),
                        ),
                        if (_isPhonePersona && _thumbBytes != null) ...[
                          const SizedBox(height: 8),
                          Text(
                            l10n.profilePhotoFromHome,
                            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: scheme.onPrimary.withValues(alpha: 0.85),
                                ),
                          ),
                        ],
                        const SizedBox(height: 12),
                        Text(
                          title,
                          style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                fontWeight: FontWeight.w800,
                                color: scheme.onPrimary,
                                shadows: [
                                  Shadow(
                                    color: Colors.black.withValues(alpha: 0.25),
                                    blurRadius: 8,
                                  ),
                                ],
                              ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          if (_loading)
            const SliverFillRemaining(
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null && _displayName.isEmpty && !_isSelf)
            SliverFillRemaining(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(_error!, textAlign: TextAlign.center),
                ),
              ),
            )
          else
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
              sliver: SliverList(
                delegate: SliverChildListDelegate([
                  if (_error != null) ...[
                    Material(
                      color: scheme.errorContainer,
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Text(
                          _error!,
                          style: TextStyle(color: scheme.onErrorContainer),
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                  if (_editing) ...[
                    TextField(
                      controller: _displayNameCtrl,
                      decoration: InputDecoration(
                        labelText: l10n.meDisplayName,
                        border: const OutlineInputBorder(),
                      ),
                      textCapitalization: TextCapitalization.words,
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _usernameCtrl,
                      decoration: InputDecoration(
                        labelText: l10n.profileUsername,
                        border: const OutlineInputBorder(),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _bioCtrl,
                      decoration: InputDecoration(
                        labelText: l10n.profileBio,
                        border: const OutlineInputBorder(),
                        alignLabelWithHint: true,
                      ),
                      maxLines: 4,
                      minLines: 3,
                    ),
                    const SizedBox(height: 16),
                    // Interests are what peers search for: each entry is
                    // published as an `interest:<slug>` topic (phone mesh and
                    // home node alike), so an empty list means nobody can find
                    // this profile by topic.
                    Text(
                      l10n.peopleInterest,
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    const SizedBox(height: 8),
                    _InterestEditor(
                      values: _hobbies,
                      hint: l10n.profileHobbiesHint,
                      onAdd: () => _addInterest(knowledge: false),
                      onRemove: (v) =>
                          _removeInterest(knowledge: false, value: v),
                      controller: _interestCtrl,
                      addLabel: l10n.commonAdd,
                    ),
                    const SizedBox(height: 12),
                    Text(
                      l10n.contentKnowledge,
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                    const SizedBox(height: 8),
                    _InterestEditor(
                      values: _knowledge,
                      hint: l10n.profileKnowledgeHint,
                      onAdd: () => _addInterest(knowledge: true),
                      onRemove: (v) =>
                          _removeInterest(knowledge: true, value: v),
                      controller: _knowledgeCtrl,
                      addLabel: l10n.commonAdd,
                    ),
                  ] else ...[
                    Text(
                      _displayName.isNotEmpty ? _displayName : l10n.profileUnnamed,
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3,
                          ),
                    ),
                    if (_hobbies.isNotEmpty || _knowledge.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Wrap(
                        spacing: 6,
                        runSpacing: 6,
                        children: [
                          for (final v in [..._hobbies, ..._knowledge])
                            Chip(
                              label: Text(v),
                              visualDensity: VisualDensity.compact,
                            ),
                        ],
                      ),
                    ],
                    if (_username.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text(
                        '@$_username',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                      ),
                    ],
                    if (_bio.isNotEmpty) ...[
                      const SizedBox(height: 16),
                      Text(
                        _bio,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                              height: 1.45,
                            ),
                      ),
                    ] else if (_isSelf) ...[
                      const SizedBox(height: 16),
                      Text(
                        l10n.profileBioHint,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                      ),
                    ],
                  ],
                  const SizedBox(height: 28),
                  Row(
                    children: [
                      Text(
                        l10n.profilePhotos,
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                      const Spacer(),
                      if (_isSelf)
                        TextButton.icon(
                          onPressed: _saving ? null : _addGalleryPhoto,
                          icon: const Icon(Icons.add_photo_alternate_outlined, size: 18),
                          label: Text(l10n.commonAdd),
                        ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_gallery.isEmpty)
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.symmetric(vertical: 28),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: scheme.outlineVariant.withValues(alpha: 0.7),
                        ),
                      ),
                      child: Column(
                        children: [
                          Icon(
                            Icons.photo_library_outlined,
                            size: 36,
                            color: scheme.onSurfaceVariant,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            _isSelf
                                ? l10n.profileNoPhotosYet
                                : l10n.profileNoPhotosShared,
                            style: TextStyle(color: scheme.onSurfaceVariant),
                          ),
                        ],
                      ),
                    )
                  else
                    GridView.builder(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      itemCount: _gallery.length,
                      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                        crossAxisCount: 3,
                        mainAxisSpacing: 8,
                        crossAxisSpacing: 8,
                      ),
                      itemBuilder: (context, index) {
                        final item = _gallery[index];
                        return GestureDetector(
                          onLongPress: _isSelf
                              ? () => _removeGalleryPhoto(item)
                              : null,
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(12),
                            child: Image.memory(item.bytes, fit: BoxFit.cover),
                          ),
                        );
                      },
                    ),
                  if (_isSelf && _gallery.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      l10n.profileLongPressRemove,
                      style: Theme.of(context).textTheme.labelSmall?.copyWith(
                            color: scheme.onSurfaceVariant,
                          ),
                    ),
                  ],
                ]),
              ),
            ),
        ],
      ),
    );
  }
}

class _GalleryItem {
  final String photoId;
  final String path;
  final Uint8List bytes;
  final String? label;

  const _GalleryItem({
    required this.photoId,
    required this.path,
    required this.bytes,
    this.label,
  });
}

/// Local avatar that can show pending bytes without waiting on network reload.
class _ProfileAvatarHost extends StatefulWidget {
  final double radius;
  final Uint8List? bytes;
  final String? displayName;
  final String? ownerId;
  final bool isSelf;

  const _ProfileAvatarHost({
    super.key,
    required this.radius,
    this.bytes,
    this.displayName,
    this.ownerId,
    required this.isSelf,
  });

  @override
  State<_ProfileAvatarHost> createState() => _ProfileAvatarHostState();
}

class _ProfileAvatarHostState extends State<_ProfileAvatarHost> {
  void reload() => setState(() {});

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final name = widget.displayName?.trim() ?? '';
    final initial = name.isNotEmpty
        ? name[0].toUpperCase()
        : (widget.ownerId?.replaceFirst('envoy:owner:', '').isNotEmpty == true
            ? widget.ownerId!.replaceFirst('envoy:owner:', '')[0].toUpperCase()
            : '?');
    if (widget.bytes != null) {
      return CircleAvatar(
        radius: widget.radius,
        backgroundImage: MemoryImage(widget.bytes!),
      );
    }
    return CircleAvatar(
      radius: widget.radius,
      backgroundColor: scheme.onPrimary.withValues(alpha: 0.2),
      foregroundColor: scheme.onPrimary,
      child: Text(
        initial,
        style: TextStyle(
          fontWeight: FontWeight.w800,
          fontSize: widget.radius * 0.7,
        ),
      ),
    );
  }
}


/// Chip list + input for profile interests (hobbies / knowledge).
class _InterestEditor extends StatelessWidget {
  const _InterestEditor({
    required this.values,
    required this.hint,
    required this.onAdd,
    required this.onRemove,
    required this.controller,
    required this.addLabel,
  });

  final List<String> values;
  final String hint;
  final VoidCallback onAdd;
  final void Function(String value) onRemove;
  final TextEditingController controller;
  final String addLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (values.isNotEmpty)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final v in values)
                  InputChip(
                    label: Text(v),
                    visualDensity: VisualDensity.compact,
                    onDeleted: () => onRemove(v),
                  ),
              ],
            ),
          ),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: controller,
                decoration: InputDecoration(
                  hintText: hint,
                  border: const OutlineInputBorder(),
                  isDense: true,
                ),
                textInputAction: TextInputAction.done,
                onSubmitted: (_) => onAdd(),
              ),
            ),
            const SizedBox(width: 8),
            TextButton(onPressed: onAdd, child: Text(addLabel)),
          ],
        ),
      ],
    );
  }
}
