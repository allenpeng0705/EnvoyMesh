import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:record/record.dart';
import '../../l10n/app_localizations.dart';
import '../../models/chat_message.dart';
import '../../models/chat_thread.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../../services/vault_content_fetch.dart';
import '../../services/node_service_client.dart';
import '../../widgets/chat_bubble.dart';
import '../../widgets/chat_audio_player.dart';
import '../../widgets/ext_agent_offline_banner.dart';
import '../../widgets/ext_agent_switcher.dart';
import '../call/voice_call_screen.dart';
import '../content/published_content_sheet.dart';

/// Chat detail view — message list with compose bar.
///
/// Supports both direct messages (via contactOwnerId) and group
/// chat rooms (via chatRoomId).
class ChatDetailScreen extends ConsumerStatefulWidget {
  final String threadId;
  final String displayName;
  final String? contactOwnerId;
  final String? chatRoomId;
  final String? agentType;

  /// Phase 51D — when true, compose uses sendFamilyRoomMessage.
  final bool isFamilyRoom;

  const ChatDetailScreen({
    super.key,
    required this.threadId,
    required this.displayName,
    this.contactOwnerId,
    this.chatRoomId,
    this.agentType,
    this.isFamilyRoom = false,
  });

  @override
  ConsumerState<ChatDetailScreen> createState() => _ChatDetailScreenState();
}

class _ChatDetailScreenState extends ConsumerState<ChatDetailScreen> {
  final _textController = TextEditingController();
  bool _initialized = false;

  // Phase 37 — audio recording state
  final _audioRecorder = AudioRecorder();
  bool _isRecording = false;
  bool _recordingGuard = false; // I1: prevents re-entry during async stop
  Timer? _recordTimer;
  int _recordingSeconds = 0;
  static const _maxRecordSeconds = 120;

  bool get _isRoom =>
      widget.chatRoomId != null && widget.chatRoomId!.isNotEmpty;
  bool get _isAgent => widget.agentType != null;
  bool get _isExtAgent => widget.agentType == 'external';
  bool get _isAiBot =>
      widget.agentType != null && widget.agentType!.startsWith('bot:');
  bool get _isFamily => widget.threadId.contains(':family:');
  bool get _isFamilyRoom {
    if (widget.isFamilyRoom) return true;
    final thread = ref
        .read(chatProvider)
        .threads
        .where((t) => t.id == widget.threadId)
        .firstOrNull;
    return thread?.type == ChatThreadType.familyGroup;
  }

  /// Prefer explicit contactOwnerId; fall back to thread id suffix.
  String? get _resolvedContactOwnerId {
    if (widget.contactOwnerId != null && widget.contactOwnerId!.isNotEmpty) {
      return widget.contactOwnerId;
    }
    if (_isAgent || _isRoom || _isFamily) return null;
    final nodeId = ref.read(nodeProvider).activeNode?.id;
    return threadPeerSuffix(widget.threadId, nodeId);
  }

