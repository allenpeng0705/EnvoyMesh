import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:flutter/material.dart';
import 'package:path/path.dart' as p;

import '../l10n/app_localizations.dart';
import '../models/chat_message.dart';

/// Voice-note player for chat attachments.
///
/// Loads bytes from the home vault via [onLoadAudio], writes a temp file,
/// and plays with [AudioPlayer] (supports m4a/mp4/aac; webm may fail on iOS).
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
  final AudioPlayer _player = AudioPlayer();
  final List<StreamSubscription<dynamic>> _subs = [];
  File? _tempFile;
  bool _loading = true;
  bool _error = false;
  bool _playing = false;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;

  @override
  void initState() {
    super.initState();
    _subs.add(_player.onPlayerStateChanged.listen((state) {
      if (!mounted) return;
      setState(() => _playing = state == PlayerState.playing);
    }));
    _subs.add(_player.onPositionChanged.listen((pos) {
      if (!mounted) return;
      setState(() => _position = pos);
    }));
    _subs.add(_player.onDurationChanged.listen((dur) {
      if (!mounted) return;
      setState(() => _duration = dur);
    }));
    _subs.add(_player.onPlayerComplete.listen((_) {
      if (!mounted) return;
      setState(() {
        _playing = false;
        _position = Duration.zero;
      });
    }));
    _load();
  }

  @override
  void dispose() {
    for (final s in _subs) {
      s.cancel();
    }
    _subs.clear();
    _player.dispose();
    final file = _tempFile;
    if (file != null) {
      unawaited(file.delete().catchError((_) => file));
    }
    super.dispose();
  }

  String _extForMime(String? mime) {
    final m = (mime ?? '').toLowerCase();
    if (m.contains('webm')) return 'webm';
    if (m.contains('ogg')) return 'ogg';
    if (m.contains('mpeg') || m.contains('mp3')) return 'mp3';
    if (m.contains('wav')) return 'wav';
    // AAC in MP4 container (EnvoyGo record + many Social exports)
    return 'm4a';
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
      if (contentBase64 == null || contentBase64.isEmpty) {
        if (mounted) {
          setState(() {
            _loading = false;
            _error = true;
          });
        }
        return;
      }
      final bytes = base64Decode(contentBase64);
      if (bytes.isEmpty) {
        if (mounted) {
          setState(() {
            _loading = false;
            _error = true;
          });
        }
        return;
      }
      final ext = _extForMime(widget.attachment.mimeType);
      final file = File(
        p.join(
          Directory.systemTemp.path,
          'envoy_voice_${DateTime.now().microsecondsSinceEpoch}.$ext',
        ),
      );
      await file.writeAsBytes(bytes, flush: true);
      _tempFile = file;
      await _player.setSource(DeviceFileSource(file.path));
      if (widget.attachment.durationSec != null &&
          widget.attachment.durationSec! > 0) {
        _duration = Duration(seconds: widget.attachment.durationSec!);
      }
      if (mounted) {
        setState(() {
          _loading = false;
          _error = false;
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loading = false;
          _error = true;
        });
      }
    }
  }

  Future<void> _togglePlay() async {
    if (_error || _tempFile == null) return;
    try {
      if (_playing) {
        await _player.pause();
      } else {
        if (_position > Duration.zero &&
            _duration > Duration.zero &&
            _position >= _duration) {
          await _player.seek(Duration.zero);
        }
        await _player.resume();
      }
    } catch (_) {
      try {
        await _player.play(DeviceFileSource(_tempFile!.path));
      } catch (_) {
        if (mounted) {
          setState(() => _error = true);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(AppLocalizations.of(context).audioUnavailable),
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final colorScheme = Theme.of(context).colorScheme;
    final total = _duration > Duration.zero
        ? _duration
        : Duration(seconds: widget.attachment.durationSec ?? 0);
    final progress = total.inMilliseconds > 0
        ? (_position.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;

    return Container(
      constraints: const BoxConstraints(maxWidth: 300),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
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
                  l10n.audioLoading,
                  style: TextStyle(
                    color: colorScheme.onSurfaceVariant,
                    fontSize: 13,
                  ),
                ),
              ],
            )
          else if (_error)
            Row(
              children: [
                Icon(Icons.error_outline, size: 20, color: colorScheme.error),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    l10n.audioUnavailable,
                    style: TextStyle(color: colorScheme.error, fontSize: 13),
                  ),
                ),
              ],
            )
          else ...[
            Row(
              children: [
                IconButton(
                  icon: Icon(
                    _playing ? Icons.pause_circle_filled : Icons.play_circle_filled,
                    size: 36,
                    color: colorScheme.primary,
                  ),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                  tooltip: _playing ? l10n.chatStopRecording : l10n.audioVoiceNote,
                  onPressed: _togglePlay,
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        l10n.audioVoiceNote,
                        style: TextStyle(
                          color: colorScheme.onSurface,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 4),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(2),
                        child: LinearProgressIndicator(
                          value: progress,
                          minHeight: 4,
                          backgroundColor: colorScheme.outlineVariant,
                          color: colorScheme.primary,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${_fmt(_position)} / ${_fmt(total)}',
                        style: TextStyle(
                          color: colorScheme.onSurfaceVariant,
                          fontSize: 11,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
            if (widget.transcription != null &&
                widget.transcription!.isNotEmpty) ...[
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
        ],
      ),
    );
  }

  String _fmt(Duration d) {
    final m = d.inMinutes.remainder(60);
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$m:$s';
  }
}
