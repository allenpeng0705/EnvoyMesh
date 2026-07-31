import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../models/stored_node.dart';
import '../../providers/node_provider.dart';
import '../../services/candidate_resolver.dart';
import '../../services/home_remote_client.dart';
import '../../services/pairing_service.dart';

/// Confirmation screen shown after scanning a pairing / family-invite QR.
class PairingConfirmScreen extends ConsumerStatefulWidget {
  final String nodeName;
  final PairingData data;

  const PairingConfirmScreen({
    super.key,
    required this.nodeName,
    required this.data,
  });

  @override
  ConsumerState<PairingConfirmScreen> createState() =>
      _PairingConfirmScreenState();
}

class _PairingConfirmScreenState extends ConsumerState<PairingConfirmScreen> {
  static const _avatarPresets = <String>[
    '#6366f1',
    '#07c160',
    '#0d9488',
    '#d97706',
    '#ef4444',
    '#7c3aed',
  ];

  bool _pairing = false;
  String? _error;
  late final TextEditingController _nameController;
  late String _avatarColor;

  /// Family invite: create a new profile vs bind an existing one.
  bool _selectExisting = false;
  bool _loadingProfiles = false;
  String? _profilesError;
  List<Map<String, dynamic>> _existingProfiles = const [];
  String? _selectedProfileId;

  bool get _isFamilyInvite => widget.data.isInviteUri;

