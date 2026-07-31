import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import '../models/contact.dart';

/// Contact tile for the contacts list.
class ContactTile extends StatelessWidget {
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
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final isOnline = contact.lastSeen != null &&
        DateTime.now().difference(contact.lastSeen!).inMinutes < 5;

    return ListTile(
      leading: Stack(
        children: [
          _buildAvatar(contact),
          if (isOnline)
            Positioned(
              right: 0,
              bottom: 0,
              child: Container(
                width: 12,
                height: 12,
                decoration: const BoxDecoration(
                  color: Colors.green,
                  shape: BoxShape.circle,
                ),
              ),
            ),
        ],
      ),
      title: Text(contact.displayName ?? contact.ownerId),
      subtitle: contact.displayName != null ? Text(contact.ownerId) : null,
      trailing: TextButton(
        onPressed: onChat,
        child: Text(l10n.contactsChat),
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

