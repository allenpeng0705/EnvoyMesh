import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../providers/social_context_provider.dart';
import '../../services/onboarding_preferences.dart';

/// Onboarding step: who you are and what you are into.
///
/// Sits between the welcome slides and the pairing guide, and works with **no
/// home node** — the phone mesh is a first-class mode. It is not cosmetic:
/// interests are the discovery vocabulary (`interest:<slug>`), so a profile
/// without them means peers can only find this phone through the broad
/// `mesh.discovery` capability. Skipping is allowed (never block first launch)
/// and the whole thing can be redone later from Me → Edit profile.
class ProfileSetupScreen extends ConsumerStatefulWidget {
  const ProfileSetupScreen({
    super.key,
    required this.onDone,
  });

  /// Called after save **or** skip, so the caller can continue onboarding.
  final VoidCallback onDone;

  @override
  ConsumerState<ProfileSetupScreen> createState() => _ProfileSetupScreenState();
}

class _ProfileSetupScreenState extends ConsumerState<ProfileSetupScreen> {
  final _nameCtrl = TextEditingController();
  final _interestCtrl = TextEditingController();
  final List<String> _interests = [];
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _nameCtrl.dispose();
    _interestCtrl.dispose();
    super.dispose();
  }

  void _addInterest() {
    final value = _interestCtrl.text.trim();
    if (value.isEmpty) return;
    setState(() {
      if (!_interests.contains(value)) _interests.add(value);
      _interestCtrl.clear();
    });
  }

  Future<void> _finish({required bool save}) async {
    final l10n = AppLocalizations.of(context);
    if (save) {
      final name = _nameCtrl.text.trim();
      if (name.isEmpty) {
        setState(() => _error = l10n.onboardingProfileNameRequired);
        return;
      }
      setState(() {
        _saving = true;
        _error = null;
      });
      try {
        final backend = ref.read(phoneSocialBackendProvider);
        if (backend == null) throw StateError('phone profile storage unavailable');
        await backend.updateHumanProfile({
          'displayName': name,
          'hobbies': _interests,
          // Interests are searchable by peers on purpose; the editor in Me
          // exposes the same choice for people who want to change it later.
          'profileVisibility': 'public',
        });
      } catch (e) {
        if (!mounted) return;
        setState(() {
          _saving = false;
          _error = l10n.meProfileUpdateFailed(e.toString());
        });
        return;
      }
      if (!mounted) return;
      setState(() => _saving = false);
    }
    await OnboardingPreferences.setProfileStepCompleted();
    if (!mounted) return;
    widget.onDone();
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.onboardingProfileTitle),
        automaticallyImplyLeading: false,
      ),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
          children: [
            Text(
              l10n.onboardingProfileLede,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurfaceVariant,
                    height: 1.4,
                  ),
            ),
            const SizedBox(height: 20),
            TextField(
              controller: _nameCtrl,
              autofocus: true,
              textCapitalization: TextCapitalization.words,
              decoration: InputDecoration(
                labelText: l10n.meDisplayName,
                border: const OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 20),
            Text(
              l10n.peopleInterest,
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 4),
            Text(
              l10n.onboardingProfileInterestsHint,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
            const SizedBox(height: 8),
            if (_interests.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    for (final value in _interests)
                      InputChip(
                        label: Text(value),
                        visualDensity: VisualDensity.compact,
                        onDeleted: () => setState(() => _interests.remove(value)),
                      ),
                  ],
                ),
              ),
            Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _interestCtrl,
                    decoration: InputDecoration(
                      hintText: l10n.profileHobbiesHint,
                      border: const OutlineInputBorder(),
                      isDense: true,
                    ),
                    textInputAction: TextInputAction.done,
                    onSubmitted: (_) => _addInterest(),
                  ),
                ),
                const SizedBox(width: 8),
                TextButton(
                  onPressed: _addInterest,
                  child: Text(l10n.commonAdd),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: scheme.error)),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _saving ? null : () => _finish(save: true),
              child: Text(_saving ? l10n.commonSaving : l10n.commonSave),
            ),
            TextButton(
              onPressed: _saving ? null : () => _finish(save: false),
              child: Text(l10n.welcomeSkip),
            ),
            const SizedBox(height: 8),
            Text(
              l10n.onboardingProfileSkipHint,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: scheme.onSurfaceVariant,
                  ),
            ),
          ],
        ),
      ),
    );
  }
}
