import 'package:flutter/material.dart';

import '../l10n/app_localizations.dart';

/// Full-width voice-note recorder bar (mirrors Social `VoiceNoteRecorderBar`).
///
/// Shown instead of the text composer while capturing, ready-to-retry after a
/// failed send, or uploading.
class VoiceNoteRecorderBar extends StatefulWidget {
  final bool isCapturing;
  final bool isSending;
  final int recordingSeconds;
  final int maxSeconds;
  final VoidCallback onCancel;
  final VoidCallback onSend;

  const VoiceNoteRecorderBar({
    super.key,
    required this.isCapturing,
    required this.isSending,
    required this.recordingSeconds,
    required this.maxSeconds,
    required this.onCancel,
    required this.onSend,
  });

  @override
  State<VoiceNoteRecorderBar> createState() => _VoiceNoteRecorderBarState();
}

class _VoiceNoteRecorderBarState extends State<VoiceNoteRecorderBar>
    with SingleTickerProviderStateMixin {
  late final AnimationController _pulse;

  @override
  void initState() {
    super.initState();
    _pulse = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    );
    if (widget.isCapturing && !widget.isSending) {
      _pulse.repeat(reverse: true);
    }
  }

  @override
  void didUpdateWidget(covariant VoiceNoteRecorderBar oldWidget) {
    super.didUpdateWidget(oldWidget);
    final shouldPulse = widget.isCapturing && !widget.isSending;
    if (shouldPulse && !_pulse.isAnimating) {
      _pulse.repeat(reverse: true);
    } else if (!shouldPulse && _pulse.isAnimating) {
      _pulse.stop();
      _pulse.value = 1;
    }
  }

  @override
  void dispose() {
    _pulse.dispose();
    super.dispose();
  }

  String _formatDuration(int totalSeconds) {
    final m = totalSeconds ~/ 60;
    final s = (totalSeconds % 60).toString().padLeft(2, '0');
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final scheme = Theme.of(context).colorScheme;
    final nearLimit = widget.recordingSeconds >= widget.maxSeconds - 10;
    final isReady = !widget.isCapturing && !widget.isSending;
    final canSend = !widget.isSending &&
        (isReady || widget.recordingSeconds > 0);

    if (widget.isSending) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: scheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: scheme.outlineVariant),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 22,
              height: 22,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: scheme.primary,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Text(
                l10n.chatVoiceSending,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ),
          ],
        ),
      );
    }

    final accent = isReady ? const Color(0xFF0D9488) : const Color(0xFFE11D48);

    return Container(
      padding: const EdgeInsets.fromLTRB(8, 10, 8, 10),
      decoration: BoxDecoration(
        color: scheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: accent.withValues(alpha: 0.45),
        ),
      ),
      child: Row(
        children: [
          _ActionChip(
            icon: Icons.close,
            label: l10n.chatVoiceCancel,
            foreground: scheme.onSurface,
            background: scheme.surface,
            onPressed: widget.onCancel,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    if (widget.isCapturing)
                      FadeTransition(
                        opacity: Tween<double>(begin: 0.35, end: 1).animate(
                          CurvedAnimation(parent: _pulse, curve: Curves.easeInOut),
                        ),
                        child: Container(
                          width: 10,
                          height: 10,
                          decoration: BoxDecoration(
                            color: accent,
                            shape: BoxShape.circle,
                          ),
                        ),
                      )
                    else
                      Icon(Icons.mic_none_rounded, size: 18, color: accent),
                    const SizedBox(width: 8),
                    Text(
                      isReady ? l10n.chatVoiceReady : l10n.chatVoiceRecording,
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            fontWeight: FontWeight.w700,
                            color: accent,
                          ),
                    ),
                    const SizedBox(width: 10),
                    Text(
                      _formatDuration(widget.recordingSeconds),
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontFeatures: const [FontFeature.tabularFigures()],
                            fontWeight: FontWeight.w700,
                            color: nearLimit && widget.isCapturing
                                ? const Color(0xFFB45309)
                                : scheme.onSurface,
                          ),
                    ),
                  ],
                ),
                if (widget.isCapturing) ...[
                  const SizedBox(height: 8),
                  const _WaveBars(),
                ],
                const SizedBox(height: 4),
                Text(
                  isReady ? l10n.chatVoiceReadyHint : l10n.chatVoiceSendHint,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: scheme.onSurfaceVariant,
                      ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _ActionChip(
            icon: Icons.send_rounded,
            label: l10n.chatVoiceSend,
            foreground: Colors.white,
            background: canSend
                ? const Color(0xFF0D9488)
                : scheme.outlineVariant,
            onPressed: canSend ? widget.onSend : null,
          ),
        ],
      ),
    );
  }
}

class _ActionChip extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color foreground;
  final Color background;
  final VoidCallback? onPressed;

  const _ActionChip({
    required this.icon,
    required this.label,
    required this.foreground,
    required this.background,
    required this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Material(
      color: background,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onPressed,
        borderRadius: BorderRadius.circular(14),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minWidth: 72, minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, size: 22, color: foreground),
                const SizedBox(height: 2),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: foreground,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _WaveBars extends StatefulWidget {
  const _WaveBars();

  @override
  State<_WaveBars> createState() => _WaveBarsState();
}

class _WaveBarsState extends State<_WaveBars>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: List.generate(7, (i) {
            final phase = (_controller.value + i * 0.12) % 1.0;
            final height = 6.0 + 14.0 * (0.35 + 0.65 * (1 - (phase - 0.5).abs() * 2));
            return Container(
              margin: const EdgeInsets.symmetric(horizontal: 2),
              width: 3.5,
              height: height,
              decoration: BoxDecoration(
                color: const Color(0xFFE11D48).withValues(alpha: 0.75),
                borderRadius: BorderRadius.circular(2),
              ),
            );
          }),
        );
      },
    );
  }
}
