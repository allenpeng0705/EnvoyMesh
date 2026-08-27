import 'dart:convert';
import 'package:flutter/material.dart';
import '../ext_agent/agent_attachments.dart';
import '../l10n/app_localizations.dart';
import '../models/chat_message.dart';
import '../utils/localized_labels.dart';
import 'agent_attachment_bar.dart';
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

  /// Agent home-path attaches (absolute / envoy-uploads) — never voice-note UI.
  bool get _hasAgentHomeAttach =>
      message.attachments?.any(
        (a) => isAgentHomePathAttachmentPath(a.vaultRelativePath),
      ) ??
      false;

  /// Whether this message has a vault voice-note (not agent home attach).
  bool get _hasAudio =>
      !_hasAgentHomeAttach &&
      (message.attachments?.any((a) => a.isAudio) ?? false);

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final l10n = AppLocalizations.of(context);
    final displayText = localizeMessageBody(l10n, message.text);
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
                key: ValueKey('${message.id}:${audioAtt.id}'),
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
              else if (message.text != null &&
                  message.text!.startsWith('data:audio/'))
                Text(
                  '[audio preview — see path below]',
                  style: TextStyle(
                    color: colorScheme.onSurface,
                    fontStyle: FontStyle.italic,
                  ),
                )
              else if (displayText.isNotEmpty)
                Text(
                  displayText,
                  style: TextStyle(color: colorScheme.onSurface),
                ),
              if (_hasAgentHomeAttach)
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: AgentAttachmentBar(
                    readOnly: true,
                    attachments: [
                      for (final a in message.attachments!)
                        AgentDraftAttachment(
                          id: a.id.isNotEmpty
                              ? a.id
                              : 'att_${a.filename.hashCode}',
                          path: a.vaultRelativePath ?? a.filename,
                          name: a.filename,
                          mimeType: a.mimeType,
                        ),
                    ],
                  ),
                )
              else if (message.attachments != null &&
                  message.attachments!.any((a) => !a.isAudio))
                Padding(
                  padding: const EdgeInsets.only(top: 6),
                  child: AgentAttachmentBar(
                    readOnly: true,
                    attachments: [
                      for (final a
                          in message.attachments!.where((x) => !x.isAudio))
                        AgentDraftAttachment(
                          id: a.id.isNotEmpty
                              ? a.id
                              : 'att_${a.filename.hashCode}',
                          path: a.vaultRelativePath ?? a.filename,
                          name: a.filename,
                          mimeType: a.mimeType,
                        ),
                    ],
                  ),
                ),
            ],
            if (isOutbound && message.delivery != null) ...[
              const SizedBox(height: 4),
              Text(
                _deliveryLabel(l10n, message.delivery!.deliveryReceipt),
                style: TextStyle(
                  fontSize: 11,
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  String _deliveryLabel(AppLocalizations l10n, String receipt) {
    switch (receipt) {
      case 'delivered':
        return l10n.chatDeliveryDelivered;
      case 'failed':
        return l10n.chatDeliveryFailed;
      case 'pending':
        return l10n.chatDeliverySent;
      default:
        return l10n.chatDeliverySent;
    }
  }
}
