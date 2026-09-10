import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../models/contact.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../../services/feature_flags.dart';
import '../../widgets/contact_tile.dart';
import '../chat/chat_detail_screen.dart';
import '../profile/profile_screen.dart';

/// Bonded contacts — Home section (when paired) + On this phone section.
class ContactsScreen extends ConsumerWidget {
  const ContactsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = AppLocalizations.of(context);
    final contactState = ref.watch(contactProvider);
    final homeId = ref.watch(nodeProvider).activeNode?.id;
    final homeBonds = contactState.homeBonds;
    // Phone-plane contacts only exist while the mobile node is enabled.
    final phoneBonds = ref.watch(mobileNodeEnabledProvider)
        ? contactState.phoneBonds
        : const <Contact>[];
    final empty = homeBonds.isEmpty && phoneBonds.isEmpty;

    if (empty) {
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
                  const Icon(Icons.people_outline, size: 64, color: Colors.grey),
                  const SizedBox(height: 16),
                  Text(
                    l10n.contactsEmpty,
                    style: const TextStyle(fontSize: 18, color: Colors.grey),
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
          child: ListView(
            children: [
              if (homeId != null && homeBonds.isNotEmpty) ...[
                _SectionHeader(l10n.chatsSectionHomeContacts),
                ...homeBonds.map(
                  (c) => ContactTile(
                    contact: c,
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => ProfileScreen(ownerId: c.ownerId),
                        ),
                      );
                    },
                    onChat: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => ChatDetailScreen(
                            threadId: '$homeId:${c.ownerId}',
                            displayName: c.displayName ?? c.ownerId,
                            contactOwnerId: c.ownerId,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
              if (phoneBonds.isNotEmpty) ...[
                _SectionHeader(l10n.chatsSectionPhoneContacts),
                ...phoneBonds.map(
                  (c) => ContactTile(
                    contact: c,
                    onTap: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => ProfileScreen(ownerId: c.ownerId),
                        ),
                      );
                    },
                    onChat: () {
                      Navigator.of(context).push(
                        MaterialPageRoute(
                          builder: (_) => ChatDetailScreen(
                            threadId: phoneDmThreadId(c.ownerId),
                            displayName: c.displayName ?? c.ownerId,
                            contactOwnerId: c.ownerId,
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
      child: Text(title, style: Theme.of(context).textTheme.titleSmall),
    );
  }
}
