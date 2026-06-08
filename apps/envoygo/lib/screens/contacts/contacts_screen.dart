import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../../widgets/contact_tile.dart';
import '../chat/chat_detail_screen.dart';

/// Bonded contacts list.
class ContactsScreen extends ConsumerWidget {
  const ContactsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final contactState = ref.watch(contactProvider);
    final bonds = contactState.bonds;

    if (bonds.isEmpty) {
      return ListView(
        children: [
          Padding(
            padding: const EdgeInsets.all(12),
            child: SearchBar(
              hintText: 'Search contacts...',
              leading: const Icon(Icons.search),
              onChanged: (_) {},
            ),
          ),
          const Padding(
            padding: EdgeInsets.only(top: 80),
            child: Center(
              child: Column(
                children: [
                  Icon(Icons.people_outline, size: 64,
                      color: Colors.grey),
                  SizedBox(height: 16),
                  Text(
                    'No contacts yet',
                    style:
                        TextStyle(fontSize: 18, color: Colors.grey),
                  ),
                  SizedBox(height: 8),
                  Text(
                    'Your bonded contacts will appear here.',
                    style: TextStyle(color: Colors.grey),
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
            hintText: 'Search contacts...',
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
