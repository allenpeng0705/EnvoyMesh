import 'package:flutter/material.dart';

String formatVoiceDuration(int totalSeconds) {
  final minutes = totalSeconds ~/ 60;
  final seconds = totalSeconds % 60;
  return '$minutes:${seconds.toString().padLeft(2, '0')}';
}

/// Compose-bar replacement while recording or reviewing a voice note.
class VoiceNoteRecorderBar extends StatelessWidget {
  final bool isCapturing;
  final int recordingSeconds;
  final int maxSeconds;
  final bool sending;
  final VoidCallback onCancel;
  final VoidCallback? onStop;
  final VoidCallback onSend;

  const VoiceNoteRecorderBar({
    super.key,
    required this.isCapturing,
    required this.recordingSeconds,
    required this.maxSeconds,
    required this.sending,
    required this.onCancel,
    required this.onStop,
    required this.onSend,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final nearLimit = recordingSeconds >= maxSeconds - 10;
    final canSend = !sending && !isCapturing && recordingSeconds > 0;

    if (sending) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: colorScheme.primary,
              ),
            ),
            const SizedBox(width: 12),
            Text(
              'Sending voice note…',
              style: TextStyle(color: colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isCapturing
              ? colorScheme.error.withAlpha(120)
              : colorScheme.outlineVariant,
        ),
      ),
      child: Row(
        children: [
          TextButton.icon(
            onPressed: onCancel,
            icon: const Icon(Icons.close, size: 20),
            label: const Text('Cancel'),
            style: TextButton.styleFrom(foregroundColor: colorScheme.error),
          ),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      isCapturing ? Icons.fiber_manual_record : Icons.check_circle_outline,
                      size: 14,
                      color: isCapturing ? colorScheme.error : colorScheme.primary,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      isCapturing ? 'Recording' : 'Ready to send',
                      style: Theme.of(context).textTheme.labelLarge,
                    ),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  formatVoiceDuration(recordingSeconds),
                  style: TextStyle(
                    fontFeatures: const [FontFeature.tabularFigures()],
                    color: nearLimit ? colorScheme.error : colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
          if (isCapturing)
            FilledButton.tonalIcon(
              onPressed: onStop,
              icon: const Icon(Icons.stop, size: 18),
              label: const Text('Stop'),
            )
          else
            FilledButton.icon(
              onPressed: canSend ? onSend : null,
              icon: const Icon(Icons.send, size: 18),
              label: const Text('Send'),
            ),
        ],
      ),
    );
  }
}
