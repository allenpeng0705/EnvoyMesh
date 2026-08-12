import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:record/record.dart';
import '../../ext_agent/envoy_ai_slash_commands.dart';
import '../../ext_agent/ext_agent_presets.dart';
import '../../ext_agent/ext_agent_slash_commands.dart';
import '../../l10n/app_localizations.dart';
import '../../models/chat_message.dart';
import '../../models/chat_thread.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart';
import '../../providers/node_provider.dart';
import '../../services/vault_content_fetch.dart';
import '../../widgets/chat_bubble.dart';
import '../../widgets/ext_agent_offline_banner.dart';
import '../../widgets/ext_agent_switcher.dart';
import '../../widgets/home_folder_browser.dart';
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
  Map<String, dynamic>? _extAgentCatalog;
  Map<String, dynamic>? _envoyAiCatalog;
  String _extAgentActiveId = 'pi';
  String? _extAgentProjectPath;
  int _slashHighlight = 0;
  void Function()? _extAgentBridgeUnsub;

  // Phase 37 — audio recording state
  final _audioRecorder = AudioRecorder();
  bool _isRecording = false;
  bool _recordingGuard = false; // only during start/stop async work
  bool _isSendingVoice = false;
  bool _mmxBusy = false;
  Timer? _recordTimer;
  int _recordingSeconds = 0;
  String? _activeRecordingPath;
  static const _maxRecordSeconds = 120;

  bool get _isRoom =>
      widget.chatRoomId != null && widget.chatRoomId!.isNotEmpty;
  bool get _isAgent => widget.agentType != null;
  bool get _isExtAgent => widget.agentType == 'external';
  bool get _isEnvoyAi => widget.agentType == 'envoyai';
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
    _textController.addListener(_onComposerChanged);
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
        if (_isExtAgent) {
          unawaited(_reloadExtAgentCatalog());
          final client = ref.read(nodeServiceProvider);
          _extAgentBridgeUnsub?.call();
          _extAgentBridgeUnsub = client?.on('bridge:status', (_) {
            if (mounted) unawaited(_reloadExtAgentCatalog());
          });
        }
        if (_isEnvoyAi) {
          unawaited(_reloadEnvoyAiCatalog());
        }
      }
    });
  }

  void _onComposerChanged() {
    if (!mounted || (!_isExtAgent && !_isEnvoyAi)) return;
    setState(() => _slashHighlight = 0);
  }

  Future<void> _reloadExtAgentCatalog() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || !mounted) return;
    try {
      final bridge = await client.getBridgeStatus();
      final active =
          (bridge['activeExtAgentId'] as String?)?.trim().isNotEmpty == true
              ? (bridge['activeExtAgentId'] as String).trim()
              : 'pi';
      final catalog = await client.getExtAgentCommandCatalog(agentId: active);
      String? projectPath;
      if (extAgentUsesProjectPath(active)) {
        try {
          final pathResult =
              await client.getExtAgentProjectPath(agentId: active);
          projectPath = pathResult['projectPath']?.toString();
        } catch (_) {
          projectPath = null;
        }
      }
      if (!mounted) return;
      setState(() {
        _extAgentActiveId = active;
        _extAgentCatalog = catalog;
        _extAgentProjectPath = projectPath;
      });
    } catch (_) {
      // keep last-known
    }
  }

  Future<void> _pickExtAgentProjectFolder() async {
    if (!ref.read(nodeProvider).isOwnerProfile) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    final picked = await HomeFolderBrowser.open(
      context,
      client: client,
      initialPath: _extAgentProjectPath,
    );
    if (picked == null || !mounted) return;
    try {
      final result = await client.setExtAgentProjectPath(
        agentId: _extAgentActiveId,
        projectPath: picked,
      );
      if (!mounted) return;
      setState(() {
        _extAgentProjectPath = result['projectPath']?.toString();
      });
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  Future<void> _clearExtAgentProjectFolder() async {
    if (!ref.read(nodeProvider).isOwnerProfile) return;
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      await client.setExtAgentProjectPath(
        agentId: _extAgentActiveId,
        projectPath: null,
      );
      if (!mounted) return;
      setState(() => _extAgentProjectPath = null);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(e.toString())),
      );
    }
  }

  Future<void> _reloadEnvoyAiCatalog() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null || !mounted) return;
    try {
      final catalog = await client.getEnvoyAiCommandCatalog();
      if (!mounted) return;
      setState(() => _envoyAiCatalog = catalog);
    } catch (_) {
      // keep last-known
    }
  }

  Widget _buildAgentSlashSuggest({
    required Map<String, dynamic>? catalog,
    required List<Map<String, dynamic>> Function(
      List<Map<String, dynamic>>,
      String,
    ) filterCommands,
  }) {
    if (catalog == null) return const SizedBox.shrink();
    final value = _textController.text;
    final commands = ((catalog['commands'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final models = ((catalog['models'] as List?) ?? const [])
        .whereType<Map>()
        .map((e) => Map<String, dynamic>.from(e))
        .toList();
    final slashHits = filterCommands(commands, value);
    final modelHits = _isExtAgent ? filterExtAgentModels(models, value) : const <Map<String, dynamic>>[];
    final items = <({String key, String primary, String secondary})>[];
    if (slashHits.isNotEmpty) {
      for (final c in slashHits) {
        final slash = c['slash']?.toString() ?? '';
        final args = (c['argsHint'] as String?)?.trim();
        items.add((
          key: slash,
          primary: args == null || args.isEmpty ? slash : '$slash $args',
          secondary: c['summary']?.toString() ?? '',
        ));
      }
    } else if (modelHits.isNotEmpty) {
      for (final m in modelHits) {
        final id = m['id']?.toString() ?? '';
        items.add((
          key: 'model:$id',
          primary: '/model $id',
          secondary: m['label']?.toString() ?? 'model',
        ));
      }
    }
    if (items.isEmpty) return const SizedBox.shrink();
    final highlight = _slashHighlight.clamp(0, items.length - 1);
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      constraints: const BoxConstraints(maxHeight: 180),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: ListView.builder(
        shrinkWrap: true,
        itemCount: items.length,
        itemBuilder: (context, index) {
          final item = items[index];
          return ListTile(
            dense: true,
            selected: index == highlight,
            title: Text(item.primary, style: const TextStyle(fontFamily: 'monospace')),
            subtitle: Text(item.secondary, maxLines: 1, overflow: TextOverflow.ellipsis),
            onTap: () {
              if (item.key.startsWith('model:')) {
                final id = item.key.substring('model:'.length);
                _textController.text = '/model $id';
              } else {
                _textController.text = '${item.key} ';
              }
              _textController.selection = TextSelection.collapsed(
                offset: _textController.text.length,
              );
              setState(() => _slashHighlight = index);
            },
          );
        },
      ),
    );
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
    _extAgentBridgeUnsub?.call();
    _extAgentBridgeUnsub = null;
    _textController.removeListener(_onComposerChanged);
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
          '${Directory.systemTemp.path}/voice_${DateTime.now().microsecondsSinceEpoch}.wav';
      // WAV (pcm16) plays in Safari/Chrome/Firefox and on Windows peers.
      // AAC/m4a from iOS often shows 0:00 / gray controls in Mac Social.
      await _audioRecorder.start(
        const RecordConfig(
          encoder: AudioEncoder.wav,
          sampleRate: 16000,
          numChannels: 1,
        ),
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
      const mimeType = 'audio/wav';
      final durationSec =
          _recordingSeconds > 0 ? _recordingSeconds : 1;

      final nodeService = ref.read(nodeServiceProvider);
      if (nodeService == null || _resolvedContactOwnerId == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(l10n.chatVoiceSendFailed)),
          );
        }
        return;
      }

      final targetOwnerId = _resolvedContactOwnerId!;
      final chatNotifier = ref.read(chatProvider.notifier);
      // Show a bubble immediately (duration known); vault path fills in
      // when the RPC returns / WS echo arrives.
      final pendingId = chatNotifier.insertPendingVoiceNote(
        targetOwnerId: targetOwnerId,
        durationSec: durationSec,
        sizeBytes: bytes.length,
      );

      try {
        final result = await nodeService.sendChatAttachment(
          targetOwnerId: targetOwnerId,
          filename: 'voice-note.wav',
          contentBase64: base64,
          mimeType: mimeType,
          chatText: '',
        );
        final vaultPath = result['vaultRelativePath'] as String?;
        final messageId = (result['messageId'] as String?)?.trim();
        final attachmentId =
            (result['attachmentId'] as String?) ?? pendingId;
        if (vaultPath != null && vaultPath.isNotEmpty) {
          // Prefer server messageId; if the home omitted it (older router),
          // still keep a playable row keyed by attachment id.
          chatNotifier.upsertOutboundVoiceNote(
            targetOwnerId: targetOwnerId,
            messageId: (messageId != null && messageId.isNotEmpty)
                ? messageId
                : 'voice-$attachmentId',
            vaultRelativePath: vaultPath,
            attachmentId: attachmentId,
            sizeBytes: bytes.length,
            mimeType: mimeType,
            durationSec: durationSec,
          );
          if (pendingId.isNotEmpty) {
            chatNotifier.removePendingVoiceNote(targetOwnerId, pendingId);
          }
        }
        // If we got neither vault path nor messageId, leave the pending
        // bubble so the user can see something went wrong / retry later.
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
        if (pendingId.isNotEmpty) {
          chatNotifier.removePendingVoiceNote(targetOwnerId, pendingId);
        }
        rethrow;
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
    final isOwner = ref.watch(nodeProvider).isOwnerProfile;
    final showProjectFolder = _isExtAgent && isOwner;
    final projectFolderSupported = extAgentUsesProjectPath(_extAgentActiveId);

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
          if (showProjectFolder)
            Material(
              color: Theme.of(context).colorScheme.surfaceContainerHighest,
              child: ListTile(
                dense: true,
                leading: const Icon(Icons.folder_outlined, size: 20),
                title: Text(
                  projectFolderSupported
                      ? (_extAgentProjectPath?.isNotEmpty == true
                          ? _extAgentProjectPath!
                          : 'Project folder not set')
                      : 'Used by Codex, Claude Code, Cursor, Aider, MiniMax — switch agent to set a folder',
                  maxLines: projectFolderSupported ? 1 : 2,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        fontFamily:
                            projectFolderSupported ? 'monospace' : null,
                      ),
                ),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (projectFolderSupported &&
                        _extAgentProjectPath?.isNotEmpty == true)
                      IconButton(
                        tooltip: 'Clear',
                        icon: const Icon(Icons.clear, size: 18),
                        onPressed: _clearExtAgentProjectFolder,
                      ),
                    IconButton(
                      tooltip: projectFolderSupported
                          ? 'Browse'
                          : 'Switch to Codex / Claude Code / Cursor / Aider / MiniMax',
                      icon: Icon(
                        projectFolderSupported
                            ? Icons.folder_open
                            : Icons.folder_off_outlined,
                        size: 18,
                      ),
                      onPressed: projectFolderSupported
                          ? _pickExtAgentProjectFolder
                          : null,
                    ),
                  ],
                ),
              ),
            ),
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
                          key: ValueKey(msg.id),
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
                  : Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_isExtAgent)
                          _buildAgentSlashSuggest(
                            catalog: _extAgentCatalog,
                            filterCommands: filterExtAgentSlashCommands,
                          ),
                        if (_isEnvoyAi)
                          _buildAgentSlashSuggest(
                            catalog: _envoyAiCatalog,
                            filterCommands: filterEnvoyAiSlashCommands,
                          ),
                        Row(
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
                            enabled: !_mmxBusy,
                            decoration: InputDecoration(
                              hintText: _mmxBusy
                                  ? 'MiniMax running…'
                                  : l10n.chatTypeMessage,
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
                          onPressed: _mmxBusy ? null : _sendMessage,
                        ),
                      ],
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
    if (text.isEmpty || _mmxBusy) return;

    if (_isExtAgent || _isEnvoyAi) {
      final mmxParsed = parseMmxMediaCommand(text);
      if (mmxParsed != null) {
        if (!mmxParsed.ok) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(mmxParsed.error ?? 'Invalid MiniMax command')),
          );
          return;
        }
        _textController.clear();
        unawaited(_handleMmxMediaCommand(mmxParsed.params!));
        return;
      }
    }

    if (_isExtAgent) {
      if (isExtAgentHelpCommand(text)) {
        final catalog = _extAgentCatalog;
        final help = catalog != null
            ? formatExtAgentSlashHelp(catalog)
            : 'Slash commands unavailable — reconnect to your home node and try /help again.';
        _textController.clear();
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(help), duration: const Duration(seconds: 6)),
        );
        return;
      }
      final modelAction = parseExtAgentModelCommand(text);
      // Only Envoy-handle /model when session override is supported; otherwise
      // forward as plain chat text (matches catalog intercept: forward).
      if (modelAction != null && _extAgentCatalog?['supportsSessionModel'] == true) {
        _textController.clear();
        unawaited(_handleExtAgentModelCommand(modelAction));
        return;
      }
    }

    if (_isEnvoyAi) {
      final action = parseEnvoyAiSlashCommand(text);
      if (action != null) {
        if (action.type == 'help') {
          final catalog = _envoyAiCatalog;
          final help = catalog != null
              ? formatEnvoyAiSlashHelp(catalog)
              : 'Slash commands unavailable — reconnect and try /help again.';
          _textController.clear();
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(help), duration: const Duration(seconds: 6)),
          );
          return;
        }
        if (action.type == 'clear') {
          _textController.clear();
          _clearThread();
          return;
        }
        if (action.type == 'model') {
          _textController.clear();
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Change the EnvoyAI model in Settings → AI on your home node.',
              ),
            ),
          );
          return;
        }
        if (action.type == 'status') {
          _textController.clear();
          unawaited(_handleEnvoyAiStatus());
          return;
        }
        if (action.type == 'skills' || action.type == 'approvals') {
          _textController.clear();
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(
                action.type == 'skills'
                    ? 'Open Skill Manager from the desktop Social app (Settings / Assistant).'
                    : 'Review pending approvals in the desktop Social Inbox.',
              ),
            ),
          );
          return;
        }
        if (action.type == 'report') {
          _textController.clear();
          unawaited(_handleEnvoyAiReport());
          return;
        }
        if (action.type == 'expand' && action.prompt != null) {
          _textController.clear();
          unawaited(_sendText(action.prompt!, restoreComposerOnFailure: true));
          return;
        }
        // unknown_slash → fall through and send as chat
      }
    }

    // Clear synchronously before the async send so a double-tap cannot
    // re-read the same draft, and the composer never sticks after EnvoyAI
    // (void RPC used to throw on null→Map after the message was already sent).
    _textController.clear();
    unawaited(_sendText(text, restoreComposerOnFailure: true));
  }

  Future<void> _handleMmxMediaCommand(Map<String, String> params) async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Not connected to home node')),
      );
      return;
    }
    final kind = params['kind'] ?? 'media';
    if (!mounted) return;
    setState(() => _mmxBusy = true);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Running MiniMax /$kind…')),
    );
    final chat = ref.read(chatProvider.notifier);
    try {
      final result = await client.runMmxMediaCommand(
        kind: kind,
        prompt: params['prompt'],
        target: params['target'],
      );
      if (!mounted) return;
      final caption = formatMmxMediaResult(result);
      final mime = result['mimeType']?.toString() ?? '';
      final b64 = result['contentBase64']?.toString();
      final path = result['path']?.toString();
      if (b64 != null &&
          b64.isNotEmpty &&
          (mime.toLowerCase().startsWith('image/') ||
              mime.toLowerCase().startsWith('audio/'))) {
        chat.appendLocalInboundMessage(
          threadId: widget.threadId,
          text: 'data:$mime;base64,$b64',
        );
        chat.appendLocalInboundMessage(
          threadId: widget.threadId,
          text: path != null && path.isNotEmpty ? 'Saved: $path' : caption,
        );
      } else {
        chat.appendLocalInboundMessage(
          threadId: widget.threadId,
          text: caption,
        );
      }
      final ok = result['ok'] == true;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            ok
                ? (path != null && path.isNotEmpty
                    ? 'Saved: $path'
                    : 'MiniMax done')
                : (result['error']?.toString() ?? 'MiniMax failed'),
          ),
          duration: Duration(seconds: ok ? 4 : 6),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      chat.appendLocalInboundMessage(
        threadId: widget.threadId,
        text: 'MiniMax /$kind failed: $e. Install: npm install -g mmx-cli',
      );
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            'MiniMax media failed: $e. Install: npm install -g mmx-cli',
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _mmxBusy = false);
    }
  }

  Future<void> _handleEnvoyAiStatus() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      final status = await client.getOpenClawStatus();
      final running = status['running'] == true;
      final enabled = status['enabled'] == true;
      final url = status['url']?.toString() ?? '';
      final state = running
          ? 'running'
          : enabled
              ? 'enabled but not running'
              : 'disabled';
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('EnvoyAI / OpenClaw: $state${url.isEmpty ? '' : ' ($url)'}'),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not read OpenClaw status: $e')),
      );
    }
  }

  Future<void> _handleEnvoyAiReport() async {
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Generating mesh intelligence report…')),
    );
    try {
      // Prefer sending a NL prompt via EnvoyAI so the phone path stays on sendToOpenClaw.
      await _sendText(
        'Using EnvoyMesh mesh tools, generate a mesh intelligence report covering health, bonds, and notable issues.',
        restoreComposerOnFailure: true,
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Mesh report failed: $e')),
      );
    }
  }

  Future<void> _handleExtAgentModelCommand(ExtAgentModelSlashAction action) async {
    final catalog = _extAgentCatalog;
    if (catalog == null || catalog['supportsSessionModel'] != true) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Model commands unavailable — reconnect to your home node.')),
      );
      return;
    }
    final client = ref.read(nodeServiceProvider);
    if (client == null) return;
    try {
      if (action.type == 'show') {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(formatExtAgentModelShow(catalog))),
        );
        return;
      }
      if (action.type == 'list') {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(formatExtAgentModelList(catalog)),
            duration: const Duration(seconds: 6),
          ),
        );
        return;
      }
      if (action.type == 'default') {
        await client.setExtAgentSessionModel(agentId: _extAgentActiveId, model: null);
        await _reloadExtAgentCatalog();
        if (!mounted) return;
        final next = _extAgentCatalog;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              '${catalog['agentName'] ?? 'Ext Agent'}: model reset to default (${next?['defaultModel'] ?? 'default'})',
            ),
          ),
        );
        return;
      }
      await client.setExtAgentSessionModel(
        agentId: _extAgentActiveId,
        model: action.model,
      );
      await _reloadExtAgentCatalog();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            '${catalog['agentName'] ?? 'Ext Agent'}: model set to ${action.model}',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not change model: $e')),
      );
    }
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
