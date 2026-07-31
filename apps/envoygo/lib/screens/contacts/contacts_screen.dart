import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../../widgets/contact_tile.dart';
import '../chat/chat_detail_screen.dart';
import '../profile/profile_screen.dart';

/// Bonded contacts list.
class ContactsScreen extends ConsumerWidget {
  const ContactsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final contactState = ref.watch(contactProvider);
    final bonds = contactState.bonds;

    if (bonds.isEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: SearchBar(
              hintText: l10n.contactsSearchHint,
              leading: const Icon(Icons.search),
              onChanged: (_) {},
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(top: 80),
            child: Center(
              child: Column(
                children: [
                  const Icon(Icons.people_outline, size: 64,
                      color: Colors.grey),
                  const SizedBox(height: 16),
                  Text(
                    l10n.contactsEmpty,
                    style:
                        const TextStyle(fontSize: 18, color: Colors.grey),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    l10n.contactsEmptyHint,
                    style: const TextStyle(color: Colors.grey),
                  ),
                ],
              ),
            ),
          ),
        ],
      );
    }

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: SearchBar(
            hintText: l10n.contactsSearchHint,
            leading: const Icon(Icons.search),
            onChanged: (_) {},
          ),
        ),
        Expanded(
          child: ListView.builder(
            itemCount: bonds.length,
            itemBuilder: (context, index) {
              final contact = bonds[index];
              return ContactTile(
                contact: contact,
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ProfileScreen(ownerId: contact.ownerId),
                    ),
                  );
                },
                onChat: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => ChatDetailScreen(
                        threadId: '${ref.read(nodeProvider).activeNode?.id}:${contact.ownerId}',
                        displayName:
                            contact.displayName ?? contact.ownerId,
                        contactOwnerId: contact.ownerId,
                      ),
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
  }
}
