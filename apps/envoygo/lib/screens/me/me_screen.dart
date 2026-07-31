import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../../models/stored_node.dart';
import '../../providers/contact_provider.dart' show nodeServiceProvider;
import '../../providers/node_provider.dart';
import '../../widgets/ai_engine_section.dart';
import '../../widgets/connection_indicator.dart';
import '../../widgets/profile_avatar.dart';
import '../browser/browser_screen.dart';
import '../chains/active_chains_screen.dart';
import '../chains/recent_chains_screen.dart';
import '../pairing/pairing_scan_screen.dart';
import '../profile/profile_screen.dart';
import '../settings/ai_engine_settings_screen.dart';
import '../settings/ai_model_settings_screen.dart';
import '../settings/pi_settings_screen.dart';
import 'node_switcher_sheet.dart';
import '../../services/push_preferences.dart';

/// Profile + node management screen.
class MeScreen extends ConsumerStatefulWidget {
  const MeScreen({super.key});

  @override
  ConsumerState<MeScreen> createState() => _MeScreenState();
}

class _MeScreenState extends ConsumerState<MeScreen> {
  String? _displayName;
  String? _username;
  String? _bio;
  String? _avatarColor;
  int _profileEpoch = 0;
  bool _pushEnabled = true;
  bool _pushToggleBusy = false;
  bool _familyProfileBusy = false;
  String? _appVersionLabel;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadProfile());
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadPushPref());
    unawaited(_loadAppVersion());
  }

  Future<void> _loadAppVersion() async {
    try {
      final info = await PackageInfo.fromPlatform();
      if (!mounted) return;
      setState(() {
        _appVersionLabel = 'EnvoyGo ${info.version} (${info.buildNumber})';
      });
    } catch (_) {
      /* best-effort — leave footer empty */
    }
  }

  Future<void> _loadPushPref() async {
    final profileId = ref.read(nodeProvider).familyProfileId;
    final enabled = await PushPreferences.isEnabled(profileId: profileId);
    if (mounted) setState(() => _pushEnabled = enabled);
  }

  /// Phase 50 — toggle push notifications on/off.
  /// ON → save preference + re-register token with the home node.
  /// OFF → save preference + the home node stops pushing (no token to send to).
  Future<void> _togglePushNotifications(bool enabled) async {
    setState(() => _pushToggleBusy = true);
    try {
      final profileId = ref.read(nodeProvider).familyProfileId;
      await PushPreferences.setEnabled(enabled, profileId: profileId);
      final notifier = ref.read(nodeProvider.notifier);
      if (enabled) {
        // Re-register: obtain token + call registerPushToken on home node.
        await notifier.registerPushToken();
      }
      // When disabling, we rely on the preference gate in registerPushToken
      // to skip re-registration on reconnect. The home node's existing token
      // will naturally expire when it hits APNs/FCM 410 (token cleanup, Phase 50B).
      // Alternatively, call unregisterPushToken via the client — but we don't
      // have the deviceId handy, and best-effort is fine here.
      if (mounted) setState(() => _pushEnabled = enabled);
    } finally {
      if (mounted) setState(() => _pushToggleBusy = false);
    }
  }

  Future<void> _loadProfile() async {
    final nodeState = ref.read(nodeProvider);
    // Phase 51E — family members use local family profile, not mesh HumanProfile.
    if (!nodeState.isOwnerProfile) {
      final profileId = nodeState.familyProfileId;
      Map<String, dynamic>? match;
      for (final p in nodeState.familyProfiles) {
        if (p['id']?.toString() == profileId) {
          match = p;
          break;
        }
      }
      if (!mounted) return;
      setState(() {
        _displayName = (match?['name'] as String?)?.trim();
        _avatarColor = (match?['avatarColor'] as String?)?.trim();
        _username = null;
        _bio = null;
        _profileEpoch++;
      });
      return;
    }

    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final profile = await client.getHumanProfile();
      if (!mounted) return;
      setState(() {
        _displayName = (profile['displayName'] as String?)?.trim();
        _username = (profile['username'] as String?)?.trim();
        _bio = (profile['bio'] as String?)?.trim();
        _avatarColor = null;
        _profileEpoch++;
      });
    } catch (_) {
      /* best-effort */
    }
  }

  Future<void> _openProfile({bool edit = false}) async {
    final nodeState = ref.read(nodeProvider);
    if (!nodeState.isOwnerProfile) {
      await _editFamilyProfile();
      return;
    }
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ProfileScreen(startInEditMode: edit),
      ),
    );
    if (mounted) await _loadProfile();
  }

  Future<void> _editFamilyProfile() async {
    final nodeState = ref.read(nodeProvider);
    final profileId = nodeState.familyProfileId;
    if (profileId == null || profileId.isEmpty) return;
    final nameController = TextEditingController(text: _displayName ?? '');
    final colorController = TextEditingController(text: _avatarColor ?? '#6366f1');
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit profile'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameController,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Display name',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: colorController,
              decoration: const InputDecoration(
                labelText: 'Avatar color (hex)',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    if (saved != true || !mounted) return;
    final name = nameController.text.trim();
    if (name.isEmpty) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    setState(() => _familyProfileBusy = true);
    try {
      await client.updateFamilyProfile(
        id: profileId,
        name: name,
        avatarColor: colorController.text.trim().isEmpty
            ? null
            : colorController.text.trim(),
      );
      if (mounted) await _loadProfile();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not update profile: $e')),
      );
    } finally {
      if (mounted) setState(() => _familyProfileBusy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final nodeState = ref.watch(nodeProvider);
    // Reload push prefs when family profile binding becomes known after connect.
    ref.listen<String?>(
      nodeProvider.select((s) => s.familyProfileId),
      (prev, next) {
        if (prev != next) unawaited(_loadPushPref());
      },
    );
    // Refresh family name/avatar when config syncs profiles.
    ref.listen<List<Map<String, dynamic>>>(
      nodeProvider.select((s) => s.familyProfiles),
      (prev, next) {
        if (!nodeState.isOwnerProfile) unawaited(_loadProfile());
      },
    );
    final notifier = ref.read(nodeProvider.notifier);
    final scheme = Theme.of(context).colorScheme;
    final name = (_displayName != null && _displayName!.isNotEmpty)
        ? _displayName!
        : (nodeState.activeNode?.name.trim().isNotEmpty == true
            ? nodeState.activeNode!.name
            : 'EnvoyGo');
    final subtitle = (_username != null && _username!.isNotEmpty)
        ? '@$_username'
        : ((_bio != null && _bio!.isNotEmpty) ? _bio! : null);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const SizedBox(height: 8),
        Material(
          color: Colors.transparent,
          child: InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: nodeState.activeNode == null ? null : () => _openProfile(),
            child: Ink(
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    scheme.primary.withValues(alpha: 0.14),
                    scheme.tertiary.withValues(alpha: 0.10),
                    scheme.surfaceContainerHighest.withValues(alpha: 0.55),
                  ],
                ),
                border: Border.all(
                  color: scheme.outlineVariant.withValues(alpha: 0.45),
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.fromLTRB(20, 24, 20, 20),
                child: Column(
                  children: [
                    if (!nodeState.isOwnerProfile)
                      CircleAvatar(
                        key: ValueKey('me-family-avatar-$_profileEpoch'),
                        radius: 44,
                        backgroundColor: _parseHexColor(_avatarColor),
                        child: Text(
                          name.isNotEmpty ? name[0].toUpperCase() : '?',
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 36,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      )
                    else
                      ProfileAvatar(
                        key: ValueKey('me-avatar-$_profileEpoch'),
                        ownerId: nodeState.ownerId,
                        displayName: name,
                        radius: 44,
                        isSelf: true,
                      ),
                    const SizedBox(height: 14),
                    Text(
                      name,
                      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            letterSpacing: -0.3,
                          ),
                      textAlign: TextAlign.center,
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: scheme.onSurfaceVariant,
                            ),
                        textAlign: TextAlign.center,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                    if (nodeState.activeNode != null) ...[
                      const SizedBox(height: 14),
                      FilledButton.tonalIcon(
                        onPressed: _familyProfileBusy
                            ? null
                            : () => _openProfile(edit: true),
                        icon: const Icon(Icons.edit_outlined, size: 18),
                        label: Text(
                          nodeState.isOwnerProfile
                              ? 'View & edit profile'
                              : 'Edit name & avatar',
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
        const SizedBox(height: 24),

        // Connected node
        const _SectionHeader(title: 'Connected Node'),
        if (nodeState.activeNode != null) ...[
          Card(
            child: ListTile(
              leading: Icon(
                nodeState.connectionState == NodeConnectionState.connected
                    ? Icons.circle
                    : Icons.circle_outlined,
                color: nodeState.connectionState ==
                        NodeConnectionState.connected
                    ? Colors.green
                    : Colors.grey,
                size: 12,
              ),
              title: Text(nodeState.activeNode!.name),
              subtitle: Row(
                children: [
                  if (nodeState.connectionState == NodeConnectionState.connected) ...[
                    Builder(
                      builder: (context) {
                        final hasUpnp = nodeState.upnpAdvertisedAddr != null;
                        final (label, color) = connectionBadge(
                            nodeState.activeTransport, hasUpnp);
                        return Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(
                            color: color.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            label,
                            style: TextStyle(
                              color: color,
                              fontSize: 11,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        );
                      },
                    ),
                    const SizedBox(width: 6),
                  ],
                  Expanded(
                    child: Text(
                      nodeState.activeTransport != null
                          ? transportTypeLabel(nodeState.activeTransport)
                          : nodeState.connectionState.name,
                      style: Theme.of(context).textTheme.bodySmall,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              trailing: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextButton(
                    onPressed: () => notifier.forceReconnect(),
                    child: const Text('Reconnect'),
                  ),
                  if (nodeState.pairedNodes.length > 1)
                    TextButton(
                      onPressed: () =>
                          _showNodeSwitcher(context, ref, notifier),
                      child: const Text('Switch'),
                    ),
                ],
              ),
            ),
          ),
          if (nodeState.pairedNodes.length > 1) ...[
            const SizedBox(height: 4),
            Text(
              '+${nodeState.pairedNodes.length - 1} more paired',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                  ),
              textAlign: TextAlign.center,
            ),
          ],
        ] else if (nodeState.pairedNodes.isNotEmpty) ...[
          // Paired but offline. The pairing record is still in
          // local storage — the device is NOT unpaired. Show a
          // reconnect / re-pair CTA depending on the typed error
          // code from the most recent attempt.
          Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        nodeState.homeNodeErrorCode == 'unauthorized'
                            ? Icons.lock_outline
                            : Icons.cloud_off_outlined,
                        color: nodeState.homeNodeErrorCode == 'unauthorized'
                            ? Colors.orange
                            : Colors.grey,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          nodeState.homeNodeErrorCode == 'unauthorized'
                              ? 'Session expired for ${nodeState.pairedNodes.first.name}'
                              : 'Disconnected from ${nodeState.pairedNodes.first.name}',
                          style: Theme.of(context).textTheme.titleSmall,
                        ),
                      ),
                    ],
                  ),
                  if (nodeState.lastConnectAttemptAt != null) ...[
                    const SizedBox(height: 4),
                    Text(
                      'Last attempt: ${_formatRelative(nodeState.lastConnectAttemptAt!)}'
                      '${nodeState.reconnectAttempt > 0 ? ' · attempt ${nodeState.reconnectAttempt}' : ''}',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                  if (nodeState.errorMessage != null) ...[
                    const SizedBox(height: 2),
                    Text(
                      nodeState.errorMessage!,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: Colors.grey,
                          ),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      if (nodeState.homeNodeErrorCode == 'unauthorized') ...[
                        FilledButton.icon(
                          onPressed: () => _openPairing(context),
                          icon: const Icon(Icons.qr_code),
                          label: const Text('Re-pair'),
                        ),
                      ] else ...[
                        FilledButton.icon(
                          onPressed: () => notifier.kickReconnect(),
                          icon: const Icon(Icons.refresh),
                          label: const Text('Reconnect now'),
                        ),
                      ],
                      const SizedBox(width: 8),
                      TextButton.icon(
                        onPressed: () => _confirmUnpair(
                            context, ref, notifier, nodeState.pairedNodes.first),
                        icon: const Icon(Icons.link_off, color: Colors.red),
                        label: const Text('Unpair'),
                        style: TextButton.styleFrom(foregroundColor: Colors.red),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ] else ...[
          Card(
            child: ListTile(
              leading: const Icon(Icons.link_off, color: Colors.grey),
              title: const Text('Not connected'),
              subtitle:
                  const Text('Pair with a home node to get started'),
              trailing: FilledButton(
                onPressed: () => _openPairing(context),
                child: const Text('Pair'),
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),

        // Browser / AI Engine / Team jobs / Public Access / Pair / Model+Pi
        // are owner-only (Phase 51E). Family members keep Connected Node + Push.
        if (nodeState.isOwnerProfile && nodeState.activeNode != null) ...[
          const _SectionHeader(title: 'Browser'),
          Card(
            child: ListTile(
              leading: const Icon(Icons.language),
              title: const Text('Browser'),
              subtitle: const Text(
                'Open envoy:// pages — or use the Content tab for My Site',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const BrowserScreen(),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
          const _SectionHeader(title: 'AI Engine'),
          Card(
            child: ListTile(
              leading: const Icon(Icons.psychology),
              title: const Text('AI Engine'),
              subtitle: const Text(
                'Bridge + OpenClaw toggles. Tap to configure.',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const AiEngineSettingsScreen(),
                  ),
                );
              },
            ),
          ),
          const AiEngineSection(),
          const SizedBox(height: 16),
          const _SectionHeader(title: 'Team jobs'),
          Card(
            child: ListTile(
              leading: const Icon(Icons.analytics_outlined),
              title: const Text('Recent team jobs'),
              subtitle: const Text(
                'View job reports published on the home node',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const RecentChainsScreen(),
                  ),
                );
              },
            ),
          ),
          Card(
            child: ListTile(
              leading: const Icon(Icons.pending_actions_outlined),
              title: const Text('Active team jobs'),
              subtitle: const Text(
                'Monitor in-progress team jobs on the home node',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const ActiveChainsScreen(),
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: 16),
          const _SectionHeader(title: 'Public Access'),
          Card(
            child: _PublicHostEditor(
              node: nodeState.activeNode!,
              onSave: (host, port) {
                ref.read(nodeProvider.notifier).updatePublicAccess(
                      nodeState.activeNode!.id,
                      host,
                      port,
                    );
              },
            ),
          ),
          const SizedBox(height: 16),
          Card(
            child: ListTile(
              leading: const Icon(Icons.add_link),
              title: const Text('Pair New Node'),
              subtitle: const Text('Add another home node'),
              onTap: () => _openPairing(context),
            ),
          ),
          const SizedBox(height: 16),
          const _SectionHeader(title: 'Settings'),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.smart_toy_outlined),
                  title: const Text('AI Model'),
                  subtitle: Text(
                    'Provider ${nodeState.activeNode!.name} uses for the assistant',
                    overflow: TextOverflow.ellipsis,
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const AiModelSettingsScreen(),
                    ),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  leading: const Icon(Icons.code),
                  title: const Text('Pi Agent'),
                  subtitle: const Text(
                    'Built-in local coding agent on the home node',
                  ),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () => Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => const PiSettingsScreen(),
                    ),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
        ],

        // Theme
        const _SectionHeader(title: 'Preferences'),
        Card(
          child: SwitchListTile(
            title: const Text('Dark mode'),
            subtitle: const Text('Follow system setting'),
            value: Theme.of(context).brightness == Brightness.dark,
            onChanged: (_) {
              // TODO(31H): Theme toggle
            },
          ),
        ),
        Card(
          child: SwitchListTile(
            title: const Text('Push notifications'),
            subtitle: const Text(
              'Get notified about new messages, contact requests, '
              'and approvals when the app is in the background.',
            ),
            value: _pushEnabled,
            onChanged: _pushToggleBusy
                ? null
                : (enabled) => _togglePushNotifications(enabled),
          ),
        ),
        const SizedBox(height: 16),

        // Unpair
        if (nodeState.activeNode != null) ...[
          const _SectionHeader(title: ''),
          Card(
            child: ListTile(
              leading: const Icon(Icons.link_off, color: Colors.red),
              title: const Text('Unpair This Device'),
              subtitle:
                  const Text('Disconnect and remove all data'),
              onTap: () => _confirmUnpair(
                  context, ref, notifier, nodeState.activeNode!),
            ),
          ),
        ],

        // Network Debug Test — owner only
        if (nodeState.isOwnerProfile) ...[
          const SizedBox(height: 16),
          const _SectionHeader(title: 'Network Debug'),
          Card(
            child: _NetworkTestCard(),
          ),
        ],

        // App version / build (from pubspec version: x.y.z+build)
        if (_appVersionLabel != null) ...[
          const SizedBox(height: 28),
          Text(
            _appVersionLabel!,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: scheme.onSurfaceVariant.withValues(alpha: 0.75),
                ),
          ),
          const SizedBox(height: 8),
        ],
      ],
    );
  }

  void _openPairing(BuildContext context) {
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const PairingScanScreen()),
    );
  }

  void _showNodeSwitcher(
    BuildContext context,
    WidgetRef ref,
    NodeNotifier notifier,
  ) {
    final nodeState = ref.read(nodeProvider);
    showModalBottomSheet(
      context: context,
      builder: (_) => NodeSwitcherSheet(
        nodes: nodeState.pairedNodes,
        activeNodeId: nodeState.activeNode?.id,
        onSelect: (nodeId) => notifier.switchToNode(nodeId),
        onPairNew: () {
          Navigator.of(context).pop();
          _openPairing(context);
        },
      ),
    );
  }

  void _confirmUnpair(
    BuildContext context,
    WidgetRef ref,
    NodeNotifier notifier,
    StoredNode node,
  ) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Unpair?'),
        content: Text(
            'This will disconnect and remove all local chats and data for ${node.name}.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.of(ctx).pop();
              try {
                await notifier.unpairNode(node.id);
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Unpaired. Local chats and data removed.'),
                  ),
                );
              } catch (e) {
                if (!context.mounted) return;
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('Unpair failed: $e')),
                );
              }
            },
            child: const Text('Unpair'),
          ),
        ],
      ),
    );
  }
}

