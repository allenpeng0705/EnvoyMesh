import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../models/contact.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../browser/browser_screen.dart';
import 'published_content_sheet.dart';

/// Content → Explore (Following): browse bonded contacts' published pages.
class ContentExploreTab extends ConsumerStatefulWidget {
  const ContentExploreTab({super.key});

  @override
  ConsumerState<ContentExploreTab> createState() => _ContentExploreTabState();
}

class _ContentExploreTabState extends ConsumerState<ContentExploreTab> {
  List<Contact> _contacts = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _reload());
  }

  Future<void> _reload() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      setState(() {
        _loading = false;
        _error = 'Connect to a home node to explore Content.';
      });
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await client.ensureDefaultWebSite();
      final bonds = await client.getBonds();
      final nodeState = ref.read(nodeProvider);
      if (!mounted) return;
      setState(() {
        _contacts = filterSelfBonds(bonds, nodeState.ownerId)
            .where((c) =>
                c.bondLevel != 'blocked' && c.ownerId.startsWith('envoy:owner:'))
            .toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final nodeState = ref.watch(nodeProvider);
    if (nodeState.activeNode == null) {
      return const Center(
        child: Padding(
          padding: EdgeInsets.all(24),
          child: Text(
            'Pair with a home node to explore published pages.',
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(_error!, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              FilledButton(onPressed: _reload, child: const Text('Retry')),
            ],
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: _reload,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  'Following',
                  style: Theme.of(context).textTheme.titleMedium,
                ),
              ),
              IconButton(
                tooltip: 'Open link',
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const BrowserScreen()),
                  );
                },
                icon: const Icon(Icons.link),
              ),
            ],
          ),
          Text(
            'Published pages from bonded contacts. Use Open for an envoy:// link.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
          const SizedBox(height: 12),
          if (_contacts.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 16),
              child: Text('No bonded contacts yet.'),
            )
          else
            ..._contacts.map(
              (c) => ListTile(
                contentPadding: EdgeInsets.zero,
                leading: CircleAvatar(
                  child: Text(_initial(c.displayName ?? c.ownerId)),
                ),
                title: Text(c.displayName?.trim().isNotEmpty == true
                    ? c.displayName!
                    : c.ownerId),
                subtitle: Text(c.bondLevel),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => showPublishedContentSheet(
                  context,
                  ownerId: c.ownerId,
                  displayName: c.displayName,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

String _initial(String value) {
  final t = value.trim();
  if (t.isEmpty) return '?';
  return t.substring(0, 1).toUpperCase();
}
