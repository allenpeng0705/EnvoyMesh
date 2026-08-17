import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/node_provider.dart';
import '../../services/home_remote_client.dart';
import '../../services/pairing_service.dart';

/// Outcome of the pairing progress screen, returned via `Navigator.pop`.
class PairingProgressResult {
  final bool cancelled;
  final String? error;
  const PairingProgressResult._({this.cancelled = false, this.error});
  const PairingProgressResult.cancelled() : this._(cancelled: true);
  const PairingProgressResult.success() : this._();
  const PairingProgressResult.error(String error)
      : this._(error: error);
}

/// Full-screen waiting room shown while a 2-3 minute pairing handshake
/// runs against the home node. Replaces the bare `CircularProgressIndicator`
/// that previously sat inside [PairingConfirmScreen._pair] — Apple App
/// Review rejected the prior UX because users stranded on a spinner for
/// minutes with no progress feedback and no way out.
///
/// The screen shows:
///   - A clear title that names the home node
///   - A large spinner so the user knows the app hasn't frozen
///   - An elapsed-time counter that updates every second
///   - A "current stage" label and an explanatory hint that evolve
///     with elapsed time. We can't observe per-stage progress inside
///     the single `pairThinClient` RPC, so we estimate by elapsed time
///     and surface increasingly direct troubleshooting tips as time
///     grows past the typical handshake budget.
///   - A live "now connecting via …" line fed by the transport hook
///     (`HomeRemoteClientOptions.onCandidateTrying`): as the pairing
///     client walks LAN → P2P → relay, the screen shows exactly what
///     it is doing, so the reviewer never sees a silent spinner.
///   - A reassurance banner after ~30 s ("still working — the first
///     connection can take a minute or two") so a slow first pairing
///     reads as expected rather than frozen.
///   - An actionable troubleshooting card after ~2 min.
///   - A cancel button (with a confirmation dialog) so the user is
///     never trapped — calls [NodeNotifier.cancelPairing] which
///     force-closes the transport, makes the pending RPC throw, and
///     returns the user to the confirm screen with the error intact.
class PairingProgressScreen extends ConsumerStatefulWidget {
  final PairingData data;
  final String deviceName;
  final List<HomeRemoteCandidate> candidates;
  final String? profileId;
  final String? profileName;
  final String? profileAvatarColor;

  const PairingProgressScreen({
    super.key,
    required this.data,
    required this.deviceName,
    required this.candidates,
    this.profileId,
    this.profileName,
    this.profileAvatarColor,
  });

  @override
  ConsumerState<PairingProgressScreen> createState() =>
      _PairingProgressScreenState();
}

