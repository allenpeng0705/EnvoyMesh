import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import '../models/chat_message.dart';

/// Inline voice note playback with play/pause controls.
class ChatAudioPlayer extends StatefulWidget {
  final ChatAttachment attachment;
  final String? transcription;
  final Future<String?> Function(String vaultRelativePath) onLoadAudio;

  const ChatAudioPlayer({
    super.key,
    required this.attachment,
    this.transcription,
    required this.onLoadAudio,
  });

  @override
  State<ChatAudioPlayer> createState() => _ChatAudioPlayerState();
}

class _ChatAudioPlayerState extends State<ChatAudioPlayer> {
  final _player = AudioPlayer();
  String? _tempFilePath;
  bool _loading = true;
  bool _error = false;
  bool _playing = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  StreamSubscription<Duration>? _positionSub;
  StreamSubscription<Duration>? _durationSub;
  StreamSubscription<void>? _completeSub;

  @override
  void initState() {
    super.initState();
    _positionSub = _player.onPositionChanged.listen((pos) {
      if (mounted) setState(() => _position = pos);
    });
    _durationSub = _player.onDurationChanged.listen((dur) {
      if (mounted) setState(() => _duration = dur);
    });
    _completeSub = _player.onPlayerComplete.listen((_) {
      if (mounted) setState(() => _playing = false);
    });
    _load();
  }

  @override
  void dispose() {
    _positionSub?.cancel();
    _durationSub?.cancel();
    _completeSub?.cancel();
    _player.dispose();
    final path = _tempFilePath;
    if (path != null) {
      // Best-effort temp file cleanup.
      File(path).delete();
    }
    super.dispose();
  }

  Future<void> _load() async {
    final vaultPath = widget.attachment.vaultRelativePath;
    if (vaultPath == null || vaultPath.isEmpty) {
      setState(() {
        _loading = false;
        _error = true;
      });
      return;
    }
    try {
      final contentBase64 = await widget.onLoadAudio(vaultPath);
      if (contentBase64 == null || !mounted) {
        setState(() {
          _loading = false;
          _error = true;
        });
        return;
      }
      final bytes = base64Decode(contentBase64);
      final ext = widget.attachment.mimeType.contains('mp4') ? 'm4a' : 'webm';
      final file = File(
        '${Directory.systemTemp.path}/voice_play_${DateTime.now().microsecondsSinceEpoch}.$ext',
      );
      await file.writeAsBytes(bytes);
      _tempFilePath = file.path;
      final hintSec = widget.attachment.durationSec;
      if (hintSec != null && hintSec > 0) {
        _duration = Duration(seconds: hintSec);
      }
      setState(() => _loading = false);
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = true;
        });
      }
    }
  }

  Future<void> _togglePlayback() async {
    final path = _tempFilePath;
    if (path == null) return;
    if (_playing) {
      await _player.pause();
      if (mounted) setState(() => _playing = false);
      return;
    }
    await _player.play(DeviceFileSource(path));
    if (mounted) setState(() => _playing = true);
  }

  String _formatDuration(Duration d) {
    final total = d.inSeconds;
    final minutes = total ~/ 60;
    final seconds = total % 60;
    return '$minutes:${seconds.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final totalLabel = _duration.inSeconds > 0
        ? _formatDuration(_duration)
        : _formatDurationFromHint(
            widget.attachment.durationSec,
            widget.attachment.sizeBytes,
          );

    return Container(
      constraints: const BoxConstraints(maxWidth: 280),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: colorScheme.surfaceContainerHighest.withAlpha(120),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          if (_loading)
            Row(
              children: [
                SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: colorScheme.primary,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'Loading audio…',
                  style: TextStyle(color: colorScheme.onSurfaceVariant, fontSize: 13),
                ),
              ],
            )
          else if (_error || _tempFilePath == null)
            Row(
              children: [
                Icon(Icons.error_outline, size: 20, color: colorScheme.error),
                const SizedBox(width: 8),
                Text(
                  'Audio unavailable',
                  style: TextStyle(color: colorScheme.error, fontSize: 13),
                ),
              ],
            )
          else
            Row(
              children: [
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: Icon(
                    _playing ? Icons.pause_circle_filled : Icons.play_circle_filled,
                    size: 36,
                    color: colorScheme.primary,
                  ),
                  onPressed: _togglePlayback,
                  tooltip: _playing ? 'Pause' : 'Play',
                ),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Voice note',
                        style: TextStyle(color: colorScheme.onSurface, fontSize: 14),
                      ),
                      Text(
                        '${_formatDuration(_position)} / $totalLabel',
                        style: TextStyle(
                          color: colorScheme.onSurfaceVariant,
                          fontSize: 12,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          if (widget.transcription != null && widget.transcription!.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              widget.transcription!,
              style: TextStyle(
                color: colorScheme.onSurfaceVariant,
                fontSize: 13,
                fontStyle: FontStyle.italic,
              ),
              maxLines: 3,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }

  String _formatDurationFromHint(int? durationSec, int sizeBytes) {
    if (durationSec != null && durationSec > 0) {
      return _formatDuration(Duration(seconds: durationSec));
    }
    final est = sizeBytes ~/ 4000;
    return _formatDuration(Duration(seconds: est.clamp(1, 9999)));
  }
}