Color _parseHexColor(String? hex) {
  final raw = (hex ?? '#6366f1').trim();
  final cleaned = raw.startsWith('#') ? raw.substring(1) : raw;
  if (cleaned.length == 6) {
    final value = int.tryParse(cleaned, radix: 16);
    if (value != null) return Color(0xFF000000 | value);
  }
  return const Color(0xFF6366F1);
}

/// Inline editor for public IP/domain and port.
class _PublicHostEditor extends StatefulWidget {
  final StoredNode node;
  final void Function(String host, int port) onSave;

  const _PublicHostEditor({required this.node, required this.onSave});

  @override
  State<_PublicHostEditor> createState() => _PublicHostEditorState();
}

class _PublicHostEditorState extends State<_PublicHostEditor> {
  late final TextEditingController _hostController;
  late final TextEditingController _portController;

  @override
  void initState() {
    super.initState();
    _hostController =
        TextEditingController(text: widget.node.publicHost ?? '');
    _portController = TextEditingController(
        text: '${widget.node.publicPort}');
  }

  @override
  void dispose() {
    _hostController.dispose();
    _portController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Public IP or domain',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          TextField(
            controller: _hostController,
            decoration: const InputDecoration(
              hintText: 'e.g. 1.2.3.4 or mynode.example.com',
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
          const SizedBox(height: 8),
          Text('Port',
              style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 4),
          TextField(
            controller: _portController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(
              hintText: '3030',
              border: OutlineInputBorder(),
              isDense: true,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Set this if your home node has a public IP or domain.\n'
            'Enables direct connection without the relay on 5G/WAN.',
            style: Theme.of(context)
                .textTheme
                .bodySmall
                ?.copyWith(color: Colors.grey),
          ),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: FilledButton(
              onPressed: () {
                final host = _hostController.text.trim();
                final port =
                    int.tryParse(_portController.text.trim()) ?? 3030;
                widget.onSave(host, port);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Public access saved')),
                );
              },
              child: const Text('Save'),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String title;
  const _SectionHeader({required this.title});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(left: 4, bottom: 8),
      child: Text(
        title,
        style: Theme.of(context).textTheme.titleSmall?.copyWith(
              color: Theme.of(context).colorScheme.primary,
            ),
      ),
    );
  }
}

/// Lightweight relative-time formatter for the Me screen. Avoids
/// pulling in `intl` for a single use — the strings we produce are
/// short, English-only, and "good enough" for a status line.
String _formatRelative(DateTime t) {
  final delta = DateTime.now().difference(t);
  if (delta.inSeconds < 5) return 'just now';
  if (delta.inSeconds < 60) return '${delta.inSeconds}s ago';
  if (delta.inMinutes < 60) return '${delta.inMinutes}m ago';
  if (delta.inHours < 24) return '${delta.inHours}h ago';
  return '${delta.inDays}d ago';
}

/// Network debug test card — tests all connectivity paths that EnvoyGo uses
/// for pairing and connecting to a home node.
class _NetworkTestCard extends StatefulWidget {
  @override
  State<_NetworkTestCard> createState() => _NetworkTestCardState();
}

class _NetworkTestCardState extends State<_NetworkTestCard> {
  bool _running = false;
  final _results = <_TestResult>[];