class _PairingProgressScreenState
    extends ConsumerState<PairingProgressScreen> {
  Timer? _ticker;
  Duration _elapsed = Duration.zero;
  bool _started = false;
  bool _cancelled = false;

  /// Live "now connecting via …" line, set by the transport hook as the
  /// pairing client walks the candidate list (LAN → P2P → relay).
  String? _transportLabel;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted) return;
      setState(() => _elapsed = _elapsed + const Duration(seconds: 1));
    });
    // Kick the pair call after the first frame so the spinner is
    // visible immediately and the user doesn't see a 1-frame blank.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _started) return;
      _started = true;
      unawaited(_runPairing());
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Future<void> _runPairing() async {
    final l10n = AppLocalizations.of(context);
    try {
      await ref.read(nodeProvider.notifier).pairWithNode(
            widget.data,
            widget.deviceName,
            widget.candidates,
            profileId: widget.profileId,
            profileName: widget.profileName,
            profileAvatarColor: widget.profileAvatarColor,
            onConnectingCandidate: (candidate) {
              if (!mounted) return;
              final label = _transportFor(candidate, l10n);
              if (label != _transportLabel) {
                setState(() => _transportLabel = label);
              }
            },
          );
      if (!mounted) return;
      Navigator.of(context)
          .pop(const PairingProgressResult.success());
    } catch (e) {
      if (!mounted) return;
      if (_cancelled) {
        Navigator.of(context)
            .pop(const PairingProgressResult.cancelled());
        return;
      }
      Navigator.of(context).pop(
        PairingProgressResult.error(_formatError(e)),
      );
    }
  }

  String _formatError(Object e) {
    return e
        .toString()
        .replaceFirst('Bad state: ', '')
        .replaceFirst('Exception: ', '');
  }

  String _formatElapsed(Duration d) {
    final mm = d.inMinutes.remainder(60).toString();
    final ss = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    if (d.inHours > 0) {
      final hh = d.inHours.toString();
      return '$hh:$mm:$ss';
    }
    return '$mm:$ss';
  }

  /// Maps a transport candidate to a localized "now connecting via …"
  /// line, or null when the candidate has no dedicated wording (the
  /// stage hint covers it). Called from the transport hook, so the user
  /// sees the app actively walking LAN → P2P → relay instead of a
  /// silent timer.
  String? _transportFor(HomeRemoteCandidate candidate, AppLocalizations l10n) {
    final name = candidate.name;
    if (name == 'lan') {
      return l10n.pairingNowLan;
    }
    if (name == 'bootstrap' || name.startsWith('p2p')) {
      return l10n.pairingNowP2p;
    }
    if (name == 'relay' ||
        name.startsWith('relay-') ||
        name == 'community-relay') {
      return l10n.pairingNowRelay;
    }
    return null;
  }

  /// Returns the (stageLabel, stageHint) pair that best matches the
  /// elapsed time. The thresholds are empirical — the bulk of pairings
  /// complete in 15-45 s; 60-90 s is the "this is taking a while" zone;
  /// beyond that we point at the most common cause (different network).
  ({String label, String hint}) _stageFor(Duration elapsed, AppLocalizations l10n) {
    final secs = elapsed.inSeconds;
    if (secs < 10) {
      return (label: l10n.pairingStageInitial, hint: l10n.pairingStageInitialHint);
    }
    if (secs < 30) {
      return (label: l10n.pairingStageConnecting, hint: l10n.pairingStageConnectingHint);
    }
    if (secs < 60) {
      return (label: l10n.pairingStageHandshaking, hint: l10n.pairingStageHandshakingHint);
    }
    if (secs < 90) {
      return (label: l10n.pairingStageVerifying, hint: l10n.pairingStageSlowHint);
    }
    return (label: l10n.pairingStageVerifying, hint: l10n.pairingStageVerySlowHint);
  }

  Future<void> _onCancelPressed() async {
    if (_cancelled) return;
    final l10n = AppLocalizations.of(context);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.pairingCancelConfirmTitle),
        content: Text(l10n.pairingCancelConfirmBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: Text(l10n.commonKeepWaiting),
          ),
          FilledButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text(l10n.pairingCancel),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _cancelled = true);
    _ticker?.cancel();
    ref.read(nodeProvider.notifier).cancelPairing();
    // _runPairing's catch will pop the screen once the in-flight RPC
    // throws. If for some reason it has already returned successfully,
    // we pop here as a safety net.
    await Future<void>.delayed(const Duration(milliseconds: 50));
    if (!mounted) return;
    Navigator.of(context)
        .pop(const PairingProgressResult.cancelled());
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final stage = _stageFor(_elapsed, l10n);
    final homePeer = widget.data.homeNodePeerId;
    final homeName = homePeer == null || homePeer.length <= 12
        ? (homePeer ?? '')
        : '${homePeer.substring(0, 8)}…${homePeer.substring(homePeer.length - 4)}';

    return PopScope(
      canPop: false,
      child: Scaffold(
        appBar: AppBar(
          title: Text(l10n.pairingInProgressTitle),
          automaticallyImplyLeading: false,
        ),
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
            child: Column(
              children: [
                const SizedBox(height: 8),
                const Icon(Icons.link, size: 48, color: Colors.blue),
                const SizedBox(height: 16),
                Text(
                  l10n.pairingInProgressSubtitle(widget.data.ownerId ?? homeName),
                  style: Theme.of(context).textTheme.titleMedium,
                  textAlign: TextAlign.center,
                ),
                if (homeName.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text(
                    l10n.pairingHomeNodeLabel(homeName),
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color:
                              Theme.of(context).colorScheme.onSurfaceVariant,
                          fontFamily: 'monospace',
                        ),
                    textAlign: TextAlign.center,
                  ),
                ],
                const SizedBox(height: 32),
                const SizedBox(
                  width: 56,
                  height: 56,
                  child: CircularProgressIndicator(strokeWidth: 5),
                ),
                const SizedBox(height: 24),
                Text(
                  l10n.pairingElapsed(_formatElapsed(_elapsed)),
                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                ),
                const SizedBox(height: 24),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Theme.of(context)
                        .colorScheme
                        .surfaceContainerHighest,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.timelapse,
                            size: 18,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              stage.label,
                              style:
                                  Theme.of(context).textTheme.titleSmall,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        stage.hint,
                        style:
                            Theme.of(context).textTheme.bodySmall?.copyWith(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSurfaceVariant,
                                ),
                      ),
                      // Live "now connecting via …" line. The transport
                      // hook fires as the client walks LAN → P2P → relay,
                      // so the user sees real activity instead of a timer.
                      if (_transportLabel != null) ...[
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            Icon(
                              Icons.sensors,
                              size: 16,
                              color: Theme.of(context).colorScheme.primary,
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _transportLabel!,
                                style: Theme.of(context)
                                    .textTheme
                                    .bodySmall
                                    ?.copyWith(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .primary,
                                      fontWeight: FontWeight.w600,
                                    ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ],
                  ),
                ),
                // Reassurance banner — after the typical fast-path budget
                // the user is told explicitly that a slow first pairing is
                // expected and that the app is still working.
                if (_elapsed.inSeconds >= 30) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .secondaryContainer
                          .withValues(alpha: 0.6),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.hourglass_top,
                          size: 18,
                          color: Theme.of(context).colorScheme.onSecondaryContainer,
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            l10n.pairingStillWorking,
                            style: Theme.of(context)
                                .textTheme
                                .bodySmall
                                ?.copyWith(
                                  color: Theme.of(context)
                                      .colorScheme
                                      .onSecondaryContainer,
                                ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
                // Actionable troubleshooting card once the handshake has
                // clearly exceeded any reasonable budget (~2 min).
                if (_elapsed.inSeconds >= 120) ...[
                  const SizedBox(height: 12),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Theme.of(context)
                          .colorScheme
                          .errorContainer
                          .withValues(alpha: 0.55),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(
                              Icons.help_outline,
                              size: 18,
                              color:
                                  Theme.of(context).colorScheme.onErrorContainer,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                l10n.pairingTroubleTitle,
                                style: Theme.of(context)
                                    .textTheme
                                    .titleSmall
                                    ?.copyWith(
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onErrorContainer,
                                    ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          l10n.pairingTroubleBody,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(
                                color: Theme.of(context)
                                    .colorScheme
                                    .onErrorContainer,
                              ),
                        ),
                      ],
                    ),
                  ),
                ],
                const Spacer(),
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _cancelled ? null : _onCancelPressed,
                    icon: const Icon(Icons.cancel_outlined),
                    label: Text(l10n.pairingCancel),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  l10n.pairingDontCloseApp,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color:
                            Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
