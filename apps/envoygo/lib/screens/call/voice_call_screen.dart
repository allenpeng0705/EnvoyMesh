import 'package:flutter/material.dart';

/// VoiceCallScreen — Phase 38 native Flutter voice call UI.
///
/// Skeleton widget for the native Flutter call experience.
/// Full implementation requires `flutter_webrtc` and wiring to
/// `MobileNode` call event bus. This skeleton provides the widget
/// shape and placeholder affordances.
class VoiceCallScreen extends StatelessWidget {
  final String peerDisplayName;
  final bool isMuted;
  final VoidCallback onToggleMute;
  final VoidCallback onEndCall;

  const VoiceCallScreen({
    super.key,
    required this.peerDisplayName,
    required this.isMuted,
    required this.onToggleMute,
    required this.onEndCall,
  });

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        title: Text(peerDisplayName),
        leading: const SizedBox.shrink(),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            CircleAvatar(
              radius: 48,
              backgroundColor: colorScheme.primaryContainer,
              child: Icon(Icons.person, size: 48, color: colorScheme.onPrimaryContainer),
            ),
            const SizedBox(height: 24),
            Text(
              peerDisplayName,
              style: Theme.of(context).textTheme.headlineSmall,
            ),
            const SizedBox(height: 8),
            Text(
              'Voice call',
              style: TextStyle(color: colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 48),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Mute button
                IconButton.filled(
                  icon: Icon(isMuted ? Icons.mic_off : Icons.mic),
                  onPressed: onToggleMute,
                  style: IconButton.styleFrom(
                    backgroundColor: isMuted
                        ? colorScheme.errorContainer
                        : colorScheme.surfaceContainerHighest,
                    foregroundColor: isMuted
                        ? colorScheme.onErrorContainer
                        : colorScheme.onSurface,
                  ),
                ),
                const SizedBox(width: 32),
                // End call button
                IconButton.filled(
                  icon: const Icon(Icons.call_end),
                  onPressed: onEndCall,
                  style: IconButton.styleFrom(
                    backgroundColor: colorScheme.error,
                    foregroundColor: colorScheme.onError,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
