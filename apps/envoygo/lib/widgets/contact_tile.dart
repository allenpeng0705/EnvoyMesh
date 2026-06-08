import 'package:flutter/material.dart';
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
    final isOnline = contact.lastSeen != null &&
        DateTime.now().difference(contact.lastSeen!).inMinutes < 5;

    return ListTile(
      leading: Stack(
        children: [
          CircleAvatar(
            child: Text(
              (contact.displayName ?? '?')[0].toUpperCase(),
            ),
          ),
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
        child: const Text('Chat'),
      ),
      onTap: onTap,
    );
  }
}
