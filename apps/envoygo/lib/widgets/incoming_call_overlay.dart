import 'dart:async';
import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import '../providers/call_provider.dart';

/// Full-screen incoming call overlay for Phase 38 voice calls in EnvoyGo.
///
/// Shows a pulsing phone icon with the caller's name and accept/decline
/// buttons. Auto-dismisses after 60 seconds (ring timeout).
class IncomingCallOverlay extends StatefulWidget {
  final CallProvider callProvider;

  const IncomingCallOverlay({super.key, required this.callProvider});

  @override
  State<IncomingCallOverlay> createState() => _IncomingCallOverlayState();
}

class _IncomingCallOverlayState extends State<IncomingCallOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _pulseCtrl;
  late Animation<double> _pulseAnim;
  Timer? _ringTimer;

  @override
  void initState() {
    super.initState();
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );
    _pulseAnim = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut),
    );
    // The pulse + ring timer only run when the overlay is actually
    // visible (state.isIncoming). This keeps the widget cheap when
    // idle (it sits in the HomeScreen Stack permanently) and avoids
    // binding-invariants failures in widget tests when no call is
    // incoming.
    widget.callProvider.addListener(_onProviderChanged);
    _syncAnimationWithState();
  }

  @override
  void didUpdateWidget(covariant IncomingCallOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.callProvider != widget.callProvider) {
      oldWidget.callProvider.removeListener(_onProviderChanged);
      widget.callProvider.addListener(_onProviderChanged);
    }
    _syncAnimationWithState();
  }

  void _onProviderChanged() {
    if (mounted) _syncAnimationWithState();
  }

  void _syncAnimationWithState() {
    final visible = widget.callProvider.state.isIncoming;
    if (visible) {
      if (!_pulseCtrl.isAnimating) _pulseCtrl.repeat(reverse: true);
      // Always cancel + re-arm the ring timer so a second incoming
      // call that arrives while the overlay is already visible (the
      // first timer hasn't fired yet) gets a full 60s instead of
      // being auto-dismissed by the stale timer. The previous
      // `_ringTimer ??= Timer(...)` skipped the reassignment and let
      // the old timer fire against the new call.
      _ringTimer?.cancel();
      _ringTimer = Timer(const Duration(seconds: 60), () {
        if (mounted) widget.callProvider.dismissIncoming();
      });
    } else {
      if (_pulseCtrl.isAnimating) _pulseCtrl.stop();
      _ringTimer?.cancel();
      _ringTimer = null;
    }
  }

  @override
  void dispose() {
    widget.callProvider.removeListener(_onProviderChanged);
    _pulseCtrl.dispose();
    _ringTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.callProvider.state;
    if (!state.isIncoming) {
      return const SizedBox.shrink();
    }

    final l10n = AppLocalizations.of(context);
    final colorScheme = Theme.of(context).colorScheme;
    final displayName = state.peerDisplayName ?? l10n.commonUnknown;

    return Material(
      color: Colors.black54,
      child: Center(
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 32),
          padding: const EdgeInsets.all(32),
          decoration: BoxDecoration(
            color: colorScheme.surface,
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withAlpha(60),
                blurRadius: 24,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Pulsing phone icon
              AnimatedBuilder(
                animation: _pulseAnim,
                builder: (context, child) {
                  return Transform.scale(
                    scale: _pulseAnim.value,
                    child: Container(
                      width: 80,
                      height: 80,
                      decoration: BoxDecoration(
                        color: colorScheme.primaryContainer,
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        Icons.phone,
                        size: 40,
                        color: colorScheme.primary,
                      ),
                    ),
                  );
                },
              ),
              const SizedBox(height: 24),
              Text(
                displayName,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
              ),
              const SizedBox(height: 8),
              Text(
                l10n.callIncoming,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
              ),
              const SizedBox(height: 32),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  // Decline button
                  _CircularButton(
                    icon: Icons.call_end,
                    color: colorScheme.error,
                    onPressed: () => widget.callProvider.declineCall(),
                    label: l10n.commonDecline,
                  ),
                  // Accept button
                  _CircularButton(
                    icon: Icons.phone,
                    color: const Color(0xFF4CAF50),
                    onPressed: () => widget.callProvider.acceptCall(),
                    label: l10n.commonAccept,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Small circular button with icon and label for the incoming call overlay.
class _CircularButton extends StatelessWidget {
  final IconData icon;
  final Color color;
  final VoidCallback onPressed;
  final String label;

  const _CircularButton({
    required this.icon,
    required this.color,
    required this.onPressed,
    required this.label,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 64,
          height: 64,
          decoration: BoxDecoration(
            color: color,
            shape: BoxShape.circle,
          ),
          child: IconButton(
            icon: Icon(icon, color: Colors.white, size: 28),
            onPressed: onPressed,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          label,
          style: Theme.of(context).textTheme.labelSmall,
        ),
      ],
    );
  }
}