  // All paths EnvoyGo uses to connect to home node
  static const _targets = [
    // DHT bootstrap peers (port 4001) — needed for libp2p DHT discovery
    _TestTarget(name: 'DHT am6:4001', host: 'am6.bootstrap.libp2p.io', port: 4001, protocol: 'tcp'),
    _TestTarget(name: 'DHT am7:4001', host: 'am7.bootstrap.libp2p.io', port: 4001, protocol: 'tcp'),
    _TestTarget(name: 'DHT bootstrap:4001', host: 'bootstrap.libp2p.io', port: 4001, protocol: 'tcp'),
    _TestTarget(name: 'DHT cn-relay:4001', host: '47.93.11.212', port: 4001, protocol: 'tcp'),
    // Relay WebSocket (port 15432) — needed for circuit relay via community relay
    _TestTarget(name: 'Relay ws:15432', host: '47.93.11.212', port: 15432, protocol: 'tcp'),
    // HTTP connectivity check (to see if bootstrap.libp2p.io DNS resolves)
    _TestTarget(name: 'HTTP bootstrap.libp2p.io', host: 'bootstrap.libp2p.io', port: 443, protocol: 'http'),
    _TestTarget(name: 'HTTP am6.bootstrap.libp2p.io', host: 'am6.bootstrap.libp2p.io', port: 443, protocol: 'http'),
  ];

