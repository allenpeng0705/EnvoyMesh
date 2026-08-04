import 'dart:async';

import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'models/call_event.dart';

/// Phase 42D — native Flutter WebRTC transport for EnvoyGo voice/video calls.
///
/// Mirrors `apps/social/src/lib/webrtc-call-transport.ts` using
/// `flutter_webrtc`. Path 2 only (ICE); no libp2p data-channel path.
class WebRtcCallTransport {
  /// Optional callId used to label this transport in logs.
  final String callId;
  final List<IceServer> iceServers;
  final void Function(MediaStream stream) onRemoteStream;
  final void Function(RTCPeerConnectionState state) onConnectionStateChange;
  final void Function(String sdp, String type) onSdpGenerated;
  final void Function(CallIceCandidate candidate) onIceCandidate;

  /// Fired whenever the local capture stream is created or replaced
  /// (e.g. after a camera flip). UI binds this for self-view.
  final void Function(MediaStream stream)? onLocalStream;

  /// When true, capture camera + offer to receive video (video calls).
  final bool enableVideo;

  /// Pluggable factory for the underlying [RTCPeerConnection].
  final Future<RTCPeerConnection> Function(Map<String, dynamic> config)?
      peerConnectionFactory;

  /// Pluggable factory for local [MediaStream] (tests inject a fake).
  final Future<MediaStream> Function(Map<String, dynamic> constraints)?
      getUserMedia;

  /// Pluggable factory for the composite remote stream used when
  /// `onTrack` arrives with an empty `streams` list (common on mobile).
  final Future<MediaStream> Function(String label)? createRemoteMediaStream;

  RTCPeerConnection? _pc;
  MediaStream? _localStream;
  MediaStream? _remoteMediaStream;
  /// Bumped on [close] so in-flight `onTrack` handlers stop publishing.
  int _remoteTrackEpoch = 0;
  bool _isClosed = false;
  bool _isMuted = false;
  /// `true` = front (user), `false` = back (environment).
  bool _facingUser = true;
  bool _switchingCamera = false;

  WebRtcCallTransport({
    required this.callId,
    required this.iceServers,
    required this.onRemoteStream,
    required this.onConnectionStateChange,
    required this.onSdpGenerated,
    required this.onIceCandidate,
    this.onLocalStream,
    this.enableVideo = false,
    this.peerConnectionFactory,
    this.getUserMedia,
    this.createRemoteMediaStream,
  });

  bool get isClosed => _isClosed;
  bool get isMuted => _isMuted;
  bool get facingUser => _facingUser;

  /// Local capture stream (self-view / mute).
  MediaStream? get localStream => _localStream;

  Map<String, dynamic> _rtcConfiguration() {
    return {
      'iceServers': iceServers
          .map((s) => {
                'urls': s.urls,
                if (s.username != null) 'username': s.username,
                if (s.credential != null) 'credential': s.credential,
              })
          .toList(),
      'sdpSemantics': 'unified-plan',
    };
  }

  Map<String, dynamic> _mediaConstraints({required bool video}) {
    return {
      'audio': true,
      if (video)
        'video': {
          'facingMode': _facingUser ? 'user' : 'environment',
          'mandatory': {
            'minWidth': '640',
            'minHeight': '480',
            'minFrameRate': '15',
          },
          'optional': <Map<String, dynamic>>[],
        }
      else
        'video': false,
    };
  }

  Future<RTCPeerConnection> _buildPeerConnection() async {
    final factory = peerConnectionFactory ?? createPeerConnection;
    final pc = await factory(_rtcConfiguration());
    // Pre-allocate so onTrack can merge tracks when `streams` is empty
    // (Chrome→flutter_webrtc often delivers video this way).
    _remoteMediaStream ??= await (createRemoteMediaStream ??
        createLocalMediaStream)('remote-$callId');
    pc.onIceCandidate = (RTCIceCandidate? c) {
      if (_isClosed || c == null) return;
      onIceCandidate(CallIceCandidate(
        candidate: c.candidate ?? '',
        sdpMid: c.sdpMid,
        sdpMLineIndex: c.sdpMLineIndex,
      ));
    };
    pc.onConnectionState = (RTCPeerConnectionState state) {
      if (_isClosed) return;
      onConnectionStateChange(state);
    };
    pc.onAddStream = (MediaStream stream) {
      if (_isClosed) return;
      // Unified-plan still sometimes fires onAddStream — fold into composite.
      unawaited(_handleRemoteTracksFromStream(stream));
    };
    pc.onTrack = (RTCTrackEvent event) {
      if (_isClosed) return;
      unawaited(_handleRemoteTrack(event));
    };
    return pc;
  }