  bool _modelDisabled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_initialized) {
        _initialized = true;
        final notifier = ref.read(chatProvider.notifier);
        // Load from local DB first (instant), then from home node.
        notifier.loadMessagesFromDb(widget.threadId);
        if (_isAgent) {
          notifier.loadAgentHistory(widget.threadId);
        } else if (_isRoom) {
          notifier.loadHistory(widget.threadId, chatRoomId: widget.chatRoomId);
        } else if (_isFamily) {
          notifier.loadHistory(widget.threadId);
        } else {
          notifier.loadHistory(
            widget.threadId,
            contactOwnerId: _resolvedContactOwnerId,
          );
        }
        notifier.markRead(
          widget.threadId,
          contactOwnerId: _resolvedContactOwnerId,
        );
        if (_isAiBot) {
          unawaited(_refreshModelDisabled());
        }
      }
    });
  }

  Future<void> _refreshModelDisabled() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final cfg = await client.getNodeConfig();
      final mp = cfg['modelProviders'];
      final mode = mp is Map ? mp['mode']?.toString() : null;
      if (!mounted) return;
      setState(() => _modelDisabled = mode == 'disabled');
    } catch (_) {
      // Ignore — send path still checks before dispatch.
    }
  }

  void _cancelRecordTimer() {
    _recordTimer?.cancel();
    _recordTimer = null;
  }

  @override
  void dispose() {
    _textController.dispose();
    _cancelRecordTimer();
    _audioRecorder.dispose();
    super.dispose();
  }

  Future<void> _toggleRecording() async {
    if (_recordingGuard) return; // I1: prevent re-entry
    if (_isRecording) {
      // Stop recording — set guard immediately
      _recordingGuard = false;
      _cancelRecordTimer();
      final recordedSec = _recordingSeconds;
      _recordingSeconds = 0;
      final path = await _audioRecorder.stop();
      if (path == null || !mounted) {
        setState(() => _isRecording = false);
        return;
      }
      setState(() => _isRecording = false);

      final file = File(path);
      final bytes = await file.readAsBytes();
      final base64 = base64Encode(bytes);
      final mimeType =
          'audio/mp4'; // record package outputs MP4/AAC on both platforms

      final nodeService = ref.read(nodeServiceProvider);
      if (nodeService == null || _resolvedContactOwnerId == null) return;

      try {
        // 1. Upload to vault
        final uploadResult = await nodeService.sendChatAttachment(
          targetOwnerId: _resolvedContactOwnerId!,
          filename: 'voice-note.m4a',
          contentBase64: base64,
          mimeType: mimeType,
        );
        final attachmentId =
            uploadResult['attachmentId'] as String? ??
            (uploadResult['id'] as String?) ??
            'att_${DateTime.now().microsecondsSinceEpoch}';
        final vaultRelativePath =
            uploadResult['vaultRelativePath'] as String? ?? '';

        // 2. Send chat message with attachment metadata
        ref
            .read(chatProvider.notifier)
            .sendMessage(
              _resolvedContactOwnerId!,
              '', // mobile has no transcription
              attachments: [
                {
                  'id': attachmentId,
                  'filename': 'voice-note.m4a',
                  'mimeType': mimeType,
                  'sizeBytes': bytes.length,
                  'sensitivity': 'friends',
                  'vaultRelativePath': vaultRelativePath,
                  if (recordedSec > 0) 'durationSec': recordedSec,
                },
              ],
            );
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(AppLocalizations.of(context).chatVoiceSendFailed),
            ),
          );
        }
      }
    } else {
      // Start recording — set guard immediately
      _recordingGuard = true;

      if (!await _audioRecorder.hasPermission()) {
        _recordingGuard = false;
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(AppLocalizations.of(context).chatMicDenied),
            ),
          );
        }
        return;
      }
      try {
        await _audioRecorder.start(
          const RecordConfig(encoder: AudioEncoder.aacLc),
          path:
              '${Directory.systemTemp.path}/voice_${DateTime.now().microsecondsSinceEpoch}.m4a',
        );
        _recordingSeconds = 0;
        _recordTimer = Timer.periodic(const Duration(seconds: 1), (_) {
          if (!mounted) {
            _cancelRecordTimer();
            return;
          }
          _recordingSeconds++;
          if (_recordingSeconds >= _maxRecordSeconds) {
            // Auto-stop at max duration — delegate to toggle which handles full send
            _recordingGuard = false; // unblock toggle's re-entry check
            _cancelRecordTimer();
            _toggleRecording(); // fire-and-forget: enters stop branch, uploads & sends
          }
        });
        setState(() => _isRecording = true);
      } catch (e) {
        _cancelRecordTimer();
        _recordingGuard = false;
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(AppLocalizations.of(context).chatRecordFailed),
            ),
          );
        }
      }
    }
  }

  Future<String?> _loadAudioForAttachment(String vaultRelativePath) async {
    final nodeService = ref.read(nodeServiceProvider);
    final homePeerId = ref.read(nodeProvider).activeNode?.homePeerId.trim();
    if (nodeService == null || homePeerId == null || homePeerId.isEmpty) {
      return null;
    }
    try {
      final fetched = await getOrFetchVaultContent(
        ({required relativePath, int? maxBytes, int? offset}) =>
            nodeService.readLibraryItemContent(
              relativePath: relativePath,
              maxBytes: maxBytes,
              offset: offset,
            ),
        homePeerId: homePeerId,
        relativePath: vaultRelativePath,
      );
      if (fetched.bytes.isEmpty) return null;
      return base64Encode(fetched.bytes);
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final chatState = ref.watch(chatProvider);
    final messages = chatState.messages[widget.threadId] ?? [];

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.displayName),
        actions: [
          if (_isExtAgent) const ExtAgentSwitcher(iconOnly: true),
          // Phase 42F — voice call action for direct-message chats
          // (not rooms / agents). Routes through CallProvider.startCall
          // which generates the SDP and posts sendCallInvite.
          if (!_isAgent &&
              !_isRoom &&
              !_isFamily &&
              _resolvedContactOwnerId != null)
            IconButton(
              icon: const Icon(Icons.call),
              tooltip: l10n.chatVoiceCall,
              onPressed: _startCall,
            ),
          if (!_isAgent &&
              !_isRoom &&
              !_isFamily &&
              _resolvedContactOwnerId != null)
            IconButton(
              icon: const Icon(Icons.language),
              tooltip: l10n.chatPublishedContent,
              onPressed: () => showPublishedContentSheet(
                context,
                ownerId: _resolvedContactOwnerId!,
                displayName: widget.displayName,
              ),
            ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: l10n.chatClearThread,
            onPressed: _clearThread,
          ),
          if (_isRoom && !_isFamilyRoom)
            IconButton(
              icon: const Icon(Icons.person_add),
              tooltip: l10n.commonInvite,
              onPressed: () => _showInviteDialog(context),
            ),
        ],
      ),
      body: Column(
        children: [
          if (_isExtAgent) const ExtAgentOfflineBanner(),
          if (_isAiBot && _modelDisabled)
            Container(
              width: double.infinity,
              color: Theme.of(context).colorScheme.errorContainer,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Text(
                ref.read(nodeProvider).isOwnerProfile
                    ? l10n.chatAiDisabled
                    : l10n.chatAiDisabledAskOwner,
                style: TextStyle(
                  color: Theme.of(context).colorScheme.onErrorContainer,
                  fontSize: 13,
                ),
              ),
            ),
          Expanded(
            child: messages.isEmpty
                ? Center(
                    child: Text(
                      l10n.chatNoMessages,
                      style: const TextStyle(color: Colors.grey),
                    ),
                  )
                : ListView.builder(
                    reverse: true,
                    padding: const EdgeInsets.all(12),
                    itemCount: messages.length,
                    itemBuilder: (context, index) {
                      final msg = messages[index];
                      return GestureDetector(
                        onLongPress: () {
                          showDialog(
                            context: context,
                            builder: (ctx) {
                              final dialogL10n = AppLocalizations.of(ctx);
                              return AlertDialog(
                                title: Text(dialogL10n.chatDeleteMessageTitle),
                                actions: [
                                  TextButton(
                                    onPressed: () => Navigator.of(ctx).pop(),
                                    child: Text(dialogL10n.commonCancel),
                                  ),
                                  FilledButton(
                                    onPressed: () {
                                      _deleteMessage(msg);
                                      Navigator.of(ctx).pop();
                                    },
                                    child: Text(dialogL10n.commonDelete),
                                  ),
                                ],
                              );
                            },
                          );
                        },
                        child: ChatBubble(
                          message: msg,
                          isOutbound: msg.isOutbound,
                          onLoadAudio: _loadAudioForAttachment,
                        ),
                      );
                    },
                  ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.image),
                    onPressed: _pickAndSendImage,
                  ),
                  if (!_isAgent && !_isRoom && !_isFamily)
                    IconButton(
                      icon: Icon(
                        _isRecording ? Icons.stop : Icons.mic,
                        color: _isRecording ? Colors.red : null,
                      ),
                      onPressed: _toggleRecording,
                      tooltip: _isRecording
                          ? l10n.chatStopRecording
                          : l10n.chatRecordVoice,
                    ),
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      decoration: InputDecoration(
                        hintText: l10n.chatTypeMessage,
                        border: const OutlineInputBorder(
                          borderRadius: BorderRadius.all(Radius.circular(24)),
                        ),
                        contentPadding:
                            const EdgeInsets.symmetric(horizontal: 16),
                      ),
                      onSubmitted: (_) => _sendMessage(),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.send),
                    onPressed: _sendMessage,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickAndSendImage() async {
    final picker = ImagePicker();
    final picked = await picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 1024,
      maxHeight: 1024,
      imageQuality: 80,
    );
    if (picked == null) return;
    final bytes = await File(picked.path).readAsBytes();
    final base64 = base64Encode(bytes);
    // Send as a data URI so ChatBubble can detect and render it.
    final text = 'data:image/jpeg;base64,$base64';
    _sendText(text);
  }

  /// Phase 42F — start an outbound voice call from this chat thread.
  /// Delegates to [CallProvider.startCall] which builds the WebRTC
  /// transport, generates the SDP offer, and posts sendCallInvite
  /// to the home. On success we push the [VoiceCallScreen] so the
  /// user sees the active-call UI right away.
  Future<void> _startCall() async {
    final contactOwnerId = _resolvedContactOwnerId;
    if (contactOwnerId == null) return;
    final callProviderRef = ref.read(callProvider);
    final callId = await callProviderRef.startCall(contactOwnerId);
    if (!mounted) return;
    if (callId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).chatCallFailed)),
      );
      return;
    }
    Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const VoiceCallScreen()));
  }

  void _sendMessage() {
    _sendText(_textController.text.trim());
  }

  void _sendText(String text) async {
    if (text.isEmpty) return;
    if (_isAiBot && _modelDisabled) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(AppLocalizations.of(context).chatAiDisabled),
        ),
      );
      return;
    }

    try {
      if (_isAgent) {
        await ref
            .read(chatProvider.notifier)
            .sendAgentMessage(text, agentType: widget.agentType ?? 'envoyai');
      } else if (_isFamilyRoom && widget.chatRoomId != null) {
        await ref
            .read(chatProvider.notifier)
            .sendFamilyRoomMessage(widget.chatRoomId!, text);
      } else if (_isRoom) {
        await ref
            .read(chatProvider.notifier)
            .sendRoomMessage(widget.chatRoomId!, text);
      } else if (_isFamily && widget.contactOwnerId != null) {
        await ref
            .read(chatProvider.notifier)
            .sendFamilyMessage(widget.contactOwnerId!, text);
      } else if (_resolvedContactOwnerId != null) {
        await ref
            .read(chatProvider.notifier)
            .sendMessage(_resolvedContactOwnerId!, text);
      } else {
        return;
      }
      _textController.clear();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            e
                .toString()
                .replaceFirst('Bad state: ', '')
                .replaceFirst('Exception: ', ''),
          ),
        ),
      );
    }
  }

  void _clearThread() {
    final l10n = AppLocalizations.of(context);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.chatClearThreadTitle),
        content: Text(l10n.chatClearThreadBody),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.commonCancel),
          ),
          FilledButton(
            onPressed: () {
              ref.read(chatProvider.notifier).clearMessages(widget.threadId);
              Navigator.of(ctx).pop();
            },
            child: Text(l10n.commonClear),
          ),
        ],
      ),
    );
  }

  void _deleteMessage(ChatMessage msg) {
    ref.read(chatProvider.notifier).deleteMessage(widget.threadId, msg);
  }

  void _showInviteDialog(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final contacts = ref.read(contactProvider).bonds;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(l10n.chatInviteToGroup),
        content: SizedBox(
          width: 300,
          child: contacts.isEmpty
              ? Text(l10n.chatNoContactsInvite)
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: contacts.length,
                  itemBuilder: (_, i) {
                    final c = contacts[i];
                    return ListTile(
                      leading: CircleAvatar(
                        child: Text((c.displayName ?? '?')[0].toUpperCase()),
                      ),
                      title: Text(c.displayName ?? c.ownerId),
                      onTap: () {
                        ref
                            .read(chatProvider.notifier)
                            .inviteToRoom(widget.chatRoomId!, c.ownerId);
                        Navigator.of(ctx).pop();
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                              l10n.chatInvitedSnack(
                                c.displayName ?? c.ownerId,
                              ),
                            ),
                          ),
                        );
                      },
                    );
                  },
                ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(l10n.commonClose),
          ),
        ],
      ),
    );
  }
}
