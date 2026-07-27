import 'dart:convert';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../providers/contact_provider.dart' show nodeServiceProvider;
import '../providers/node_provider.dart';
import '../services/library_read_cache.dart';
import '../services/vault_content_fetch.dart';

/// Circle avatar for self (vault thumbnail) or a peer (`getPeerProfile`).
class ProfileAvatar extends ConsumerStatefulWidget {
  final String? ownerId;
  final String? displayName;
  final double radius;
  final bool isSelf;

  const ProfileAvatar({
    super.key,
    this.ownerId,
    this.displayName,
    this.radius = 40,
    this.isSelf = false,
  });

  @override
  ConsumerState<ProfileAvatar> createState() => _ProfileAvatarState();
}

class _ProfileAvatarState extends ConsumerState<ProfileAvatar> {
  Uint8List? _bytes;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  @override
  void didUpdateWidget(covariant ProfileAvatar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.ownerId != widget.ownerId ||
        oldWidget.isSelf != widget.isSelf) {
      _bytes = null;
      _load();
    }
  }

  /// Reload after the user changes their thumbnail.
  void reload({bool bypassCache = false}) => _load(bypassCache: bypassCache);

  Future<void> _load({bool bypassCache = false}) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || _loading) return;
    setState(() => _loading = true);
    try {
      if (widget.isSelf) {
        final profile = await client.getHumanProfile();
        final thumb = profile['publicThumbnail'];
        final path = thumb is Map
            ? (thumb['vaultRelativePath'] as String?)?.trim()
            : null;
        final ownerId = (profile['ownerId'] as String?)?.trim();
        if (!bypassCache && ownerId != null && ownerId.isNotEmpty) {
          final cached =
              await LibraryReadCache.instance.peekBlob(peerThumbCacheKey(ownerId));
          if (cached != null && mounted) {
            setState(() => _bytes = cached);
          }
        }
        if (path != null && path.isNotEmpty) {
          final homePeerId =
              ref.read(nodeProvider).activeNode?.homePeerId.trim() ?? '';
          late final VaultContentResult fetched;
          if (homePeerId.isNotEmpty) {
            fetched = await getOrFetchVaultContent(
              ({required relativePath, int? maxBytes, int? offset}) =>
                  client.readLibraryItemContent(
                relativePath: relativePath,
                maxBytes: maxBytes,
                offset: offset,
              ),
              homePeerId: homePeerId,
              relativePath: path,
              bypassCache: bypassCache,
            );
          } else {
            fetched = await fetchVaultContent(
              ({required relativePath, int? maxBytes, int? offset}) =>
                  client.readLibraryItemContent(
                relativePath: relativePath,
                maxBytes: maxBytes,
                offset: offset,
              ),
              relativePath: path,
            );
          }
          if (fetched.bytes.isNotEmpty) {
            if (ownerId != null && ownerId.isNotEmpty) {
              await LibraryReadCache.instance.putBlob(
                peerThumbCacheKey(ownerId),
                fetched.bytes,
                contentType: (thumb is Map ? thumb['mimeType'] as String? : null) ??
                    fetched.mimeType,
              );
            }
            if (mounted) setState(() => _bytes = fetched.bytes);
            return;
          }
        }
      }

      final ownerId = widget.ownerId?.trim();
      if (ownerId == null || ownerId.isEmpty) return;

      final cached =
          await LibraryReadCache.instance.peekBlob(peerThumbCacheKey(ownerId));
      if (cached != null) {
        if (mounted) setState(() => _bytes = cached);
        return;
      }

      final row = await client.getPeerProfile(ownerId);
      final b64 = row['thumbnailContentBase64'] as String?;
      if (b64 != null && b64.isNotEmpty) {
        final bytes = base64Decode(b64);
        await LibraryReadCache.instance.putBlob(
          peerThumbCacheKey(ownerId),
          bytes,
          contentType: 'image/jpeg',
        );
        if (mounted) setState(() => _bytes = bytes);
      }
    } catch (_) {
      // Best-effort — fall back to initial.
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String get _initial {
    final name = widget.displayName?.trim();
    if (name != null && name.isNotEmpty) return name[0].toUpperCase();
    final id = widget.ownerId?.trim() ?? '';
    if (id.isNotEmpty) {
      final short = id.replaceFirst('envoy:owner:', '');
      return short.isNotEmpty ? short[0].toUpperCase() : '?';
    }
    return '?';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return CircleAvatar(
      radius: widget.radius,
      backgroundColor: scheme.primaryContainer,
      foregroundColor: scheme.onPrimaryContainer,
      backgroundImage: _bytes != null ? MemoryImage(_bytes!) : null,
      child: _bytes == null
          ? Text(
              _initial,
              style: TextStyle(
                fontWeight: FontWeight.w700,
                fontSize: widget.radius * 0.7,
              ),
            )
          : null,
    );
  }
}
