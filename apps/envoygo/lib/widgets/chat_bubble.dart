import 'dart:convert';
import 'package:flutter/material.dart';
import '../l10n/app_localizations.dart';
import '../models/chat_message.dart';
import 'chat_audio_player.dart';

/// Chat bubble widget for a single message.
class ChatBubble extends StatelessWidget {
  final ChatMessage message;
  final bool isOutbound;
  final Future<String?> Function(String vaultRelativePath)? onLoadAudio;

  const ChatBubble({
    super.key,
    required this.message,
    required this.isOutbound,
    this.onLoadAudio,
  });

  /// Whether this message has an audio attachment.
  bool get _hasAudio => message.attachments?.any((a) => a.isAudio) ?? false;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final audioAtt = _hasAudio
        ? message.attachments!.firstWhere((a) => a.isAudio)
        : null;

    return Align(
      alignment: isOutbound ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.only(top: 4, bottom: 4),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        constraints: const BoxConstraints(maxWidth: 300),
        decoration: BoxDecoration(
          color: isOutbound
              ? colorScheme.primaryContainer
              : colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: isOutbound
                ? const Radius.circular(16)
                : const Radius.circular(4),
            bottomRight: isOutbound
                ? const Radius.circular(4)
                : const Radius.circular(16),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (message.senderDisplayName != null)
              Text(
                message.senderDisplayName == 'You'
                    ? AppLocalizations.of(context).commonYouName
                    : message.senderDisplayName!,
                style: TextStyle(
                  fontWeight: FontWeight.w600,
                  fontSize: 12,
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
            if (audioAtt != null && onLoadAudio != null) ...[
              ChatAudioPlayer(
                attachment: audioAtt,
                transcription: message.text,
                onLoadAudio: onLoadAudio!,
              ),
            ] else ...[
              const SizedBox(height: 2),
              if (message.text != null &&
                  message.text!.startsWith('data:image/'))
                Builder(
                  builder: (context) {
                    try {
                      final raw = message.text!.split(',').last;
                      final bytes = base64Decode(raw);
                      return ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: Image.memory(
                          bytes,
                          width: 200,
                          fit: BoxFit.cover,
                        ),
                      );
                    } catch (_) {
                      return Text(
                        '[image]',
                        style: TextStyle(color: colorScheme.onSurface),
                      );
                    }
                  },
                )
              else
                Text(
                  message.text ?? '',
                  style: TextStyle(color: colorScheme.onSurface),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