  @override
  void initState() {
    super.initState();
    _nameController = TextEditingController();
    _avatarColor = _avatarPresets.first;
    final hinted = widget.data.profileId?.trim();
    if (_isFamilyInvite && hinted != null && hinted.isNotEmpty) {
      _selectExisting = true;
      _selectedProfileId = hinted;
    }
    if (_isFamilyInvite) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        unawaited(_loadExistingProfiles());
      });
    }
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Color _parseHex(String hex) {
    final cleaned = hex.replaceFirst('#', '');
    final value = int.tryParse(cleaned, radix: 16) ?? 0x6366f1;
    return Color(0xFF000000 | value);
  }

  List<HomeRemoteCandidate> _resolveCandidates() {
    final List<String> bootstrapPeers = [];
    if (widget.data.bootstrapPeers != null) {
      bootstrapPeers.addAll(widget.data.bootstrapPeers!);
    }
    if (widget.data.relayWsUrls != null) {
      for (final u in widget.data.relayWsUrls!) {
        if (!bootstrapPeers.contains(u)) bootstrapPeers.add(u);
      }
    }
    if (widget.data.bootstrapPresetNames != null &&
        widget.data.bootstrapPresetNames!.isNotEmpty) {
      for (final p in CandidateResolver.resolveBootstrapPresets(
          widget.data.bootstrapPresetNames!)) {
        if (!bootstrapPeers.contains(p)) bootstrapPeers.add(p);
      }
    }

    final tempNode = StoredNode(
      id: '',
      name: defaultHomeNodeDisplayName,
      ownerId: widget.data.ownerId ?? '',
      homePeerId: widget.data.homeNodePeerId ?? '',
      lanIp: widget.data.lanWsUrl,
      wsPort: 3030,
      relayWsUrl: widget.data.relayWsUrl,
      pairedAt: DateTime.now(),
      bootstrapPeers: bootstrapPeers,
    );
    CandidateResolver.setCommunityHomePeerId(widget.data.homeNodePeerId);
    final resolver = CandidateResolver();
    final isOnWifi = ref.read(nodeProvider.notifier).isOnWifi;
    return resolver.resolve(
      tempNode,
      sessionToken: widget.data.token,
      isOnWifi: isOnWifi,
    );
  }

  Future<void> _loadExistingProfiles() async {
    if (!_isFamilyInvite || !mounted) return;
    setState(() {
      _loadingProfiles = true;
      _profilesError = null;
    });
    try {
      final candidates = _resolveCandidates();
      final profiles = await ref
          .read(nodeProvider.notifier)
          .previewFamilyInviteProfiles(widget.data, candidates);
      if (!mounted) return;
      setState(() {
        _existingProfiles = profiles;
        _loadingProfiles = false;
        if (_selectedProfileId != null &&
            !profiles.any((p) => p['id'] == _selectedProfileId)) {
          // Hinted id not in list — keep select mode but clear selection.
          _selectedProfileId = null;
        }
        if (_selectExisting &&
            _selectedProfileId == null &&
            profiles.length == 1) {
          _selectedProfileId = profiles.first['id'] as String?;
        }
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loadingProfiles = false;
        _profilesError = 'Could not load existing profiles: $e';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final title = _isFamilyInvite ? 'Join Family' : 'Confirm Pairing';
    final headline = _isFamilyInvite
        ? 'Welcome to the ${widget.nodeName} family!'
        : 'Connect to ${widget.nodeName}?';

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Icon(
              _isFamilyInvite ? Icons.family_restroom : Icons.link,
              size: 48,
              color: Colors.blue,
            ),
            const SizedBox(height: 16),
            Text(
              headline,
              style: Theme.of(context).textTheme.headlineSmall,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 8),
            if (widget.data.homeNodePeerId != null)
              Text(
                'Peer: ${widget.data.homeNodePeerId!.length > 20 ? widget.data.homeNodePeerId!.substring(0, 10) : widget.data.homeNodePeerId}...',
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            if (widget.data.lanWsUrl != null) ...[
              const SizedBox(height: 4),
              Text(
                'LAN: available',
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ],
            if (widget.data.wsUrl.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(
                'Relay: available',
                style: Theme.of(context).textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ],
            if (_isFamilyInvite) ...[
              const SizedBox(height: 24),
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment<bool>(
                    value: false,
                    label: Text('I\'m new'),
                    icon: Icon(Icons.person_add_alt_1, size: 18),
                  ),
                  ButtonSegment<bool>(
                    value: true,
                    label: Text('I\'m back'),
                    icon: Icon(Icons.how_to_reg, size: 18),
                  ),
                ],
                selected: {_selectExisting},
                onSelectionChanged: (next) {
                  setState(() {
                    _selectExisting = next.first;
                    _error = null;
                  });
                  if (next.first &&
                      _existingProfiles.isEmpty &&
                      !_loadingProfiles) {
                    unawaited(_loadExistingProfiles());
                  }
                },
              ),
              const SizedBox(height: 20),
              if (_selectExisting)
                _buildSelectExisting(context)
              else
                _buildCreateNew(context),
            ] else ...[
              const SizedBox(height: 16),
              TextField(
                controller: _nameController,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  labelText: 'Display name (optional)',
                  hintText: 'e.g. Dad',
                  border: OutlineInputBorder(),
                  helperText: 'Shown as your owner profile name on this node',
                ),
              ),
            ],
            if (_error != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Theme.of(context).colorScheme.errorContainer,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SelectableText(
                      _error!,
                      style: TextStyle(
                        color: Theme.of(context).colorScheme.onErrorContainer,
                      ),
                    ),
                    const SizedBox(height: 8),
                    TextButton.icon(
                      onPressed: () {
                        Clipboard.setData(ClipboardData(text: _error!));
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(content: Text('Copied to clipboard')),
                        );
                      },
                      icon: const Icon(Icons.copy, size: 16),
                      label: const Text('Copy error'),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 24),
            if (_pairing)
                const Center(child: CircularProgressIndicator())
              else
                FilledButton.icon(
                  onPressed: _pair,
                  icon: Icon(_isFamilyInvite ? Icons.person_add : Icons.link),
                  label: Text(_isFamilyInvite ? 'Join' : 'Pair'),
                ),
            const SizedBox(height: 8),
            TextButton(
              onPressed: _pairing ? null : () => Navigator.of(context).pop(),
              child: const Text('Cancel'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCreateNew(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _buildExistingMembersHint(context),
        Text(
          'Who are you?',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 4),
        Text(
          'Choose a name that is not already used below. '
          'If you already joined on another phone, switch to "I\'m back".',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 12),
        Center(
          child: CircleAvatar(
            radius: 32,
            backgroundColor: _parseHex(_avatarColor),
            child: Text(
              (_nameController.text.trim().isEmpty
                      ? '?'
                      : _nameController.text.trim()[0])
                  .toUpperCase(),
              style: const TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _nameController,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(
            labelText: 'Your name',
            hintText: 'e.g. Mom, Alex',
            border: OutlineInputBorder(),
          ),
          onChanged: (_) => setState(() {}),
        ),
        const SizedBox(height: 16),
        Text(
          'Avatar color',
          style: Theme.of(context).textTheme.titleSmall,
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: [
            for (final hex in _avatarPresets)
              GestureDetector(
                onTap: () => setState(() => _avatarColor = hex),
                child: Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: _parseHex(hex),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: _avatarColor == hex
                          ? Theme.of(context).colorScheme.onSurface
                          : Colors.transparent,
                      width: 3,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }

  /// Always visible on family invite — so a second phone can see names
  /// like "Dad" before choosing "I'm back".
  Widget _buildExistingMembersHint(BuildContext context) {
    if (_loadingProfiles) {
      return const Padding(
        padding: EdgeInsets.only(bottom: 16),
        child: LinearProgressIndicator(minHeight: 2),
      );
    }
    if (_profilesError != null) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              _profilesError!,
              style: TextStyle(
                color: Theme.of(context).colorScheme.error,
                fontSize: 13,
              ),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton(
                onPressed: () => unawaited(_loadExistingProfiles()),
                child: const Text('Retry loading members'),
              ),
            ),
          ],
        ),
      );
    }
    if (_existingProfiles.isEmpty) {
      return Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: Text(
          'No family members yet — you will be the first.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Already on this home',
            style: Theme.of(context).textTheme.titleSmall,
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final profile in _existingProfiles)
                Builder(builder: (context) {
                  final name =
                      (profile['name'] as String?)?.trim().isNotEmpty == true
                          ? profile['name'] as String
                          : (profile['id'] as String? ?? '?');
                  final color =
                      profile['avatarColor'] as String? ?? '#6366f1';
                  return ActionChip(
                    avatar: CircleAvatar(
                      backgroundColor: _parseHex(color),
                      radius: 10,
                      child: Text(
                        name[0].toUpperCase(),
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 11,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                    label: Text(name),
                    onPressed: () {
                      setState(() {
                        _selectExisting = true;
                        _selectedProfileId = profile['id'] as String?;
                        _error = null;
                      });
                    },
                  );
                }),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Tap a name if this is your second phone (I\'m back).',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                ),
          ),
        ],
      ),
    );
  }

  Widget _buildSelectExisting(BuildContext context) {
    if (_loadingProfiles) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 24),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_profilesError != null) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            _profilesError!,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: () => unawaited(_loadExistingProfiles()),
            child: const Text('Retry'),
          ),
        ],
      );
    }
    if (_existingProfiles.isEmpty) {
      return Text(
        'No existing family profiles yet. Switch to "I\'m new" to create one.',
        style: Theme.of(context).textTheme.bodyMedium,
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Select your profile',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 4),
        Text(
          'Use the same name you created on your first phone.',
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
                color: Theme.of(context).colorScheme.onSurfaceVariant,
              ),
        ),
        const SizedBox(height: 12),
        for (final profile in _existingProfiles)
          Builder(builder: (context) {
            final id = profile['id'] as String? ?? '';
            final name = profile['name'] as String? ?? id;
            final color = profile['avatarColor'] as String? ?? '#6366f1';
            final selected = _selectedProfileId == id;
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: selected
                    ? Theme.of(context).colorScheme.primaryContainer
                    : Theme.of(context).colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => setState(() => _selectedProfileId = id),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    child: Row(
                      children: [
                        CircleAvatar(
                          radius: 20,
                          backgroundColor: _parseHex(color),
                          child: Text(
                            name.isEmpty ? '?' : name[0].toUpperCase(),
                            style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            name,
                            style: Theme.of(context).textTheme.titleSmall,
                          ),
                        ),
                        if (selected)
                          Icon(
                            Icons.check_circle,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                      ],
                    ),
                  ),
                ),
              ),
            );
          }),
      ],
    );
  }

  Future<void> _pair() async {
    final name = _nameController.text.trim();
    if (_isFamilyInvite && !_selectExisting && name.isEmpty) {
      setState(() => _error = 'Please enter your name');
      return;
    }
    if (_isFamilyInvite && _selectExisting) {
      final id = _selectedProfileId?.trim() ?? '';
      if (id.isEmpty) {
        setState(() => _error = 'Please select your profile');
        return;
      }
    }

    setState(() {
      _pairing = true;
      _error = null;
    });

    List<HomeRemoteCandidate> candidates = [];

    try {
      candidates = _resolveCandidates();

      final notifier = ref.read(nodeProvider.notifier);
      await notifier.pairWithNode(
        widget.data,
        'EnvoyGo',
        candidates,
        profileId: _isFamilyInvite && _selectExisting
            ? _selectedProfileId?.trim()
            : null,
        profileName: _isFamilyInvite && !_selectExisting
            ? name
            : (name.isEmpty ? null : name),
        profileAvatarColor: _isFamilyInvite && !_selectExisting
            ? _avatarColor
            : (!_isFamilyInvite && name.isNotEmpty ? _avatarColor : null),
      );

      if (mounted) {
        Navigator.of(context).popUntil((route) => route.isFirst);
      }
    } catch (e) {
      final bpList = <String>[];
      if (widget.data.bootstrapPeers != null &&
          widget.data.bootstrapPeers!.isNotEmpty) {
        bpList.addAll(widget.data.bootstrapPeers!);
      } else if (widget.data.bootstrapPresetNames != null &&
          widget.data.bootstrapPresetNames!.isNotEmpty) {
        bpList.addAll(CandidateResolver.resolveBootstrapPresets(
            widget.data.bootstrapPresetNames!));
      }
      setState(() {
        _pairing = false;
        _error = 'Pairing failed: $e\n'
            'bootstrapPeers (from QR): $bpList\n'
            'homePeerId: ${widget.data.homeNodePeerId}\n'
            'bootstrapPresetNames (from QR): ${widget.data.bootstrapPresetNames}';
      });
    }
  }
}