  Future<void> _handleRemoteTracksFromStream(MediaStream stream) async {
    for (final track in stream.getTracks()) {
      if (_isClosed) return;
      await _ingestRemoteTrack(
        track,
        fallbackStream: stream,
        via: 'addStream',
      );
    }
  }

  /// Always accumulate remote audio/video into one composite stream.
  ///
  /// Publishing `event.streams.first` for some tracks and a separate composite
  /// for others caused Mac video to vanish when a later empty-stream audio
  /// track replaced the UI stream. One composite avoids that overwrite.
  Future<void> _handleRemoteTrack(RTCTrackEvent event) async {
    if (_isClosed) return;
    await _ingestRemoteTrack(
      event.track,
      fallbackStream: event.streams.isNotEmpty ? event.streams.first : null,
      via: event.streams.isNotEmpty ? 'stream' : 'track',
    );
  }

  Future<void> _ingestRemoteTrack(
    MediaStreamTrack track, {
    MediaStream? fallbackStream,
    required String via,
  }) async {
    if (_isClosed) return;
    final kind = track.kind;
    if (kind != 'audio' && kind != 'video') return;

    final epoch = _remoteTrackEpoch;
    final remote = _remoteMediaStream;
    if (remote == null) {
      // Composite not ready — last resort so video is not dropped entirely.
      if (fallbackStream != null && !_isClosed) {
        // ignore: avoid_print
        print(
          '[WebRtcCallTransport] remote-track via=$via kind=$kind '
          'id=${track.id} (no composite; using fallback stream)',
        );
        onRemoteStream(fallbackStream);
      }
      return;
    }

    final already = remote.getTracks().any((t) => t.id == track.id);
    if (!already) {
      try {
        await remote.addTrack(track);
      } catch (err) {
        // ignore: avoid_print
        print(
          '[WebRtcCallTransport] remote addTrack failed via=$via '
          'kind=$kind id=${track.id}: $err',
        );
        // Platform rejected grafting onto the composite — publish the
        // peer-provided stream if it carries this track (and prefer keeping
        // any video already shown on the composite).
        if (_isClosed || epoch != _remoteTrackEpoch) return;
        if (fallbackStream != null) {
          final compositeHasVideo = remote.getVideoTracks().isNotEmpty;
          final fallbackHasVideo = fallbackStream.getVideoTracks().isNotEmpty;
          if (!compositeHasVideo || fallbackHasVideo) {
            onRemoteStream(fallbackStream);
          }
        }
        return;
      }
    }

    if (_isClosed ||
        epoch != _remoteTrackEpoch ||
        !identical(_remoteMediaStream, remote)) {
      return;
    }
    // ignore: avoid_print
    print(
      '[WebRtcCallTransport] remote-track via=$via kind=$kind id=${track.id}',
    );
    onRemoteStream(remote);
  }

  Future<MediaStream> _acquireLocalMedia() async {
    final factory =
        getUserMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
    try {
      return await factory(_mediaConstraints(video: enableVideo));
    } catch (err) {
      if (enableVideo) {
        // Camera failed — still try audio-only so the call can proceed.
        try {
          final audioOnly = await factory(_mediaConstraints(video: false));
          // ignore: avoid_print
          print(
            '[WebRtcCallTransport] camera unavailable, continuing audio-only: $err',
          );
          return audioOnly;
        } catch (_) {
          throw Exception('Camera/microphone access denied: $err');
        }
      }
      throw Exception('Microphone access denied: $err');
    }
  }