  Future<void> _runTests() async {
    setState(() {
      _running = true;
      _results.clear();
    });

    for (final target in _targets) {
      final result = target.protocol == 'http'
          ? await _testHttp(target)
          : await _testTcp(target);
      if (!mounted) return;
      setState(() => _results.add(result));
    }

    if (!mounted) return;
    setState(() => _running = false);
  }

  Future<_TestResult> _testTcp(_TestTarget target) async {
    final stopwatch = Stopwatch()..start();
    try {
      final socket = await Socket.connect(
        target.host,
        target.port,
        timeout: const Duration(seconds: 5),
      );
      stopwatch.stop();
      socket.destroy();
      return _TestResult(target: target, ok: true, latencyMs: stopwatch.elapsedMilliseconds);
    } catch (e) {
      stopwatch.stop();
      return _TestResult(target: target, ok: false, error: e.toString());
    }
  }

  Future<_TestResult> _testHttp(_TestTarget target) async {
    final stopwatch = Stopwatch()..start();
    try {
      final socket = await Socket.connect(
        target.host,
        target.port,
        timeout: const Duration(seconds: 5),
      );
      stopwatch.stop();
      socket.destroy();
      return _TestResult(target: target, ok: true, latencyMs: stopwatch.elapsedMilliseconds);
    } catch (e) {
      stopwatch.stop();
      return _TestResult(target: target, ok: false, error: e.toString());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tests all paths EnvoyGo uses for pairing. '
            'If any DHT + relay path works, pairing should succeed.',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(color: Colors.grey),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              FilledButton.icon(
                onPressed: _running ? null : _runTests,
                icon: _running
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.network_check),
                label: Text(_running ? 'Testing…' : 'Run Network Tests'),
              ),
            ],
          ),
          if (_results.isNotEmpty) ...[
            const SizedBox(height: 12),
            ..._results.map((r) => Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                children: [
                  Icon(
                    r.ok ? Icons.check_circle : Icons.cancel,
                    size: 16,
                    color: r.ok ? Colors.green : Colors.red,
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${r.target.name} — ${r.ok ? '${r.latencyMs}ms' : _shortError(r.error!)}',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: r.ok ? Colors.green : Colors.red,
                          ),
                    ),
                  ),
                ],
              ),
            )),
          ],
        ],
      ),
    );
  }

  String _shortError(String error) {
    if (error.contains('SocketException')) return 'connection refused / blocked';
    if (error.contains('TimeoutException')) return 'timeout (5s)';
    if (error.contains('dart:io')) return error.split(':').last.trim();
    return error.length > 50 ? '${error.substring(0, 50)}…' : error;
  }
}

class _TestTarget {
  final String name;
  final String host;
  final int port;
  final String protocol; // 'tcp' or 'http'
  const _TestTarget({required this.name, required this.host, required this.port, required this.protocol});
}

class _TestResult {
  final _TestTarget target;
  final bool ok;
  final int? latencyMs;
  final String? error;
  const _TestResult({required this.target, required this.ok, this.latencyMs, this.error});
}
