import 'package:flutter/material.dart';
import '../models/chat_message.dart';

/// Audio player widget for voice notes (Phase 37).
///
/// Fetches the audio file from the vault via [onLoadAudio] and
/// renders playback controls. If a transcription is available via
/// [message.text], it is shown below the player.
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
  String? _audioUrl;
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    _load();
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
      if (contentBase64 != null && mounted) {
        setState(() {
          _audioUrl = 'data:${widget.attachment.mimeType};base64,$contentBase64';
          _loading = false;
        });
      } else {
        setState(() { _loading = false; _error = true; });
      }
    } catch (_) {
      if (mounted) setState(() { _loading = false; _error = true; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

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
                Text('Loading audio…',
                    style: TextStyle(color: colorScheme.onSurfaceVariant, fontSize: 13)),
              ],
            )
          else if (_error || _audioUrl == null)
            Row(
              children: [
                Icon(Icons.error_outline, size: 20, color: colorScheme.error),
                const SizedBox(width: 8),
                Text('Audio unavailable',
                    style: TextStyle(color: colorScheme.error, fontSize: 13)),
              ],
            )
          else ...[
            // Simple playback button (no full audio player widget in Flutter;
            // launch via url_launcher or use a package for inline playback).
            // For MVP we render a play-button that says "Voice note".
            Row(
              children: [
                Icon(Icons.play_circle_filled,
                    size: 32, color: colorScheme.primary),
                const SizedBox(width: 8),
                Text(
                  'Voice note',
                  style: TextStyle(
                      color: colorScheme.onSurface, fontSize: 14),
                ),
                const Spacer(),
                Text(
                  _formatDuration(widget.attachment.durationSec, widget.attachment.sizeBytes),
                  style: TextStyle(
                      color: colorScheme.onSurfaceVariant, fontSize: 12),
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
                    fontStyle: FontStyle.italic),
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ],
        ],
      ),
    );
  }

  /// Format duration for display. Uses [durationSec] when available,
  /// otherwise falls back to an estimate from byte size (~32 kbps Opus).
  String _formatDuration(int? durationSec, int sizeBytes) {
    if (durationSec != null && durationSec > 0) {
      final minutes = durationSec ~/ 60;
      final seconds = durationSec % 60;
      if (minutes > 0) return '${minutes}:${seconds.toString().padLeft(2, '0')}';
      return '0:${seconds.toString().padLeft(2, '0')}';
    }
    // Fallback to byte-size estimate
    final est = sizeBytes ~/ 4000;
    if (est < 60) return '0:${est.toString().padLeft(2, '0')}';
    return '${est ~/ 60}:${(est % 60).toString().padLeft(2, '0')}';
  }
}
