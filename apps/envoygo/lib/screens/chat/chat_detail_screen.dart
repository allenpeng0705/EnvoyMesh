import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:record/record.dart';
import '../../models/chat_message.dart';
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

  const ChatDetailScreen({
    super.key,
    required this.threadId,
    required this.displayName,
    this.contactOwnerId,
    this.chatRoomId,
    this.agentType,
  });

  @override
  ConsumerState<ChatDetailScreen> createState() =>
      _ChatDetailScreenState();
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

  bool get _isRoom => widget.chatRoomId != null;
  bool get _isAgent => widget.agentType != null;
  bool get _isExtAgent => widget.agentType == 'external';

  /// Prefer explicit contactOwnerId; fall back to thread id suffix.
  String? get _resolvedContactOwnerId {
    if (widget.contactOwnerId != null && widget.contactOwnerId!.isNotEmpty) {
      return widget.contactOwnerId;
    }
    if (_isAgent || _isRoom) return null;
    final nodeId = ref.read(nodeProvider).activeNode?.id;
    return threadPeerSuffix(widget.threadId, nodeId);
  }

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
          notifier.loadHistory(
            widget.threadId,
            chatRoomId: widget.chatRoomId,
          );
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
      }
    });
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
      final mimeType = 'audio/mp4'; // record package outputs MP4/AAC on both platforms

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
        final attachmentId = uploadResult['attachmentId'] as String? ??
            (uploadResult['id'] as String?) ??
            'att_${DateTime.now().microsecondsSinceEpoch}';
        final vaultRelativePath = uploadResult['vaultRelativePath'] as String? ?? '';

        // 2. Send chat message with attachment metadata
        ref.read(chatProvider.notifier).sendMessage(
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
            const SnackBar(content: Text('Failed to send voice note')),
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
            const SnackBar(content: Text('Microphone permission denied')),
          );
        }
        return;
      }
      try {
        await _audioRecorder.start(
          const RecordConfig(encoder: AudioEncoder.aacLc),
          path: '${Directory.systemTemp.path}/voice_${DateTime.now().microsecondsSinceEpoch}.m4a',
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
            const SnackBar(content: Text('Failed to start recording')),
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
          if (!_isAgent && !_isRoom && _resolvedContactOwnerId != null)
            IconButton(
              icon: const Icon(Icons.call),
              tooltip: 'Voice call',
              onPressed: _startCall,
            ),
          if (!_isAgent && !_isRoom && _resolvedContactOwnerId != null)
            IconButton(
              icon: const Icon(Icons.language),
              tooltip: 'Published content',
              onPressed: () => showPublishedContentSheet(
                context,
                ownerId: _resolvedContactOwnerId!,
                displayName: widget.displayName,
              ),
            ),
          IconButton(
            icon: const Icon(Icons.delete_outline),
            tooltip: 'Clear thread',
            onPressed: _clearThread,
          ),
          if (_isRoom)
            IconButton(
              icon: const Icon(Icons.person_add),
              tooltip: 'Invite',
              onPressed: () => _showInviteDialog(context),
            ),
        ],
      ),
      body: Column(
        children: [
          if (_isExtAgent) const ExtAgentOfflineBanner(),
          Expanded(
            child: messages.isEmpty
                ? const Center(
                    child: Text(
                      'No messages yet',
                      style: TextStyle(color: Colors.grey),
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
                            builder: (ctx) => AlertDialog(
                              title: const Text('Delete message?'),
                              actions: [
                                TextButton(
                                  onPressed: () =>
                                      Navigator.of(ctx).pop(),
                                  child: const Text('Cancel'),
                                ),
                                FilledButton(
                                  onPressed: () {
                                    _deleteMessage(msg);
                                    Navigator.of(ctx).pop();
                                  },
                                  child: const Text('Delete'),
                                ),
                              ],
                            ),
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
              padding: const EdgeInsets.symmetric(
                  horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.image),
                    onPressed: _pickAndSendImage,
                  ),
                  if (!_isAgent && !_isRoom)
                    IconButton(
                      icon: Icon(
                        _isRecording ? Icons.stop : Icons.mic,
                        color: _isRecording ? Colors.red : null,
                      ),
                      onPressed: _toggleRecording,
                      tooltip: _isRecording ? 'Stop recording' : 'Record voice note',
                    ),
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      decoration: const InputDecoration(
                        hintText: 'Type a message...',
                        border: OutlineInputBorder(
                          borderRadius:
                              BorderRadius.all(Radius.circular(24)),
                        ),
                        contentPadding:
                            EdgeInsets.symmetric(horizontal: 16),
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
        const SnackBar(content: Text('Failed to start call')),
      );
      return;
    }
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const VoiceCallScreen()),
    );
  }

  void _sendMessage() {
    _sendText(_textController.text.trim());
  }

  void _sendText(String text) {
    if (text.isEmpty) return;

    if (_isAgent) {
      ref.read(chatProvider.notifier).sendAgentMessage(text, agentType: widget.agentType ?? 'envoyai');
    } else if (_isRoom) {
      ref.read(chatProvider.notifier).sendRoomMessage(
            widget.chatRoomId!,
            text,
          );
    } else if (_resolvedContactOwnerId != null) {
      ref.read(chatProvider.notifier).sendMessage(
            _resolvedContactOwnerId!,
            text,
          );
    }
    _textController.clear();
  }

  void _clearThread() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Clear thread?'),
        content: const Text('All messages in this thread will be deleted.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              ref
                  .read(chatProvider.notifier)
                  .clearMessages(widget.threadId);
              Navigator.of(ctx).pop();
            },
            child: const Text('Clear'),
          ),
        ],
      ),
    );
  }

  void _deleteMessage(ChatMessage msg) {
    ref
        .read(chatProvider.notifier)
        .deleteMessage(widget.threadId, msg);
  }

  void _showInviteDialog(BuildContext context) {
    final contacts = ref.read(contactProvider).bonds;
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Invite to Group'),
        content: SizedBox(
          width: 300,
          child: contacts.isEmpty
              ? const Text('No contacts to invite.')
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: contacts.length,
                  itemBuilder: (_, i) {
                    final c = contacts[i];
                    return ListTile(
                      leading: CircleAvatar(
                        child: Text(
                          (c.displayName ?? '?')[0].toUpperCase(),
                        ),
                      ),
                      title: Text(c.displayName ?? c.ownerId),
                      onTap: () {
                        ref.read(chatProvider.notifier).inviteToRoom(
                              widget.chatRoomId!,
                              c.ownerId,
                            );
                        Navigator.of(ctx).pop();
                        ScaffoldMessenger.of(context).showSnackBar(
                          SnackBar(
                            content: Text(
                                '${c.displayName ?? c.ownerId} invited'),
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
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }
}