  /// Acquire the local microphone (and camera when [enableVideo]) and
  /// add tracks to the peer connection.
  Future<void> _attachLocalMedia(RTCPeerConnection pc) async {
    if (_localStream != null) return;
    _localStream = await _acquireLocalMedia();
    for (final track in _localStream!.getTracks()) {
      await pc.addTrack(track, _localStream!);
    }
    // Camera failed but this is still a video call — advertise recvonly
    // so Mac's camera can still be received/rendered.
    if (enableVideo && _localStream!.getVideoTracks().isEmpty) {
      try {
        await pc.addTransceiver(
          kind: RTCRtpMediaType.RTCRtpMediaTypeVideo,
          init: RTCRtpTransceiverInit(
            direction: TransceiverDirection.RecvOnly,
          ),
        );
      } catch (err) {
        // ignore: avoid_print
        print('[WebRtcCallTransport] recvonly video transceiver failed: $err');
      }
    }
    // Restore mute preference if set before tracks existed.
    if (_isMuted) {
      for (final track in _localStream!.getAudioTracks()) {
        track.enabled = false;
      }
    }
    onLocalStream?.call(_localStream!);
  }

  /// Start as the offerer (caller).
  Future<String> startOffer() async {
    if (_isClosed) throw StateError('Transport closed');
    final pc = await _buildPeerConnection();
    _pc = pc;

    await _attachLocalMedia(pc);

    final offer = await pc.createOffer({
      'offerToReceiveAudio': true,
      'offerToReceiveVideo': enableVideo,
    });
    await pc.setLocalDescription(offer);
    onSdpGenerated(offer.sdp ?? '', 'offer');
    return offer.sdp ?? '';
  }

  /// Start as the answerer (callee).
  Future<String> startAnswer(String remoteSdp) async {
    if (_isClosed) throw StateError('Transport closed');
    final pc = await _buildPeerConnection();
    _pc = pc;

    await _attachLocalMedia(pc);

    await pc.setRemoteDescription(
      RTCSessionDescription(remoteSdp, 'offer'),
    );

    final answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    onSdpGenerated(answer.sdp ?? '', 'answer');
    return answer.sdp ?? '';
  }

  /// Apply the remote SDP answer on the caller side after `call:answered`.
  Future<void> applyRemoteAnswer(String remoteSdp) async {
    final pc = _pc;
    if (pc == null || _isClosed) {
      throw StateError('Transport not ready for remote answer');
    }
    await pc.setRemoteDescription(
      RTCSessionDescription(remoteSdp, 'answer'),
    );
  }

  /// Apply a remote ICE candidate trickled in via `call.ice-candidate`.
  Future<void> addIceCandidate(CallIceCandidate candidate) async {
    final pc = _pc;
    if (pc == null || _isClosed) return;
    try {
      await pc.addCandidate(RTCIceCandidate(
        candidate.candidate,
        candidate.sdpMid,
        candidate.sdpMLineIndex,
      ));
    } catch (err) {
      // ignore: avoid_print
      print('[WebRtcCallTransport] addIceCandidate failed: $err');
    }
  }

  /// Mute/unmute the local audio track by toggling `enabled`.
  void setMute(bool muted) {
    _isMuted = muted;
    final stream = _localStream;
    if (stream == null) return;
    for (final track in stream.getAudioTracks()) {
      track.enabled = !muted;
    }
  }

  /// Flip front/back camera on the local video track (mobile).
  ///
  /// Tries `Helper.switchCamera` first; on failure replaces the sender
  /// track with a fresh `getUserMedia` capture so the call stays usable.
  Future<bool> switchCamera() async {
    if (!enableVideo || _isClosed || _switchingCamera) return false;
    final stream = _localStream;
    final pc = _pc;
    if (stream == null || pc == null) return false;
    final tracks = stream.getVideoTracks();
    if (tracks.isEmpty) return false;

    _switchingCamera = true;
    final nextFacingUser = !_facingUser;
    try {
      // Path A — native flip (keeps the same track id / sender).
      try {
        await Helper.switchCamera(tracks.first);
        _facingUser = nextFacingUser;
        // Re-notify so self-view mirrors update.
        onLocalStream?.call(stream);
        return true;
      } catch (err) {
        // ignore: avoid_print
        print('[WebRtcCallTransport] Helper.switchCamera failed: $err');
      }

      // Path B — replaceTrack with a new facingMode capture.
      return await _replaceVideoTrack(pc, nextFacingUser);
    } finally {
      _switchingCamera = false;
    }
  }

