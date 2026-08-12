// Agent chat attachment helpers for EnvoyGo (mirrors Social agent-attachments.ts).

import '../models/chat_message.dart';

class AgentDraftAttachment {
  final String id;
  final String path;
  final String? name;
  final String? mimeType;

  const AgentDraftAttachment({
    required this.id,
    required this.path,
    this.name,
    this.mimeType,
  });

  Map<String, String> toRpc() => {
        'path': path,
        if (name != null && name!.isNotEmpty) 'name': name!,
        if (mimeType != null && mimeType!.isNotEmpty) 'mimeType': mimeType!,
      };
}

String attachmentBasename(String path) {
  final norm = path.replaceAll('\\', '/');
  final i = norm.lastIndexOf('/');
  return i >= 0 ? norm.substring(i + 1) : (norm.isEmpty ? 'file' : norm);
}

String mergeAgentPromptWithAttachments(String text, String? contextText) {
  final body = text.trim();
  final ctx = contextText?.trim() ?? '';
  if (ctx.isEmpty) return body;
  if (body.isEmpty) return ctx;
  return '$body\n\n$ctx';
}

String guessMimeFromName(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}

/// Soft cap matching Social / node MAX_CHAT_ATTACHMENT_BYTES (25 MiB).
const maxAgentAttachmentBytes = 25 * 1024 * 1024;

/// Marker prepended by home `buildAgentAttachmentContext`.
const agentAttachmentContextMarker = 'Attached files (on home node):';

bool looksLikeAgentAttachmentOutbound(String? text) {
  final t = text ?? '';
  return t.contains(agentAttachmentContextMarker);
}

/// True when [outboundEcho] is the expanded home prompt for [displayText].
bool agentAttachmentEchoMatchesDisplay({
  required String? displayText,
  required String? outboundEcho,
}) {
  final echo = (outboundEcho ?? '').trim();
  final display = (displayText ?? '').trim();
  if (echo.isEmpty || !looksLikeAgentAttachmentOutbound(echo)) return false;
  if (display.isEmpty) {
    return echo.startsWith(agentAttachmentContextMarker) ||
        echo.contains('\n$agentAttachmentContextMarker');
  }
  if (echo == display) return true;
  if (echo.startsWith('$display\n\n$agentAttachmentContextMarker')) return true;
  if (echo.startsWith('$display\n\n') &&
      echo.contains(agentAttachmentContextMarker)) {
    return true;
  }
  return false;
}

/// Absolute home / envoy-uploads paths (not vault-relative chat attachments).
bool isAgentHomePathAttachmentPath(String? path) {
  if (path == null || path.isEmpty) return false;
  if (path.startsWith('/')) return true;
  if (path.length > 2 && path[1] == ':') return true; // Windows drive
  return path.contains('envoy-uploads');
}

bool messageHasAgentHomeAttachments(ChatMessage? message) {
  final atts = message?.attachments;
  if (atts == null || atts.isEmpty) return false;
  return atts.any((a) => isAgentHomePathAttachmentPath(a.vaultRelativePath));
}

/// Drop the injected context block for display when no local bubble matched.
String stripAgentAttachmentContextForDisplay(String text) {
  final trimmed = text.trim();
  if (!looksLikeAgentAttachmentOutbound(trimmed)) return text;
  const marker = '\n\n$agentAttachmentContextMarker';
  final i = trimmed.indexOf(marker);
  if (i >= 0) {
    final head = trimmed.substring(0, i).trim();
    return head.isNotEmpty ? head : '(attachments)';
  }
  if (trimmed.startsWith(agentAttachmentContextMarker)) {
    return '(attachments)';
  }
  return text;
}
