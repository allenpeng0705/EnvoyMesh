import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/contact.dart';
import '../providers/contact_reachability_provider.dart';
import '../widgets/contact_reachability_badge.dart';

/// Contact tile for the contacts list.
class ContactTile extends ConsumerWidget {
  final Contact contact;
  final VoidCallback? onTap;
  final VoidCallback? onChat;

  const ContactTile({
    super.key,
    required this.contact,
    this.onTap,
    this.onChat,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reachability = ref.watch(contactReachabilityProvider);
    final info = reachability.infoFor(contact.ownerId);
    final checking = reachability.isChecking(contact.ownerId);

    return ListTile(
      leading: Stack(
        clipBehavior: Clip.none,
        children: [
          _buildAvatar(contact),
          Positioned(
            right: -1,
            bottom: -1,
            child: ContactReachabilityBadge(
              info: info,
              checking: checking,
              compact: true,
            ),
          ),
        ],
      ),
      title: Text(contact.displayName ?? contact.ownerId),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (contact.displayName != null) Text(contact.ownerId),
          ContactReachabilityBadge(info: info, checking: checking),
        ],
      ),
      trailing: TextButton(
        onPressed: onChat,
        child: const Text('Chat'),
      ),
      onTap: onTap,
    );
  }

  /// Build avatar from URL or fallback to letter.
  static Widget _buildAvatar(Contact contact) {
    final radius = 20.0;
    final avatarUrl = contact.avatarUrl;
    if (avatarUrl != null && avatarUrl.isNotEmpty) {
      if (avatarUrl.startsWith('data:image')) {
        return CircleAvatar(
          radius: radius,
          backgroundImage: MemoryImage(
            // Strip data URI prefix.
            _dataUriToBytes(avatarUrl),
          ),
        );
      }
      return CircleAvatar(
        radius: radius,
        backgroundImage: NetworkImage(avatarUrl),
      );
    }
    return CircleAvatar(
      radius: radius,
      child: Text(
        (contact.displayName ?? contact.ownerId)[0].toUpperCase(),
      ),
    );
  }

  static Uint8List _dataUriToBytes(String uri) {
    final commaIdx = uri.indexOf(',');
    if (commaIdx < 0) return Uint8List(0);
    return base64Decode(uri.substring(commaIdx + 1));
  }
}
