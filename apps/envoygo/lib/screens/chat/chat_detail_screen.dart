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
import '../../widgets/voice_note_recorder_bar.dart';
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
  bool _recordingGuard = false; // only during start/stop async work
  bool _isSendingVoice = false;
  Timer? _recordTimer;
  int _recordingSeconds = 0;
  String? _activeRecordingPath;
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
    final pending = _activeRecordingPath;
    _audioRecorder.dispose();
    if (pending != null) {
      try {
        final f = File(pending);
        if (f.existsSync()) f.deleteSync();
      } catch (_) {}
    }
    super.dispose();
  }

  bool get _hasPendingVoice =>
      _activeRecordingPath != null && !_isRecording && !_isSendingVoice;

  Future<void> _startRecording() async {
    if (_recordingGuard ||
        _isRecording ||
        _isSendingVoice ||
        _activeRecordingPath != null) {
      return;
    }
    _recordingGuard = true;
    if (!await _audioRecorder.hasPermission()) {
      _recordingGuard = false;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).chatMicDenied)),
        );
      }
      return;
    }
    try {
      final path =
          '${Directory.systemTemp.path}/voice_${DateTime.now().microsecondsSinceEpoch}.m4a';
      await _audioRecorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc),
        path: path,
      );
      _activeRecordingPath = path;
      _recordingSeconds = 0;
      _recordTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (!mounted) {
          _cancelRecordTimer();
          return;
        }
        setState(() => _recordingSeconds++);
        if (_recordingSeconds >= _maxRecordSeconds) {
          _cancelRecordTimer();
          unawaited(_sendRecording());
        }
      });
      if (mounted) setState(() => _isRecording = true);
    } catch (e) {
      _cancelRecordTimer();
      _activeRecordingPath = null;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).chatRecordFailed)),
        );
      }
    } finally {
      _recordingGuard = false;
    }
  }

  Future<void> _cancelRecording() async {
    if (_recordingGuard || _isSendingVoice) return;
    _recordingGuard = true;
    _cancelRecordTimer();
    try {
      var path = _activeRecordingPath;
      try {
        if (await _audioRecorder.isRecording()) {
          path = await _audioRecorder.stop() ?? path;
        }
      } catch (_) {}
      if (path != null) {
        final file = File(path);
        if (await file.exists()) {
          await file.delete();
        }
      }
    } catch (_) {
      // Best-effort discard.
    } finally {
      _activeRecordingPath = null;
      _recordingGuard = false;
      if (mounted) {
        setState(() {
          _isRecording = false;
          _recordingSeconds = 0;
          _isSendingVoice = false;
        });
      }
    }
  }

  Future<void> _sendRecording() async {
    if (_recordingGuard || (!_isRecording && _activeRecordingPath == null)) {
      return;
    }
    if (_isSendingVoice) return;
    _recordingGuard = true;
    _cancelRecordTimer();
    final l10n = AppLocalizations.of(context);
    var sent = false;
    try {
      // Keep any already-stopped draft path (retry after a failed send).
      var path = _activeRecordingPath;
      try {
        if (await _audioRecorder.isRecording()) {
          path = await _audioRecorder.stop() ?? path;
        }
      } catch (_) {
        path ??= _activeRecordingPath;
      }
      if (!mounted) return;
      if (path == null) {
        setState(() {
          _isRecording = false;
          _recordingSeconds = 0;
        });
        return;
      }
      _activeRecordingPath = path;
      setState(() {
        _isRecording = false;
        _isSendingVoice = true;
      });

      final file = File(path);
      if (!await file.exists()) {
        _activeRecordingPath = null;
        if (mounted) {
          setState(() => _recordingSeconds = 0);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l10n.chatVoiceSendFailed)),
          );
        }
        return;
      }
      final bytes = await file.readAsBytes();
      final base64 = base64Encode(bytes);
      const mimeType = 'audio/mp4';

      final nodeService = ref.read(nodeServiceProvider);
      if (nodeService == null || _resolvedContactOwnerId == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l10n.chatVoiceSendFailed)),
          );
        }
        return;
      }

      // One RPC only — sendChatAttachment uploads, sends chat.message with
      // attachment metadata (chatText: '' like Social), and shareFiles linked
      // by message id. Omitting chatText used a local-only file-share row and
      // broke home-node / peer playback linking.
      await nodeService.sendChatAttachment(
        targetOwnerId: _resolvedContactOwnerId!,
        filename: 'voice-note.m4a',
        contentBase64: base64,
        mimeType: mimeType,
        chatText: '',
      );
      sent = true;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.chatVoiceSent)),
        );
      }
      try {
        if (await file.exists()) await file.delete();
      } catch (_) {}
      _activeRecordingPath = null;
      if (mounted) {
        setState(() => _recordingSeconds = 0);
      }
    } catch (e) {
      // Keep _activeRecordingPath + duration so the bar stays in ready/retry.
      if (mounted) {
        setState(() => _isRecording = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).chatVoiceSendFailed)),
        );
      }
    } finally {
      _recordingGuard = false;
      if (mounted) {
        setState(() {
          _isSendingVoice = false;
          if (sent) {
            _activeRecordingPath = null;
            _recordingSeconds = 0;
          }
        });
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
              _resolvedContactOwnerId != null) ...[
            IconButton(
              icon: const Icon(Icons.call),
              tooltip: l10n.chatVoiceCall,
              onPressed: () => _startCall(callType: 'audio'),
            ),
            IconButton(
              icon: const Icon(Icons.videocam),
              tooltip: l10n.chatVideoCall,
              onPressed: () => _startCall(callType: 'video'),
            ),
            IconButton(
              icon: const Icon(Icons.language),
              tooltip: l10n.chatPublishedContent,
              onPressed: () => showPublishedContentSheet(
                context,
                ownerId: _resolvedContactOwnerId!,
                displayName: widget.displayName,
              ),
            ),
          ],
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
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
              child: (_isRecording ||
                          _isSendingVoice ||
                          _hasPendingVoice) &&
                      !_isAgent &&
                      !_isRoom &&
                      !_isFamily
                  ? VoiceNoteRecorderBar(
                      isCapturing: _isRecording,
                      isSending: _isSendingVoice,
                      recordingSeconds: _recordingSeconds,
                      maxSeconds: _maxRecordSeconds,
                      onCancel: () => unawaited(_cancelRecording()),
                      onSend: () => unawaited(_sendRecording()),
                    )
                  : Row(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        IconButton(
                          icon: const Icon(Icons.image_outlined),
                          tooltip: l10n.chatTypeMessage,
                          onPressed: _pickAndSendImage,
                        ),
                        if (!_isAgent && !_isRoom && !_isFamily)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 2, right: 4),
                            child: Tooltip(
                              message: l10n.chatRecordVoice,
                              child: Material(
                                color: Theme.of(context)
                                    .colorScheme
                                    .primaryContainer,
                                shape: const CircleBorder(),
                                child: InkWell(
                                  customBorder: const CircleBorder(),
                                  onTap: () => unawaited(_startRecording()),
                                  child: const SizedBox(
                                    width: 48,
                                    height: 48,
                                    child: Icon(Icons.mic, size: 26),
                                  ),
                                ),
                              ),
                            ),
                          ),
                        Expanded(
                          child: TextField(
                            controller: _textController,
                            minLines: 1,
                            maxLines: 4,
                            decoration: InputDecoration(
                              hintText: l10n.chatTypeMessage,
                              border: const OutlineInputBorder(
                                borderRadius:
                                    BorderRadius.all(Radius.circular(24)),
                              ),
                              contentPadding: const EdgeInsets.symmetric(
                                horizontal: 16,
                                vertical: 12,
                              ),
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
    // Do not touch the text composer — image path is independent of typed draft.
    final text = 'data:image/jpeg;base64,$base64';
    await _sendText(text, restoreComposerOnFailure: false);
  }

  /// Phase 42F — start an outbound voice or video call from this chat.
  Future<void> _startCall({String callType = 'audio'}) async {
    final contactOwnerId = _resolvedContactOwnerId;
    if (contactOwnerId == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).chatCallFailed)),
      );
      return;
    }
    try {
      final callProviderRef = ref.read(callProvider);
      final callId = await callProviderRef.startCall(
        contactOwnerId,
        callType: callType,
        peerDisplayName: widget.displayName,
      );
      if (!mounted) return;
      if (callId == null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(AppLocalizations.of(context).chatCallFailed)),
        );
        return;
      }
      Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const VoiceCallScreen()),
      );
    } catch (_) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(AppLocalizations.of(context).chatCallFailed)),
      );
    }
  }

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;
    // Clear synchronously before the async send so a double-tap cannot
    // re-read the same draft, and the composer never sticks after EnvoyAI
    // (void RPC used to throw on null→Map after the message was already sent).
    _textController.clear();
    unawaited(_sendText(text, restoreComposerOnFailure: true));
  }

  /// [restoreComposerOnFailure] — for typed sends only. Image sends pass
  /// false so a failed upload never dumps a data-URI into the composer.
  Future<void> _sendText(
    String text, {
    required bool restoreComposerOnFailure,
  }) async {
    if (text.isEmpty) return;
    if (_isAiBot && _modelDisabled) {
      if (restoreComposerOnFailure && mounted) {
        _textController.text = text;
      }
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
        if (restoreComposerOnFailure && mounted) {
          _textController.text = text;
        }
        return;
      }
    } catch (e) {
      if (!mounted) return;
      // Restore typed draft only when the composer is still empty (user did
      // not start typing a follow-up). Never restore image data-URIs.
      if (restoreComposerOnFailure && _textController.text.trim().isEmpty) {
        _textController.text = text;
        _textController.selection =
            TextSelection.collapsed(offset: text.length);
      }
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
