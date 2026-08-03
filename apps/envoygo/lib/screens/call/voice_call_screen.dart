import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../../providers/call_provider.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/node_provider.dart';

/// VoiceCallScreen — Phase 42F native Flutter voice call screen.
///
/// Reachable from:
///   * the [IncomingCallOverlay] Accept button — callProvider flips
///     state to `isActive`, the overlay auto-hides, and the user is
///     pushed to this screen.
///   * a contact tile Call button — the caller side starts the call,
///     state flips to `connecting`, then `isActive`.
///
/// The screen reads the active [CallProvider.state] and exposes:
///   * Peer display name (or owner ID fallback)
///   * Live duration timer (00:00 → mm:ss)
///   * Mute / unmute toggle (calls `callProvider.toggleMute`)
///   * End call (calls `callProvider.endCall`)
///
/// Audio playback uses `RTCVideoRenderer` in audio-only mode — the
/// remote [MediaStream] attached to the [WebRtcCallTransport] is
/// bound to the renderer and the OS routes the output.
///
/// Audio session configuration (`AVAudioSession` on iOS) is handled
/// by [CallProvider] when the call starts and ends — this screen is
/// a passive renderer of state.
class VoiceCallScreen extends ConsumerStatefulWidget {
  const VoiceCallScreen({super.key});

  @override
  ConsumerState<VoiceCallScreen> createState() => _VoiceCallScreenState();
}

class _VoiceCallScreenState extends ConsumerState<VoiceCallScreen> {
  /// Renderer for the remote audio track. Lives for the lifetime of
  /// the screen — disposed in [dispose]. We use `RTCVideoRenderer`
  /// because `flutter_webrtc` exposes only that surface; setting
  /// `mediaStream` plays the audio track without showing a video
  /// element.
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();
  bool _rendererInitialized = false;
  dynamic _boundStream;

  Timer? _durationTimer;
  DateTime? _callStartedAt;
  Duration _elapsed = Duration.zero;

  @override
  void initState() {
    super.initState();
    _initRenderer();
    _startDurationTimer();
  }

  Future<void> _initRenderer() async {
    await _remoteRenderer.initialize();
    if (mounted) setState(() => _rendererInitialized = true);
  }

  void _startDurationTimer() {
    _callStartedAt = DateTime.now();
    _durationTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (!mounted || _callStartedAt == null) return;
      setState(() {
        _elapsed = DateTime.now().difference(_callStartedAt!);
      });
    });
  }

  @override
  void dispose() {
    _durationTimer?.cancel();
    _remoteRenderer.srcObject = null;
    _remoteRenderer.dispose();
    super.dispose();
  }

  Future<void> _endCall() async {
    await ref.read(callProvider).endCall();
    if (mounted) Navigator.of(context).maybePop();
  }

  Future<void> _toggleMute() async {
    await ref.read(callProvider).toggleMute();
  }

  /// Bind the latest remote [MediaStream] from `callProvider.state`
  /// onto the renderer so the audio plays through the device speaker.
  /// Rebinding on identical stream is a no-op.
  void _bindRemoteStreamIfNeeded(dynamic stream) {
    if (stream == null) return;
    if (identical(_boundStream, stream)) return;
    _remoteRenderer.srcObject = stream;
    _boundStream = stream;
  }

  String _formatDuration(Duration d) {
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    if (d.inHours > 0) {
      return '${d.inHours}:$m:$s';
    }
    return '$m:$s';
  }

  @override
  Widget build(BuildContext context) {
    final callState = ref.watch(callProvider).state;
    final colorScheme = Theme.of(context).colorScheme;
    final l10n = AppLocalizations.of(context);

    // Bind the remote stream onto the renderer when the provider
    // signals a new one (typically after WebRTC negotiation completes).
    if (_rendererInitialized) {
      _bindRemoteStreamIfNeeded(callState.remoteStream);
    }

    final peerName = callState.peerDisplayName ?? l10n.commonUnknown;
    final connectionLabel = switch (callState.connectionState) {
      'connected' => l10n.callConnected,
      'connecting' => l10n.callConnecting,
      _ => l10n.callDisconnected,
    };
    final durationLabel = callState.isActive
        ? _formatDuration(_elapsed)
        : _formatDuration(Duration.zero);

    return Scaffold(
      backgroundColor: colorScheme.surface,
      appBar: AppBar(
        title: Text(peerName),
        leading: IconButton(
          icon: const Icon(Icons.expand_more),
          tooltip: l10n.commonHide,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Center(
              child: Text(
                durationLabel,
                style: TextStyle(
                  color: colorScheme.onSurfaceVariant,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            const SizedBox.shrink(),
            // Remote video when present; otherwise avatar + name.
            Expanded(
              child: Center(
                child: _hasRemoteVideo(callState.remoteStream) &&
                        _rendererInitialized
                    ? ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: RTCVideoView(
                          _remoteRenderer,
                          objectFit:
                              RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                        ),
                      )
                    : Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircleAvatar(
                            radius: 64,
                            backgroundColor: colorScheme.primaryContainer,
                            child: Icon(
                              Icons.person,
                              size: 64,
                              color: colorScheme.onPrimaryContainer,
                            ),
                          ),
                          const SizedBox(height: 24),
                          Text(
                            peerName,
                            style: Theme.of(context).textTheme.headlineMedium,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            connectionLabel,
                            style: TextStyle(
                              color: colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
              ),
            ),
            if (_hasRemoteVideo(callState.remoteStream))
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(
                  '$peerName · $connectionLabel',
                  style: TextStyle(color: colorScheme.onSurfaceVariant),
                ),
              ),
            // Action buttons: mute + end
            Padding(
              padding: const EdgeInsets.only(bottom: 48),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton.filled(
                    icon: Icon(
                      callState.isMuted ? Icons.mic_off : Icons.mic,
                    ),
                    onPressed: _toggleMute,
                    style: IconButton.styleFrom(
                      backgroundColor: callState.isMuted
                          ? colorScheme.errorContainer
                          : colorScheme.surfaceContainerHighest,
                      foregroundColor: callState.isMuted
                          ? colorScheme.onErrorContainer
                          : colorScheme.onSurface,
                      padding: const EdgeInsets.all(20),
                    ),
                  ),
                  const SizedBox(width: 32),
                  IconButton.filled(
                    icon: const Icon(Icons.call_end),
                    onPressed: _endCall,
                    style: IconButton.styleFrom(
                      backgroundColor: colorScheme.error,
                      foregroundColor: colorScheme.onError,
                      padding: const EdgeInsets.all(20),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _hasRemoteVideo(dynamic stream) {
    if (stream is! MediaStream) return false;
    try {
      return stream.getVideoTracks().isNotEmpty;
    } catch (_) {
      return false;
    }
  }
}