  Future<bool> _replaceVideoTrack(
    RTCPeerConnection pc,
    bool facingUser,
  ) async {
    final factory =
        getUserMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c));
    final prevFacing = _facingUser;
    _facingUser = facingUser;
    MediaStream? fresh;
    try {
      fresh = await factory({
        'audio': false,
        'video': {
          'facingMode': facingUser ? 'user' : 'environment',
          'mandatory': {
            'minWidth': '640',
            'minHeight': '480',
            'minFrameRate': '15',
          },
          'optional': <Map<String, dynamic>>[],
        },
      });
      final newTracks = fresh.getVideoTracks();
      if (newTracks.isEmpty) {
        _facingUser = prevFacing;
        await _stopStream(fresh);
        return false;
      }
      final newVideo = newTracks.first;

      RTCRtpSender? videoSender;
      try {
        for (final sender in await pc.getSenders()) {
          if (sender.track?.kind == 'video') {
            videoSender = sender;
            break;
          }
        }
      } catch (_) {}

      if (videoSender != null) {
        await videoSender.replaceTrack(newVideo);
      } else {
        await pc.addTrack(newVideo, fresh);
      }

      final old = _localStream;
      if (old != null) {
        for (final track in List<MediaStreamTrack>.from(old.getVideoTracks())) {
          try {
            await old.removeTrack(track);
          } catch (_) {}
          try {
            track.enabled = false;
            await track.stop();
          } catch (_) {}
        }
        try {
          await old.addTrack(newVideo);
          _localStream = old;
        } catch (_) {
          // Platform rejected grafting — keep mic on [old], video on [fresh].
          _localStream = fresh;
          for (final audio in old.getAudioTracks()) {
            try {
              await fresh.addTrack(audio);
            } catch (_) {}
          }
        }
      } else {
        _localStream = fresh;
      }

      if (_isMuted) {
        for (final track in _localStream!.getAudioTracks()) {
          track.enabled = false;
        }
      }
      onLocalStream?.call(_localStream!);
      return true;
    } catch (err) {
      _facingUser = prevFacing;
      // ignore: avoid_print
      print('[WebRtcCallTransport] replaceVideoTrack failed: $err');
      if (fresh != null) await _stopStream(fresh);
      return false;
    }
  }

  Future<void> _stopStream(MediaStream stream) async {
    for (final track in stream.getTracks()) {
      try {
        track.enabled = false;
        await track.stop();
      } catch (_) {}
    }
    try {
      await stream.dispose();
    } catch (_) {}
  }

  /// Tear down: clear handlers, stop tracks, close peer connection.
  /// Idempotent — safe to call multiple times / after errors.
  Future<void> close() async {
    if (_isClosed) return;
    _isClosed = true;
    _remoteTrackEpoch++;

    final pc = _pc;
    _pc = null;
    if (pc != null) {
      try {
        pc.onIceCandidate = null;
        pc.onTrack = null;
        pc.onAddStream = null;
        pc.onConnectionState = null;
      } catch (_) {}
      try {
        final senders = await pc.getSenders();
        for (final sender in senders) {
          try {
            await pc.removeTrack(sender);
          } catch (_) {}
        }
      } catch (_) {}
      try {
        await pc.close();
      } catch (_) {}
    }

    final stream = _localStream;
    _localStream = null;
    if (stream != null) {
      await _stopStream(stream);
    }

    final remote = _remoteMediaStream;
    _remoteMediaStream = null;
    if (remote != null) {
      try {
        await remote.dispose();
      } catch (_) {}
    }
  }
}
