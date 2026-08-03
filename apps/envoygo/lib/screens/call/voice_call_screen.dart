import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../../providers/call_provider.dart';
import '../../l10n/app_localizations.dart';
import '../../providers/node_provider.dart';

/// VoiceCallScreen — Phase 42F native Flutter voice/video call screen.
class VoiceCallScreen extends ConsumerStatefulWidget {
  const VoiceCallScreen({super.key});

  @override
  ConsumerState<VoiceCallScreen> createState() => _VoiceCallScreenState();
}

class _VoiceCallScreenState extends ConsumerState<VoiceCallScreen> {
  final RTCVideoRenderer _remoteRenderer = RTCVideoRenderer();
  final RTCVideoRenderer _localRenderer = RTCVideoRenderer();
  bool _rendererInitialized = false;
  dynamic _boundRemoteStream;
  dynamic _boundLocalStream;

  Timer? _durationTimer;
  DateTime? _callStartedAt;
  Duration _elapsed = Duration.zero;
  bool _ending = false;

  @override
  void initState() {
    super.initState();
    _initRenderers();
    _startDurationTimer();
  }

  Future<void> _initRenderers() async {
    await Future.wait([
      _remoteRenderer.initialize(),
      _localRenderer.initialize(),
    ]);
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
    _localRenderer.srcObject = null;
    _remoteRenderer.dispose();
    _localRenderer.dispose();
    super.dispose();
  }

  Future<void> _endCall() async {
    if (_ending) return;
    _ending = true;
    try {
      await ref.read(callProvider).endCall();
    } finally {
      if (mounted) Navigator.of(context).maybePop();
    }
  }

  Future<void> _toggleMute() async {
    await ref.read(callProvider).toggleMute();
  }

  Future<void> _switchCamera() async {
    await ref.read(callProvider).switchCamera();
  }

  void _bindRemoteStreamIfNeeded(dynamic stream) {
    if (!_rendererInitialized) return;
    if (stream == null) {
      if (_boundRemoteStream != null) {
        _remoteRenderer.srcObject = null;
        _boundRemoteStream = null;
      }
      return;
    }
    if (identical(_boundRemoteStream, stream)) return;
    _remoteRenderer.srcObject = stream;
    _boundRemoteStream = stream;
  }

  void _bindLocalStreamIfNeeded(dynamic stream) {
    if (!_rendererInitialized) return;
    if (stream == null) {
      if (_boundLocalStream != null) {
        _localRenderer.srcObject = null;
        _boundLocalStream = null;
      }
      return;
    }
    if (identical(_boundLocalStream, stream)) return;
    _localRenderer.srcObject = stream;
    _boundLocalStream = stream;
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
    final callNotifier = ref.watch(callProvider);
    final callState = callNotifier.state;
    final colorScheme = Theme.of(context).colorScheme;
    final l10n = AppLocalizations.of(context);

    // Remote hangup / reject — leave the screen automatically.
    if (!_ending &&
        callState.callId == null &&
        callState.connectionState == 'disconnected' &&
        !callState.isIncoming) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_ending) {
          _ending = true;
          Navigator.of(context).maybePop();
        }
      });
    }

    _bindRemoteStreamIfNeeded(callState.remoteStream);
    _bindLocalStreamIfNeeded(callState.localStream);

    final peerName = callState.peerDisplayName ?? l10n.commonUnknown;
    final isVideoCall = callNotifier.isVideoCall;
    final hasRemoteVideo = _hasVideo(callState.remoteStream);
    final hasLocalVideo = isVideoCall && _hasVideo(callState.localStream);
    final connectionLabel = switch (callState.connectionState) {
      'connected' => l10n.callConnected,
      'connecting' => l10n.callConnecting,
      _ => l10n.callDisconnected,
    };
    final durationLabel = callState.isActive ||
            callState.connectionState == 'connecting'
        ? _formatDuration(_elapsed)
        : _formatDuration(Duration.zero);

    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black87,
        foregroundColor: Colors.white,
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
                style: const TextStyle(
                  color: Colors.white70,
                  fontFeatures: [FontFeature.tabularFigures()],
                ),
              ),
            ),
          ),
        ],
      ),
      body: SafeArea(
        child: Stack(
          children: [
            // Remote / placeholder
            Positioned.fill(
              child: hasRemoteVideo && _rendererInitialized
                  ? RTCVideoView(
                      _remoteRenderer,
                      objectFit:
                          RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                    )
                  : Column(
                      mainAxisAlignment: MainAxisAlignment.center,
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
                          style: Theme.of(context)
                              .textTheme
                              .headlineMedium
                              ?.copyWith(color: Colors.white),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          connectionLabel,
                          style: const TextStyle(color: Colors.white70),
                        ),
                      ],
                    ),
            ),
            // Local self-view (PiP)
            if (hasLocalVideo && _rendererInitialized)
              Positioned(
                right: 16,
                top: 16,
                width: 110,
                height: 160,
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: ColoredBox(
                    color: Colors.black54,
                    child: RTCVideoView(
                      _localRenderer,
                      mirror: true,
                      objectFit:
                          RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
                    ),
                  ),
                ),
              ),
            if (hasRemoteVideo)
              Positioned(
                left: 16,
                bottom: 120,
                child: Text(
                  '$peerName · $connectionLabel',
                  style: const TextStyle(color: Colors.white70),
                ),
              ),
            // Controls
            Positioned(
              left: 0,
              right: 0,
              bottom: 36,
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
                          : Colors.white24,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.all(20),
                    ),
                  ),
                  if (isVideoCall) ...[
                    const SizedBox(width: 24),
                    IconButton.filled(
                      icon: const Icon(Icons.cameraswitch),
                      tooltip: l10n.callSwitchCamera,
                      onPressed: _switchCamera,
                      style: IconButton.styleFrom(
                        backgroundColor: Colors.white24,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.all(20),
                      ),
                    ),
                  ],
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

  bool _hasVideo(dynamic stream) {
    if (stream is! MediaStream) return false;
    try {
      return stream.getVideoTracks().any((t) => t.enabled);
    } catch (_) {
      return false;
    }
  }
}
