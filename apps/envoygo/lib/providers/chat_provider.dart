import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../ext_agent/agent_attachments.dart';
import '../models/chat_message.dart';
import '../models/chat_room.dart';
import '../models/chat_thread.dart';
import '../services/node_service_client.dart';
import '../storage/local_database.dart';
import '../utils/group_delivery.dart';
import '../utils/localized_labels.dart';
import 'contact_provider.dart';
import 'node_provider.dart';
import 'terminal_provider.dart';

/// Max Envoy Harness coding chats per home node (matches `@envoymesh/api`).
const kMaxEnvoyHarnessChats = 5;

/// State for the chat subsystem.
class ChatState {
  final List<ChatThread> threads;
  final Map<String, List<ChatMessage>> messages;
  final bool isLoading;
  final int selectedTab;
  final String? syncError;

  const ChatState({
    this.threads = const [],
    this.messages = const {},
    this.isLoading = false,
    this.selectedTab = 0,
    this.syncError,
  });

  ChatState copyWith({
    List<ChatThread>? threads,
    Map<String, List<ChatMessage>>? messages,
    bool? isLoading,
    int? selectedTab,
    String? syncError,
  }) {
    return ChatState(
      threads: threads ?? this.threads,
      messages: messages ?? this.messages,
      isLoading: isLoading ?? this.isLoading,
      selectedTab: selectedTab ?? this.selectedTab,
      syncError: syncError,
    );
  }
}

/// Provider for chat state (threads, messages, tab index).
final chatProvider =
    StateNotifierProvider<ChatNotifier, ChatState>((ref) {
  return ChatNotifier(ref);
});

/// Tracks seen message IDs per thread to prevent double-adds from
/// multiple push events (chat:message + agent:activity).
final _seenMessageIds = <String>{};

/// Filter that decides whether a candidate thread peer (a contact
/// owner id, or a "the other party" id from an inbound message)
/// is the user themselves. Mirrors the rule used by
/// `filterSelfBonds` in `contact_provider.dart`:
///   - the owner's own `envoy:owner:<…>` id, or
///   - a `envoy_device_<…>` device key (the multi-device shared
///     identity).
///
/// A chat thread for either of these would show the user as a
/// conversation partner with themselves, which is never what we
/// want. Pure function so every entry point (loadThreads,
/// onChatMessage, createContactThreads, _upsertThread) can share
/// the same rule.
bool isSelfThreadPeer(String? peerId, String? selfOwnerId) {
  if (peerId == null || peerId.isEmpty) return false;
  if (selfOwnerId != null && peerId == selfOwnerId) return true;
  if (peerId.startsWith('envoy_device_')) return true;
  return false;
}

/// Normalize message text for optimistic↔server echo matching.
@visibleForTesting
String chatTextKey(String? text) => (text ?? '').trim();

/// Merge an incoming server/push message into a newest-first thread list.
///
/// - Drops optimistic `temp_*` rows with the same trimmed text (the usual
///   EnvoyAI / DM echo path).
/// - When the home echo is an attachment-expanded prompt, keeps the local
///   display bubble (short text + chips) and adopts the server message id.
/// - When [collapseMatchingOutbound] is true (AI threads), also drops any
///   other outbound row with the same trimmed text — mirrors Social's
///   `withoutDuplicateUser` so family-member EnvoyAI does not show two
///   "You" bubbles for one send.
/// - Dedupes by message id.
@visibleForTesting
List<ChatMessage> reconcileChatMessages({
  required List<ChatMessage> existing,
  required ChatMessage incoming,
  required bool showAsMine,
  required bool collapseMatchingOutbound,
}) {
  final key = chatTextKey(incoming.text);
  var list = List<ChatMessage>.from(existing);

  // Attachment send: home persists the expanded outbound prompt, but the
  // optimistic bubble stores user text + chips. Promote the local bubble
  // to the server id and never show the fat context dump.
  if (showAsMine &&
      incoming.isOutbound &&
      looksLikeAgentAttachmentOutbound(incoming.text)) {
    ChatMessage? localMatch;
    for (final m in list) {
      if (!m.isOutbound) continue;
      final hasHomeAtts = messageHasAgentHomeAttachments(m);
      final isTemp = m.id.startsWith('temp_');
      if (!hasHomeAtts && !isTemp) continue;
      if (!agentAttachmentEchoMatchesDisplay(
        displayText: m.text,
        outboundEcho: incoming.text,
      )) {
        continue;
      }
      localMatch = m;
      break;
    }
    if (localMatch != null) {
      final kept = localMatch;
      list = list
          .where((m) => m.id != kept.id && m.id != incoming.id)
          .toList();
      final promoted = ChatMessage(
        id: incoming.id,
        threadId: incoming.threadId,
        senderOwnerId: incoming.senderOwnerId ?? kept.senderOwnerId,
        senderDisplayName: kept.senderDisplayName ?? incoming.senderDisplayName,
        text: kept.text,
        createdAt: incoming.createdAt ?? kept.createdAt,
        isOutbound: true,
        attachments: kept.attachments ?? incoming.attachments,
      );
      return [promoted, ...list];
    }
  }

  if (key.isNotEmpty) {
    list = list
        .where((m) {
          if (!m.id.startsWith('temp_')) return true;
          if (chatTextKey(m.text) == key) return false;
          if (agentAttachmentEchoMatchesDisplay(
            displayText: m.text,
            outboundEcho: incoming.text,
          )) {
            return false;
          }
          return true;
        })
        .toList();
  }

  if (collapseMatchingOutbound && showAsMine && key.isNotEmpty) {
    list = list
        .where(
          (m) =>
              !(m.isOutbound &&
                  m.id != incoming.id &&
                  chatTextKey(m.text) == key &&
                  !messageHasAgentHomeAttachments(m)),
        )
        .toList();
  }

  // Empty-text voice notes never match chatTextKey — drop optimistic
  // pending-voice rows when a real outbound audio message arrives.
  if (showAsMine &&
      incoming.attachments?.any((a) => a.isAudio) == true) {
    list = list.where((m) => !m.id.startsWith('pending-voice-')).toList();
  }

  // History / other-device attachment echoes: show stripped text, not the dump.
  var toInsert = incoming;
  if (showAsMine &&
      incoming.isOutbound &&
      looksLikeAgentAttachmentOutbound(incoming.text)) {
    toInsert = ChatMessage(
      id: incoming.id,
      threadId: incoming.threadId,
      senderOwnerId: incoming.senderOwnerId,
      senderDisplayName: incoming.senderDisplayName,
      text: stripAgentAttachmentContextForDisplay(incoming.text ?? ''),
      createdAt: incoming.createdAt,
      isOutbound: incoming.isOutbound,
      attachments: incoming.attachments,
    );
  }

  list = list.where((m) => m.id != toInsert.id).toList();
  return [toInsert, ...list];
}

/// Default voice-note filename for a MIME type (EnvoyGo records WAV).
@visibleForTesting
String filenameForMime(String mimeType) {
  final m = mimeType.toLowerCase();
  if (m.contains('wav')) return 'voice-note.wav';
  if (m.contains('webm')) return 'voice-note.webm';
  if (m.contains('mpeg') || m.contains('mp3')) return 'voice-note.mp3';
  if (m.contains('ogg')) return 'voice-note.ogg';
  return 'voice-note.m4a';
}

/// Peer / agent key after `nodeId:` in a thread id.
/// Handles `nodeId:envoyai`, `nodeId:external`, and `nodeId:envoy:owner:…`.
String? threadPeerSuffix(String threadId, String? nodeId) {
  if (nodeId != null && nodeId.isNotEmpty) {
    final prefix = '$nodeId:';
    if (threadId.startsWith(prefix) && threadId.length > prefix.length) {
      return threadId.substring(prefix.length);
    }
  }
  final i = threadId.indexOf(':');
  if (i < 0 || i + 1 >= threadId.length) return null;
  return threadId.substring(i + 1);
}

class ChatNotifier extends StateNotifier<ChatState> {
  final Ref _ref;
  final LocalDatabase _localDb = LocalDatabase();
  final _seenMessageIds = <String>{};
  Future<void>? _syncTerminalsInFlight;

  ChatNotifier(this._ref) : super(const ChatState());

  /// Drop threads/messages for [nodeId] (used on unpair).
  void clearForNode(String nodeId) {
    final prefix = '$nodeId:';
    state = ChatState(
      threads: state.threads.where((t) => t.nodeId != nodeId).toList(),
      messages: Map.fromEntries(
        state.messages.entries.where((e) => !e.key.startsWith(prefix)),
      ),
      selectedTab: 0,
    );
    // Dedup set mixes bare messageIds and `$threadId:$messageId` keys.
    _seenMessageIds.clear();
  }

  /// Live typed RPC client. Prefer this over [nodeServiceProvider], which
  /// can cache null across reconnect gaps when `_client` is assigned
  /// without a matching `nodeProvider` state change.
  NodeServiceClient? _liveNodeService() {
    final client = _ref.read(nodeProvider.notifier).client;
    if (client == null) return null;
    return NodeServiceClient(client);
  }

  ChatMessage _copyMessage(ChatMessage msg, {GroupDeliveryMetadata? delivery, String? id}) {
    return ChatMessage(
      id: id ?? msg.id,
      threadId: msg.threadId,
      senderOwnerId: msg.senderOwnerId,
      senderDisplayName: msg.senderDisplayName,
      text: msg.text,
      createdAt: msg.createdAt,
      isOutbound: msg.isOutbound,
      delivery: delivery ?? msg.delivery,
      attachments: msg.attachments,
    );
  }

  void _persistMessage(ChatMessage msg) {
    unawaited(_localDb.insertMessage(msg.toJson()));
  }

  /// Load cached threads from local storage. Self-threads (the
  /// owner's own ownerId, or any envoy_device_ key) are filtered
  /// out on load — this cleans up any stale self-thread that was
  /// persisted in a previous session before the filter existed.
  /// The DB row is left in place for now (cheap to leave); the
  /// in-memory state is what the UI renders.
  Future<void> loadThreads(String nodeId) async {
    final rows = await _localDb.getThreads(nodeId);
    final selfOwnerId = _ref.read(nodeProvider).ownerId;
    final isOwner = _ref.read(nodeProvider).isOwnerProfile;
    final threads = <ChatThread>[];
    for (final row in rows) {
      var t = _stripLegacyAgentStatusSuffix(ChatThread.fromJson(row));
      if (isSelfThreadPeer(t.contactOwnerId, selfOwnerId)) continue;
      // Pi is a terminal session now — drop legacy AI-section Pi chat rows.
      // Also drop synthetic "envoy:pi" Contacts leaks from old Ext Agent pushes.
      if (t.type == ChatThreadType.pi ||
          t.contactOwnerId == 'envoy:pi' ||
          t.id.endsWith(':envoy:pi')) {
        await _localDb.deleteThread(t.id);
        continue;
      }
      // Repair stale EnvoyAI titles that inherited Ext Agent names (e.g. "Pi")
      // from bridge:status before agentType/agentName were separated.
      if (t.type == ChatThreadType.envoyai && t.displayName != 'EnvoyAI') {
        t = t.copyWith(displayName: 'EnvoyAI');
        unawaited(_localDb.upsertThread(t.toJson()));
      }
      // Phase 51E — non-owners only restore AI + family threads from cache.
      // Ext Agent is opt-in per profile: never restore from cache when denied
      // (App Review family QR must not see a stale Ext Agent row).
      if (!isOwner && t.type == ChatThreadType.externalAgent) {
        if (_isDeniedExtAgentFamily(_ref.read(nodeProvider))) {
          continue;
        }
      }
      if (!isOwner && t.type == ChatThreadType.envoyHarness) {
        if (_isDeniedCodingFamily(_ref.read(nodeProvider))) {
          continue;
        }
      }
      if (!isOwner &&
          t.type != ChatThreadType.envoyai &&
          t.type != ChatThreadType.externalAgent &&
          t.type != ChatThreadType.aiBot &&
          t.type != ChatThreadType.envoyHarness &&
          t.type != ChatThreadType.family &&
          t.type != ChatThreadType.familyGroup) {
        continue;
      }
      threads.add(t);
    }
    state = state.copyWith(threads: threads);
  }

  /// Clear legacy " (Bridge Offline)" suffixes from Ext Agent display names.
  ChatThread _stripLegacyAgentStatusSuffix(ChatThread t) {
    if (t.type == ChatThreadType.externalAgent) {
      final cleaned = t.displayName
          .replaceFirst(RegExp(r'\s*\(Bridge (Online|Offline)\)$'), '')
          .trim();
      if (cleaned.isNotEmpty && cleaned != t.displayName) {
        return ChatThread(
          id: t.id,
          nodeId: t.nodeId,
          type: t.type,
          displayName: cleaned,
          contactOwnerId: t.contactOwnerId,
          chatRoomId: t.chatRoomId,
          agentType: t.agentType,
          lastMessageText: t.lastMessageText,
          lastMessageAt: t.lastMessageAt,
          unreadCount: t.unreadCount,
        );
      }
    }
    return t;
  }

  /// Sync threads from the home node on initial connect.
  Future<void> syncThreads() async {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    // Build threads from contacts.
    final contactNotifier = _ref.read(contactProvider.notifier);
    // Sync contacts first, then build threads.
    state = state.copyWith(isLoading: true);
    // Always restore cached threads (filtered for non-owners inside loadThreads).
    await loadThreads(nodeState.activeNode!.id);
    // Mesh bonds are owner-only — family members skip.
    if (nodeState.isOwnerProfile) {
      await contactNotifier.syncBonds();
      await syncRooms();
    }
    syncFamilyContacts(nodeState.familyProfiles, nodeState.activeNode!.id);
    await syncFamilyRooms();
    await syncEhChats();
    state = state.copyWith(isLoading: false);
  }

  /// Phase 51C — ensure a chat-list row for every other family profile.
  /// Inactive profiles stay listed (history / offline) per family_network.md §5.2.
  void syncFamilyContacts(
    List<Map<String, dynamic>> profiles,
    String nodeId,
  ) {
    final myProfileId = _ref.read(nodeProvider).effectiveFamilyProfileId;
    final validPeerIds = <String>{};
    for (final raw in profiles) {
      final id = raw['id']?.toString().trim() ?? '';
      if (id.isEmpty || id == myProfileId) continue;
      final name = raw['name']?.toString().trim();
      if (name == null || name.isEmpty) continue;
      validPeerIds.add(id);
      final active = raw['active'] != false;
      final displayName = active ? name : '$name (offline)';
      final threadKey = _familyThreadKey(myProfileId, id);
      final threadId = '$nodeId:$threadKey';
      _upsertThread(
        threadId: threadId,
        nodeId: nodeId,
        type: ChatThreadType.family,
        displayName: displayName,
        contactOwnerId: id,
        avatarColor: raw['avatarColor']?.toString(),
      );
    }
    // Drop stale self-chats (e.g. Allen Peng row after session flipped to
    // owner). Only drop "unknown peer" rows when the roster is non-empty —
    // an empty profiles list must not wipe every family thread.
    final stale = state.threads.where((t) {
      if (t.nodeId != nodeId || t.type != ChatThreadType.family) return false;
      final peer = t.contactOwnerId?.trim() ?? '';
      if (peer.isEmpty || peer == myProfileId) return true;
      final marker = t.id.indexOf(':family:');
      if (marker < 0) return true;
      final key = t.id.substring(marker + 1);
      final parts = key.split(':');
      if (parts.length != 3) return true;
      if (parts[1] != myProfileId && parts[2] != myProfileId) return true;
      if (validPeerIds.isNotEmpty && !validPeerIds.contains(peer)) return true;
      return false;
    }).toList();
    for (final t in stale) {
      unawaited(deleteThread(t.id));
    }
  }

  static String _familyThreadKey(String a, String b) {
    return a.compareTo(b) < 0 ? 'family:$a:$b' : 'family:$b:$a';
  }

  /// Other profile id in `family:<a>:<b>` relative to [myProfileId].
  static String? familyPeerIdFromThreadKey(String threadKey, String myProfileId) {
    final key = threadKey.startsWith('family:')
        ? threadKey
        : (threadKey.contains(':family:')
            ? threadKey.substring(threadKey.indexOf(':family:') + 1)
            : threadKey);
    final parts = key.split(':');
    if (parts.length != 3 || parts[0] != 'family') return null;
    final a = parts[1];
    final b = parts[2];
    final me = myProfileId.trim();
    if (a == me) return b;
    if (b == me) return a;
    return null;
  }

  /// Phase 51C — send a local family DM.
  Future<void> sendFamilyMessage(String toProfileId, String text) async {
    final nodeService = _liveNodeService();
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) {
      throw StateError('Not connected to home node');
    }
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    final myProfileId = nodeState.effectiveFamilyProfileId;
    final toId = toProfileId.trim();
    if (toId.isEmpty) {
      throw StateError('Missing family recipient');
    }
    if (toId == myProfileId) {
      // Stale "Allen Peng" row after this device became owner, or a push
      // deep-link that used the sender id instead of the peer id.
      final nodeId = nodeState.activeNode!.id;
      if (nodeState.familyProfiles.isNotEmpty) {
        syncFamilyContacts(nodeState.familyProfiles, nodeId);
      }
      throw StateError(
        'Cannot message yourself. This chat is stale — go back and open '
        'the contact again. If you should be Mom/Dad, unpair and re-pair '
        'with a family invite.',
      );
    }
    final threadKey = _familyThreadKey(myProfileId, toId);
    final threadId = '${nodeState.activeNode!.id}:$threadKey';
    final now = DateTime.now().toUtc().toIso8601String();
    final tempMsg = ChatMessage(
      id: 'temp_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      text: trimmed,
      createdAt: now,
      isOutbound: true,
      senderDisplayName: 'You',
      senderOwnerId: myProfileId,
    );
    _localDb.insertMessage(tempMsg.toJson());
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [tempMsg, ...?state.messages[threadId]],
      },
    );

    String displayName = toId;
    for (final p in nodeState.familyProfiles) {
      if (p['id']?.toString() == toId) {
        displayName = p['name']?.toString() ?? toId;
        break;
      }
    }
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.family,
      displayName: displayName,
      contactOwnerId: toId,
      lastMessageText: trimmed,
      lastMessageAt: DateTime.tryParse(now),
    );

    void rollbackOptimistic() {
      unawaited(_localDb.deleteMessage(tempMsg.id));
      state = state.copyWith(
        messages: {
          ...state.messages,
          threadId: [
            for (final m in state.messages[threadId] ?? const <ChatMessage>[])
              if (m.id != tempMsg.id) m,
          ],
        },
      );
    }

    try {
      await nodeService.sendFamilyMessage(toProfileId: toId, text: trimmed);
    } catch (e) {
      final err = e.toString();
      final looksLikeSelf = err.contains('yourself') ||
          err.contains('Cannot send a family message to yourself');
      // UI says Mom/Dad but home session token is still owner → repair once.
      if (looksLikeSelf && myProfileId != 'owner') {
        final repaired =
            await _ref.read(nodeProvider.notifier).repairFamilySession(
                  myProfileId,
                  force: true,
                );
        if (repaired) {
          final live = _liveNodeService();
          if (live != null) {
            try {
              await live.sendFamilyMessage(toProfileId: toId, text: trimmed);
              return;
            } catch (_) {
              rollbackOptimistic();
              rethrow;
            }
          }
        }
        rollbackOptimistic();
        throw StateError(
          'This phone is still paired as Owner on the home node, so it '
          'cannot message Allen Peng / Owner. Unpair, then re-pair with a '
          'fresh family invite and choose Mom.',
        );
      }
      rollbackOptimistic();
      rethrow;
    }
  }

  /// Send a direct message. Optional [attachments] for audio/files (Phase 37).
  Future<void> sendMessage(String targetOwnerId, String text,
      {List<Map<String, dynamic>>? attachments}) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;

    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    // Optimistic insert.
    final now = DateTime.now().toUtc().toIso8601String();
    final threadId = '${nodeState.activeNode!.id}:$targetOwnerId';
    final attModels = attachments
        ?.map((a) => ChatAttachment.fromJson(a))
        .toList();
    final tempMsg = ChatMessage(
      id: 'temp_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      text: text,
      createdAt: now,
      isOutbound: true,
      attachments: attModels,
    );

    // Update in-memory state.
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          tempMsg,
          ...?state.messages[threadId],
        ],
      },
    );

    // Update thread — use contact's display name if available.
    var contactName = _ref.read(contactProvider.notifier).getContact(targetOwnerId)?.displayName;
    if (contactName == null || contactName!.isEmpty) {
      contactName = _ref.read(contactProvider).bonds
          .where((c) => c.ownerId == targetOwnerId)
          .firstOrNull
          ?.displayName;
    }
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.direct,
      displayName: (contactName != null && contactName!.isNotEmpty)
          ? contactName!
          : targetOwnerId,
      contactOwnerId: targetOwnerId,
      lastMessageText: text,
      lastMessageAt: DateTime.now(),
    );

    void rollbackOptimistic() {
      state = state.copyWith(
        messages: {
          ...state.messages,
          threadId: [
            for (final m in state.messages[threadId] ?? const <ChatMessage>[])
              if (m.id != tempMsg.id) m,
          ],
        },
      );
    }

    try {
      // Send via RPC.
      await nodeService.sendChat(targetOwnerId, text,
          attachments: attachments);
      // TODO(31D): Reconcile temp message with server response.
    } catch (e) {
      rollbackOptimistic();
      rethrow;
    }
  }

  /// Insert (or replace) an outbound voice note as soon as
  /// `sendChatAttachment` returns — don't wait for the WS echo.
  void upsertOutboundVoiceNote({
    required String targetOwnerId,
    required String messageId,
    required String vaultRelativePath,
    required String attachmentId,
    required int sizeBytes,
    required String mimeType,
    int? durationSec,
  }) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;
    final threadId = '${nodeState.activeNode!.id}:$targetOwnerId';
    final now = DateTime.now().toUtc().toIso8601String();
    final att = ChatAttachment(
      id: attachmentId,
      filename: filenameForMime(mimeType),
      mimeType: mimeType,
      sizeBytes: sizeBytes,
      sensitivity: 'friends',
      vaultRelativePath: vaultRelativePath,
      durationSec: durationSec,
    );
    final existing = state.messages[threadId] ?? const <ChatMessage>[];
    List<ChatMessage> withoutPending(List<ChatMessage> list) => [
          for (final m in list)
            if (!m.id.startsWith('pending-voice-')) m,
        ];

    if (existing.any((m) => m.id == messageId)) {
      // Already have the WS echo — enrich duration if missing, drop pending.
      state = state.copyWith(
        messages: {
          ...state.messages,
          threadId: [
            for (final m in withoutPending(existing))
              if (m.id == messageId &&
                  (m.attachments == null ||
                      m.attachments!.every((a) => a.durationSec == null)) &&
                  durationSec != null)
                ChatMessage(
                  id: m.id,
                  threadId: m.threadId,
                  senderOwnerId: m.senderOwnerId,
                  senderDisplayName: m.senderDisplayName,
                  text: m.text,
                  createdAt: m.createdAt,
                  isOutbound: m.isOutbound,
                  attachments: [
                    for (final a in m.attachments ?? const <ChatAttachment>[])
                      ChatAttachment(
                        id: a.id,
                        filename: a.filename,
                        mimeType: a.mimeType,
                        sizeBytes: a.sizeBytes,
                        sensitivity: a.sensitivity,
                        vaultRelativePath: a.vaultRelativePath ?? vaultRelativePath,
                        durationSec: a.durationSec ?? durationSec,
                      ),
                  ],
                )
              else
                m,
          ],
        },
      );
      return;
    }

    // Drop optimistic pending-voice rows (any codec).
    final filtered = withoutPending(existing);

    final msg = ChatMessage(
      id: messageId,
      threadId: threadId,
      senderOwnerId: nodeState.ownerId,
      senderDisplayName: 'You',
      text: '',
      createdAt: now,
      isOutbound: true,
      attachments: [att],
    );

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [msg, ...filtered],
      },
    );

    var contactName =
        _ref.read(contactProvider.notifier).getContact(targetOwnerId)?.displayName;
    if (contactName == null || contactName.isEmpty) {
      contactName = _ref
          .read(contactProvider)
          .bonds
          .where((c) => c.ownerId == targetOwnerId)
          .firstOrNull
          ?.displayName;
    }
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.direct,
      displayName: (contactName != null && contactName.isNotEmpty)
          ? contactName
          : targetOwnerId,
      contactOwnerId: targetOwnerId,
      lastMessageText: 'Voice note',
      lastMessageAt: DateTime.now(),
    );

    unawaited(_localDb.insertMessage(msg.toJson()));
  }

  /// Optimistic placeholder while `sendChatAttachment` is in flight.
  String insertPendingVoiceNote({
    required String targetOwnerId,
    required int durationSec,
    required int sizeBytes,
  }) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return '';
    final threadId = '${nodeState.activeNode!.id}:$targetOwnerId';
    final tempId = 'pending-voice-${DateTime.now().microsecondsSinceEpoch}';
    final now = DateTime.now().toUtc().toIso8601String();
    final msg = ChatMessage(
      id: tempId,
      threadId: threadId,
      senderOwnerId: nodeState.ownerId,
      senderDisplayName: 'You',
      text: '',
      createdAt: now,
      isOutbound: true,
      attachments: [
        ChatAttachment(
          id: tempId,
          filename: 'voice-note.wav',
          mimeType: 'audio/wav',
          sizeBytes: sizeBytes,
          sensitivity: 'friends',
          durationSec: durationSec > 0 ? durationSec : 1,
        ),
      ],
    );
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [msg, ...?state.messages[threadId]],
      },
    );
    return tempId;
  }

  void removePendingVoiceNote(String targetOwnerId, String tempId) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null || tempId.isEmpty) return;
    final threadId = '${nodeState.activeNode!.id}:$targetOwnerId';
    final existing = state.messages[threadId];
    if (existing == null) return;
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [for (final m in existing) if (m.id != tempId) m],
      },
    );
  }

  /// Load chat history for a thread from the home node (remote).
  ///
  /// Direct chats use [contactOwnerId]. Group chats use [chatRoomId]
  /// (history is stored under thread key `room:{roomId}`).
  Future<void> loadHistory(
    String threadId, {
    String? contactOwnerId,
    String? chatRoomId,
  }) async {
    String? peerKey = chatRoomId != null && chatRoomId.isNotEmpty
        ? 'room:$chatRoomId'
        : contactOwnerId;
    // Phase 51C — family DM history is stored under `family:<sortedA>:<sortedB>`.
    final familyMarker = threadId.indexOf(':family:');
    if (familyMarker >= 0) {
      peerKey = threadId.substring(familyMarker + 1);
    }
    if (peerKey == null || peerKey.isEmpty) return;

    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;
    final nodeState = _ref.read(nodeProvider);
    final selfOwnerId = nodeState.ownerId;
    final selfFamilyProfileId = nodeState.effectiveFamilyProfileId;

    // lastOrNull on a newest-first list = the chronologically oldest message.
    final earliestCached = state.messages[threadId]?.lastOrNull;
    final messages = await nodeService.listChatHistory(
      peerKey,
      before: earliestCached?.createdAt,
      threadId: threadId,
      selfOwnerId: selfOwnerId,
      selfFamilyProfileId: selfFamilyProfileId,
    );

    if (messages.isEmpty) return;

    // Upsert by messageId so corrected isOutbound/sender labels replace a
    // stale local-DB cache (family DMs were previously flipped vs mesh ownerId).
    final byId = <String, ChatMessage>{
      for (final m in state.messages[threadId] ?? const <ChatMessage>[])
        m.id: m,
    };
    var changed = false;
    for (final msg in messages) {
      final prev = byId[msg.id];
      final prevAttEmpty =
          prev?.attachments == null || prev!.attachments!.isEmpty;
      final msgAttPresent =
          msg.attachments != null && msg.attachments!.isNotEmpty;
      if (prev == null ||
          prev.isOutbound != msg.isOutbound ||
          prev.senderDisplayName != msg.senderDisplayName ||
          prev.text != msg.text ||
          (prevAttEmpty && msgAttPresent)) {
        byId[msg.id] = msg;
        changed = true;
        try {
          await _localDb.insertMessage(msg.toJson());
        } catch (_) {
          // Best-effort local cache — don't fail the open.
        }
      }
    }

    if (!changed) return;

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: byId.values.toList(),
      },
    );
    _sortThreadMessages(threadId);
  }

  /// Load chat history for EnvoyAI / Ext Agent / AI bot threads.
  Future<void> loadAgentHistory(String threadId) async {
    final nodeService = _liveNodeService();
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    // threadId is `nodeId:envoyai`, `nodeId:external`, or `nodeId:bot:<id>`.
    final agentType =
        threadPeerSuffix(threadId, nodeState.activeNode!.id) ?? 'envoyai';
    // Accept envoyai, external, and bot:* thread keys.
    if (agentType != 'envoyai' && agentType != 'external' && !agentType.startsWith('bot:')) return;

    // For bot threads, use the bot: prefix as the history key.
    final historyKey = agentType.startsWith('bot:') ? agentType : agentType;
    final oldestCached = state.messages[threadId]?.lastOrNull;
    final messages = await nodeService.listChatHistory(
      historyKey,
      before: oldestCached?.createdAt,
      threadId: threadId,
      selfOwnerId: nodeState.ownerId,
      selfFamilyProfileId: nodeState.effectiveFamilyProfileId,
    );

    if (messages.isEmpty) return;

    final byId = <String, ChatMessage>{
      for (final m in state.messages[threadId] ?? const <ChatMessage>[])
        m.id: m,
    };
    var changed = false;
    for (final m in messages) {
      // Normalize thread_id to the UI thread key (not "envoyai"/"external").
      var msg = ChatMessage(
        id: m.id,
        threadId: threadId,
        senderOwnerId: m.senderOwnerId,
        senderDisplayName: m.senderDisplayName,
        text: m.text,
        createdAt: m.createdAt,
        isOutbound: m.isOutbound,
        attachments: m.attachments,
      );

      // Promote local attachment display bubble over expanded home echo.
      if (msg.isOutbound && looksLikeAgentAttachmentOutbound(msg.text)) {
        ChatMessage? localMatch;
        for (final e in byId.values) {
          if (!e.isOutbound) continue;
          if (!agentAttachmentEchoMatchesDisplay(
            displayText: e.text,
            outboundEcho: msg.text,
          )) {
            continue;
          }
          if (e.id.startsWith('temp_') || messageHasAgentHomeAttachments(e)) {
            localMatch = e;
            break;
          }
        }
        if (localMatch != null) {
          final kept = localMatch;
          if (kept.id.startsWith('temp_')) {
            byId.remove(kept.id);
            changed = true;
            await _localDb.deleteMessage(kept.id);
          }
          msg = ChatMessage(
            id: msg.id,
            threadId: threadId,
            senderOwnerId: msg.senderOwnerId ?? kept.senderOwnerId,
            senderDisplayName: kept.senderDisplayName ?? msg.senderDisplayName,
            text: kept.text,
            createdAt: msg.createdAt ?? kept.createdAt,
            isOutbound: true,
            attachments: kept.attachments ?? msg.attachments,
          );
        } else {
          msg = ChatMessage(
            id: msg.id,
            threadId: threadId,
            senderOwnerId: msg.senderOwnerId,
            senderDisplayName: msg.senderDisplayName,
            text: stripAgentAttachmentContextForDisplay(msg.text ?? ''),
            createdAt: msg.createdAt,
            isOutbound: msg.isOutbound,
            attachments: msg.attachments,
          );
        }
      }

      final prev = byId[msg.id];
      if (prev == null ||
          prev.isOutbound != msg.isOutbound ||
          prev.senderDisplayName != msg.senderDisplayName ||
          prev.text != msg.text) {
        byId[msg.id] = msg;
        changed = true;
        await _localDb.insertMessage(msg.toJson());
      }
      // Drop optimistic duplicates that history has now confirmed.
      if (msg.isOutbound) {
        final key = chatTextKey(msg.text);
        final tempIds = byId.keys
            .where((id) {
              if (!id.startsWith('temp_')) return false;
              final temp = byId[id];
              if (key.isNotEmpty && chatTextKey(temp?.text) == key) {
                return true;
              }
              return agentAttachmentEchoMatchesDisplay(
                displayText: temp?.text,
                outboundEcho: m.text,
              );
            })
            .toList();
        for (final tempId in tempIds) {
          byId.remove(tempId);
          changed = true;
          await _localDb.deleteMessage(tempId);
        }
      }
    }

    if (!changed) return;

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: byId.values.toList(),
      },
    );
    _sortThreadMessages(threadId);
  }

  /// Load messages from local DB into memory.
  /// Called when opening a thread that has no in-memory messages yet.
  Future<void> loadMessagesFromDb(String threadId) async {
    final rows = await _localDb.getMessages(threadId);
    if (rows.isEmpty) return;
    // getMessages returns newest-first (DESC). Merge with any in-memory
    // messages (e.g. history that raced ahead) then re-sort.
    final fromDb = rows.map((r) => ChatMessage.fromJson(r)).toList();
    final existing = state.messages[threadId] ?? const <ChatMessage>[];
    final seen = fromDb.map((m) => m.id).toSet();
    final merged = [
      ...fromDb,
      ...existing.where((m) => !seen.contains(m.id)),
    ];
    state = state.copyWith(
      messages: {...state.messages, threadId: merged},
    );
    _sortThreadMessages(threadId);
  }

  /// Sort a thread's message list by createdAt descending (newest first).
  /// The ListView uses reverse:true, which expects index 0 = newest
  /// (rendered at the bottom).
  void _sortThreadMessages(String threadId) {
    final msgs = state.messages[threadId];
    if (msgs == null || msgs.length <= 1) return;
    final sorted = List<ChatMessage>.from(msgs)
      ..sort((a, b) => (b.createdAt ?? '').compareTo(a.createdAt ?? ''));
    state = state.copyWith(
      messages: {...state.messages, threadId: sorted},
    );
  }

  /// Mark a thread as read.
  ///
  /// Always clears the local unread badge. When [contactOwnerId] is set
  /// (direct contacts), also notifies the home node. Agent/bot threads
  /// have no remote mark-read RPC — local clear is enough.
  Future<void> markRead(String threadId,
      {String? contactOwnerId}) async {
    final threads = state.threads.map((t) {
      if (t.id == threadId) {
        return ChatThread.fromJson({
          ...t.toJson(),
          'unread_count': 0,
        });
      }
      return t;
    }).toList();
    state = state.copyWith(threads: threads);
    final cleared = threads.where((t) => t.id == threadId).firstOrNull;
    if (cleared != null) {
      unawaited(_localDb.upsertThread(cleared.toJson()));
    }

    if (contactOwnerId == null || contactOwnerId.isEmpty) return;
    final nodeService = _liveNodeService();
    if (nodeService == null) return;
    await nodeService.markRead(contactOwnerId);
  }

  /// Handle a chat:message push event.
  ///
  /// Accepts both the home node's nested ChatMessage format
  /// (sender.ownerId, content.text, metadata.timestamp) and the
  /// flat serialized format (senderOwnerId, text, createdAt).
  void onChatMessage(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    // Normalize: the home node emits ChatMessage with nested structure.
    final sender = data['sender'] as Map<String, dynamic>?;
    final content = data['content'] as Map<String, dynamic>?;
    final metadata = data['metadata'] as Map<String, dynamic>?;

    final senderOwnerId = ((data['senderOwnerId'] ?? sender?['ownerId']) as String?)?.trim();
    final text = (data['text'] ?? content?['text']) as String?;
    final messageId = data['messageId'] as String?;
    final createdAt = (data['createdAt'] ?? metadata?['timestamp']) as String?;
    final senderDisplayName = (data['senderDisplayName'] ?? sender?['displayName']) as String?;
    final attachmentsRaw = data['attachments'] as List<dynamic>? ??
        content?['attachments'] as List<dynamic>?;

    if (senderOwnerId == null) return;

    // Skip messages with no text AND no audio attachments — empty bubbles.
    final hasAudio = attachmentsRaw?.any((a) {
      final mime = (a is Map) ? (a['mimeType'] ?? a['mime_type']) as String? : null;
      return mime != null && mime.startsWith('audio/');
    }) ?? false;
    if ((text == null || text.isEmpty) && !hasAudio) return;

    // Skip intro messages for contacts that are already bonded — they
    // have no pending intro request so showing "Wants to connect" is wrong.
    if (messageId != null && messageId!.startsWith('intro_')) {
      final bonds = _ref.read(contactProvider).bonds;
      if (bonds.any((c) => c.ownerId == senderOwnerId)) {
        return; // Already bonded — skip intro message.
      }
    }

    // --- Identify the parties ---
    final selfOwnerId = nodeState.ownerId;
    final recipient = data['recipient'] as Map<String, dynamic>?;
    final recipientOwnerId = recipient?['ownerId'] as String?;
    final actorRole = sender?['actorRole'] as String?;

    // Is this message sent by the owner, by an agent, or by someone else?
    // Prefer immutable pairing intent so a corrupted owner session id does
    // not keep owner-side copies of family:owner:mom threads.
    final myProfileId = nodeState.effectiveFamilyProfileId;
    final sentBySelf = (selfOwnerId != null && senderOwnerId == selfOwnerId) ||
        senderOwnerId == myProfileId;
    // Synthetic agent senders must never become Contacts rows.
    final isSyntheticAgent = senderOwnerId == 'envoy:pi' ||
        senderOwnerId == '__envoy_ai__' ||
        senderOwnerId.startsWith('__envoy_ai__:') ||
        senderOwnerId.startsWith('bridge:') ||
        senderOwnerId.startsWith('envoy_agent_') ||
        senderOwnerId.startsWith('envoy:agent:') ||
        senderOwnerId.startsWith('bot:');
    final isAgent = !(senderOwnerId == 'terminal') &&
        (isSyntheticAgent || (sentBySelf && actorRole == 'agent'));
    final isTerminal = senderOwnerId == 'terminal';

    // Figure out the "other party" — which contact's thread this goes to.
    final String peerId;
    if (sentBySelf && actorRole == 'human') {
      // Owner sent to a contact → thread is the recipient.
      peerId = recipientOwnerId ?? senderOwnerId;
    } else if (isAgent && recipientOwnerId != null && recipientOwnerId.isNotEmpty) {
      // Agent sent to a contact → thread is the recipient.
      peerId = recipientOwnerId;
    } else {
      // Inbound from a contact → thread is the sender.
      peerId = senderOwnerId;
    }

    // Filter self-threads: if the resolved "other party" is the
    // user themselves (a self-echo with no recipient, or a
    // self-bond / envoy_device_ entry that slipped through), drop
    // the message entirely. This is the bug that surfaced a
    // "chat with yourself" thread in the list — see the
    // [isSelfThreadPeer] helper for the rule.
    // Do NOT filter agent messages — the AI replies to the owner,
    // so recipientOwnerId == selfOwnerId is expected and correct.
    if (!isAgent && isSelfThreadPeer(peerId, selfOwnerId)) {
      return;
    }

    // Dedup: skip if we've already seen this messageId (dual delivery).
    final msgId = messageId ?? '';
    if (msgId.isNotEmpty && _seenMessageIds.contains(msgId)) return;
    if (msgId.isNotEmpty) {
      _seenMessageIds.add(msgId);
      if (_seenMessageIds.length > 200) {
        _seenMessageIds
            .removeAll(_seenMessageIds.take(_seenMessageIds.length - 200));
      }
    }

    // --- Determine which thread to put the message in ---
    // Route strictly by deliveryChannel when present — never let bridge
    // metadata or agentType bleed EnvoyAI into Ext Agent (or the reverse).
    final terminalId = data['terminalId'] as String?;
    final terminalName = data['terminalName'] as String?;
    final deliveryChannel = metadata?['deliveryChannel'] as String?;
    final deliverySource = metadata?['deliverySource'] as String?;
    final botThreadKey = senderOwnerId.startsWith('bot:')
        ? senderOwnerId
        : (recipientOwnerId != null && recipientOwnerId.startsWith('bot:')
            ? recipientOwnerId
            : null);
    final isAiBot = botThreadKey != null;
    // Builtin EnvoyAI only — character bots share deliveryChannel "ai" but
    // must stay on their own `bot:<id>` thread.
    final isBuiltinAi = !isAiBot &&
        (deliveryChannel == 'ai' ||
            senderOwnerId == '__envoy_ai__' ||
            senderOwnerId.startsWith('__envoy_ai__:'));
    final isBridgeAgent = !isBuiltinAi &&
        !isAiBot &&
        ((deliveryChannel == 'agent' && deliverySource == 'bridge') ||
            senderOwnerId == 'envoy:pi' ||
            senderOwnerId.startsWith('bridge:'));
    final familyThreadKey = recipientOwnerId != null &&
            recipientOwnerId.startsWith('family:')
        ? recipientOwnerId
        : (senderOwnerId.startsWith('family:') ? senderOwnerId : null);
    final isFamilyDm = familyThreadKey != null;
    // Drop family DMs that do not involve this device's profile (defense in
    // depth if a session was wrongly bound to owner and received owner copies).
    if (isFamilyDm && familyThreadKey != null) {
      final parts = familyThreadKey.split(':');
      if (parts.length == 3) {
        final a = parts[1];
        final b = parts[2];
        if (myProfileId != a && myProfileId != b) return;
      }
    }
    final agentType = isAiBot
        ? botThreadKey!
        : isBridgeAgent
            ? 'external'
            : 'envoyai';

    // Agent messages: if the recipient is a known contact → contact's thread.
    // If the recipient is the owner (chatting with EnvoyAI) → envoyai thread.
    final agentTalkToContact = isAgent &&
        !isBridgeAgent &&
        !isBuiltinAi &&
        !isAiBot &&
        !isFamilyDm &&
        recipientOwnerId != null &&
        recipientOwnerId.isNotEmpty &&
        recipientOwnerId != selfOwnerId;

    final String threadId;
    if (isTerminal) {
      threadId = '${nodeState.activeNode!.id}:term:${terminalId ?? senderOwnerId}';
    } else if (isFamilyDm) {
      threadId = '${nodeState.activeNode!.id}:$familyThreadKey';
    } else if (isAiBot) {
      threadId = '${nodeState.activeNode!.id}:$botThreadKey';
    } else if (isBuiltinAi) {
      threadId = '${nodeState.activeNode!.id}:envoyai';
    } else if (isBridgeAgent) {
      threadId = '${nodeState.activeNode!.id}:external';
    } else if (agentTalkToContact) {
      threadId = '${nodeState.activeNode!.id}:$recipientOwnerId';
    } else if (isAgent) {
      // Agent without channel metadata → EnvoyAI (safer than Ext Agent).
      threadId = '${nodeState.activeNode!.id}:envoyai';
    } else {
      threadId = '${nodeState.activeNode!.id}:$peerId';
    }

    // --- Display names ---
    // Thread name: ONLY use the contact's display name for direct threads.
    // Never use senderDisplayName — that changes with every message.
    String? threadDisplayName;
    if (!isTerminal && (agentTalkToContact || !isAgent)) {
      final contactNotifier = _ref.read(contactProvider.notifier);
      final contact = contactNotifier.getContact(peerId);
      threadDisplayName = contact?.displayName;
      // Fall back to bonds list.
      if ((threadDisplayName == null || threadDisplayName!.isEmpty) && peerId.isNotEmpty) {
        final contacts = _ref.read(contactProvider).bonds;
        threadDisplayName = contacts
            .where((c) => c.ownerId == peerId)
            .firstOrNull
            ?.displayName;
      }
    }
    if (threadDisplayName == null || threadDisplayName!.isEmpty || threadDisplayName!.startsWith('envoy:owner:')) {
      threadDisplayName = peerId;
    }

    // Message sender display:
    // - Sent by self (human) → "You", right side
    // - AI reply for a contact → "You", right side (agent acts as owner)
    // - Sent by agent (EnvoyAI chat) → agent name, left side
    // - Sent by peer → peer's name, left side
    final bool showAsMine = (sentBySelf && actorRole == 'human') ||
        agentTalkToContact ||
        (isFamilyDm && senderOwnerId == myProfileId);
    final msgSenderDisplay = showAsMine
        ? 'You'
        : (isAiBot
            ? (senderDisplayName ?? botThreadKey ?? 'Bot')
            : (isBridgeAgent
                ? (senderDisplayName ?? ThreadTitleSentinels.extAgent)
                : (isBuiltinAi || (isAgent && !agentTalkToContact)
                    ? (senderDisplayName ?? 'EnvoyAI')
                    : (senderDisplayName ?? senderOwnerId))));

    List<ChatAttachment>? attachments;
    try {
      attachments = attachmentsRaw
          ?.map((a) => ChatAttachment.fromJson(a as Map<String, dynamic>))
          .toList();
    } catch (_) {
      attachments = null;
    }
    final msg = ChatMessage(
      id: messageId ?? 'msg_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      senderOwnerId: senderOwnerId,
      senderDisplayName: msgSenderDisplay,
      text: text,
      createdAt: createdAt,
      isOutbound: showAsMine,
      attachments: attachments,
    );

    final isAiThread = isBridgeAgent ||
        isBuiltinAi ||
        isAiBot ||
        (isAgent && !agentTalkToContact);

    // Already have this server id in the thread — skip before upsert/unread.
    final existingMessages = state.messages[threadId] ?? [];
    if (messageId != null &&
        messageId!.isNotEmpty &&
        existingMessages.any((m) => m.id == messageId)) {
      return;
    }

    final ChatThreadType upsertType;
    if (isTerminal) {
      upsertType = ChatThreadType.terminal;
    } else if (isFamilyDm) {
      upsertType = ChatThreadType.family;
    } else if (isAiBot) {
      upsertType = ChatThreadType.aiBot;
    } else if (isAiThread) {
      upsertType = isBridgeAgent
          ? ChatThreadType.externalAgent
          : ChatThreadType.envoyai;
    } else {
      upsertType = ChatThreadType.direct;
    }
    final botIdFromKey = isAiBot && botThreadKey!.startsWith('bot:')
        ? botThreadKey.substring(4)
        : null;
    String? familyPeerId;
    String? familyPeerDisplayName;
    if (isFamilyDm && familyThreadKey != null) {
      final parts = familyThreadKey.split(':');
      if (parts.length == 3) {
        familyPeerId =
            parts[1] == myProfileId ? parts[2] : parts[1];
      }
      if (familyPeerId != null) {
        for (final p in nodeState.familyProfiles) {
          if (p['id']?.toString() == familyPeerId) {
            familyPeerDisplayName = p['name']?.toString();
            break;
          }
        }
      }
    }
    // Update thread.
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: upsertType,
      displayName: isTerminal
          ? '${ThreadTitleSentinels.terminalPrefix}${terminalName ?? terminalId ?? ''}'
          : isFamilyDm
              ? (familyPeerDisplayName ??
                  (senderOwnerId == myProfileId
                      ? null
                      : senderDisplayName) ??
                  familyPeerId ??
                  peerId)
              : agentTalkToContact
                  ? (threadDisplayName ?? peerId)
                  : isAiBot
                      ? (senderDisplayName ?? botThreadKey ?? 'Bot')
                      : isAiThread
                          ? (isBridgeAgent
                              ? (senderDisplayName ?? ThreadTitleSentinels.extAgent)
                              : 'EnvoyAI')
                          : threadDisplayName ?? peerId,
      contactOwnerId: isFamilyDm
          ? familyPeerId
          : ((isAiThread || (isAgent && !agentTalkToContact))
              ? null
              : peerId),
      agentType: isAiThread ? agentType : null,
      botId: botIdFromKey,
      lastMessageText: text ?? '',
      lastMessageAt: createdAt != null
          ? DateTime.tryParse(createdAt)
          : DateTime.now(),
      unreadIncrement: true,
    );

    // Dedup + optimistic echo reconcile (temp_* → server id).
    // AI threads also collapse same-text outbound echoes (Social pattern) so
    // family-member EnvoyAI does not keep both the optimistic bubble and the
    // home-node chat:message echo.
    final nextMessages = reconcileChatMessages(
      existing: existingMessages,
      incoming: msg,
      showAsMine: showAsMine,
      collapseMatchingOutbound: isAiThread,
    );

    // Persist: drop optimistic rows that were reconciled away, then upsert
    // the reconciled head (may be a promoted attachment bubble, not raw echo).
    final nextIds = nextMessages.map((m) => m.id).toSet();
    for (final old in existingMessages) {
      if (old.id.startsWith('temp_') && !nextIds.contains(old.id)) {
        unawaited(_localDb.deleteMessage(old.id));
      }
    }
    final toPersist = nextMessages.cast<ChatMessage?>().firstWhere(
          (m) => m!.id == msg.id,
          orElse: () => msg,
        )!;
    unawaited(_localDb.insertMessage(toPersist.toJson()));

    state = state.copyWith(
      messages: {...state.messages, threadId: nextMessages},
    );
    _sortThreadMessages(threadId);

    // Dual-route agent messages: if the AI reply is addressed to a
    // known contact, also show it in that contact's thread (same as
    // the Social app behaviour). Never dual-route Ext Agent / EnvoyAI
    // owner-assistant turns.
    if (!isBridgeAgent &&
        !isBuiltinAi &&
        !isAiBot &&
        isAgent &&
        recipientOwnerId != null &&
        recipientOwnerId.isNotEmpty &&
        recipientOwnerId != selfOwnerId) {
      final contactThreadId = '${nodeState.activeNode!.id}:$recipientOwnerId';
      final contactMsg = ChatMessage(
        id: '${messageId ?? 'msg_${DateTime.now().microsecondsSinceEpoch}'}_contact',
        threadId: contactThreadId,
        senderOwnerId: senderOwnerId,
        senderDisplayName: 'You',
        text: text,
        createdAt: createdAt,
        isOutbound: true,
      );
      final contactNotifier = _ref.read(contactProvider.notifier);
      final contactName = contactNotifier.getContact(recipientOwnerId)?.displayName ??
          recipientOwnerId;
      _upsertThread(
        threadId: contactThreadId,
        nodeId: nodeState.activeNode!.id,
        type: ChatThreadType.direct,
        displayName: contactName,
        contactOwnerId: recipientOwnerId,
        lastMessageText: text ?? '',
        lastMessageAt: createdAt != null
            ? DateTime.tryParse(createdAt)
            : DateTime.now(),
        unreadIncrement: true,
      );
      final contactExisting = state.messages[contactThreadId] ?? [];
      state = state.copyWith(
        messages: {
          ...state.messages,
          contactThreadId: reconcileChatMessages(
            existing: contactExisting,
            incoming: contactMsg,
            showAsMine: true,
            collapseMatchingOutbound: false,
          ),
        },
      );
    }
  }

  // -- Room operations --

  /// Sync chat rooms from the home node.
  Future<void> syncRooms({NodeServiceClient? client}) async {
    final nodeService = client ?? _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    try {
      final rooms = await nodeService.listChatRooms();
      final nodeId = nodeState.activeNode!.id;
      await _localDb.upsertRooms(
        nodeId,
        rooms
            .map(
              (r) => ChatRoom(
                id: r.id,
                nodeId: nodeId,
                name: r.name,
                memberCount: r.memberCount,
                lastMessageText: r.lastMessageText,
                lastMessageAt: r.lastMessageAt,
              ).toJson(),
            )
            .toList(),
      );

      // Create threads for rooms.
      for (final room in rooms) {
        final threadId = '$nodeId:room:${room.id}';
        _upsertThread(
          threadId: threadId,
          nodeId: nodeId,
          type: ChatThreadType.group,
          displayName: room.name.isNotEmpty
              ? room.name
              : ThreadTitleSentinels.group,
          chatRoomId: room.id,
          lastMessageText: room.lastMessageText,
          lastMessageAt: room.lastMessageAt,
        );
      }
    } catch (e) {
      // Log the error so we can diagnose sync issues.
      debugPrint('syncRooms failed: $e');
    }
  }

  /// Send a message to a group chat room.
  Future<void> sendRoomMessage(String roomId, String text) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    final trimmed = text.trim();
    if (trimmed.isEmpty) return;

    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    final now = DateTime.now().toUtc().toIso8601String();
    final tempId = 'temp_${DateTime.now().microsecondsSinceEpoch}';
    final tempMsg = ChatMessage(
      id: tempId,
      threadId: threadId,
      text: trimmed,
      createdAt: now,
      isOutbound: true,
      delivery: const GroupDeliveryMetadata(deliveryReceipt: 'pending'),
    );

    _persistMessage(tempMsg);
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          tempMsg,
          ...?state.messages[threadId],
        ],
      },
    );

    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.group,
      displayName: 'Room',
      chatRoomId: roomId,
      lastMessageText: trimmed,
      lastMessageAt: DateTime.now(),
    );

    try {
      final result = await nodeService.sendChatRoomMessage(roomId, trimmed);
      final serverId = result['messageId']?.toString();
      if (serverId == null || serverId.isEmpty) return;
      final delivery = deliveryFromRpcMap(result);
      final list = state.messages[threadId] ?? [];
      final idx = list.indexWhere((m) => m.id == tempId);
      if (idx < 0) return;
      final promoted = _copyMessage(list[idx], id: serverId, delivery: delivery);
      final next = [...list];
      next[idx] = promoted;
      state = state.copyWith(
        messages: {...state.messages, threadId: next},
      );
      unawaited(_localDb.replaceMessage(tempId, promoted.toJson()));
    } catch (_) {
      final list = state.messages[threadId] ?? [];
      final idx = list.indexWhere((m) => m.id == tempId);
      if (idx < 0) return;
      final failed = _copyMessage(
        list[idx],
        delivery: const GroupDeliveryMetadata(deliveryReceipt: 'failed'),
      );
      final next = [...list];
      next[idx] = failed;
      state = state.copyWith(
        messages: {...state.messages, threadId: next},
      );
      _persistMessage(failed);
    }
  }

  /// Handle a chat:room-message push event.
  void onRoomMessage(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    // Two formats for chat:room-message:
    //   Wrapped: { roomId, message: { sender, content, ... } }
    //   Direct:  ChatMessage { sender, content, recipient, ... }
    final message = data['message'] as Map<String, dynamic>?;
    final inner = message ?? data; // Unwrap if wrapped.

    final sender = inner['sender'] as Map<String, dynamic>?;
    final content = inner['content'] as Map<String, dynamic>?;
    final metadata = inner['metadata'] as Map<String, dynamic>?;
    final recipient = inner['recipient'] as Map<String, dynamic>?;

    var roomId = (data['roomId'] ?? recipient?['ownerId']) as String?;
    if (roomId != null && roomId.startsWith('room:')) {
      roomId = roomId.substring('room:'.length);
    }
    final senderOwnerId = ((inner['senderOwnerId'] ?? sender?['ownerId']) as String?)?.trim();
    final text = (inner['text'] ?? content?['text']) as String?;
    final messageId = inner['messageId'] as String?;
    final createdAt = (inner['createdAt'] ?? metadata?['timestamp']) as String?;
    final roomName = (data['roomName'] ?? data['title'] ?? recipient?['displayName']) as String?;
    final senderDisplayName = (inner['senderDisplayName'] ?? sender?['displayName']) as String?;
    final kind = (data['kind'] as String?)?.trim();

    if (roomId == null || roomId.isEmpty) return;

    final attachmentsRaw = inner['attachments'] as List<dynamic>? ??
        content?['attachments'] as List<dynamic>?;
    final hasAudio = attachmentsRaw?.any((a) {
      final mime = (a is Map) ? (a['mimeType'] ?? a['mime_type']) as String? : null;
      return mime != null && mime.startsWith('audio/');
    }) ?? false;
    final hasFile = attachmentsRaw?.isNotEmpty == true;

    // Skip messages with no displayable body.
    if ((text == null || text.isEmpty) && !hasAudio && !hasFile) return;

    final displayText = (text != null && text.isNotEmpty)
        ? text
        : (hasAudio ? MessageBodySentinels.sentVoice : MessageBodySentinels.sentFile);

    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    final existingThread = state.threads.where((t) => t.id == threadId).firstOrNull;
    final isFamilyRoom = kind == 'family' ||
        existingThread?.type == ChatThreadType.familyGroup;
    final myProfileId = nodeState.effectiveFamilyProfileId;
    final showAsMine = isFamilyRoom
        ? (senderOwnerId != null && senderOwnerId == myProfileId)
        : messageIsOutgoing(
            senderOwnerId: senderOwnerId,
            recipientOwnerId: recipient?['ownerId'] as String?,
            selfOwnerId: nodeState.ownerId,
            selfFamilyProfileId: myProfileId,
          );
    final msg = ChatMessage(
      id: messageId ?? 'msg_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      senderOwnerId: senderOwnerId,
      senderDisplayName: showAsMine ? 'You' : senderDisplayName,
      text: displayText,
      createdAt: createdAt,
      isOutbound: showAsMine,
      delivery: parseDeliveryMetadata(metadata),
    );

    // Dedup room messages by messageId; reconcile optimistic temp_* echoes.
    final existing = state.messages[threadId] ?? [];
    if (messageId != null && existing.any((m) => m.id == messageId)) return;

    final next = reconcileChatMessages(
      existing: existing,
      incoming: msg,
      showAsMine: showAsMine,
      collapseMatchingOutbound: false,
    );
    final nextIds = next.map((m) => m.id).toSet();
    for (final old in existing) {
      if (old.id.startsWith('temp_') && !nextIds.contains(old.id)) {
        unawaited(_localDb.deleteMessage(old.id));
      }
    }
    unawaited(_localDb.insertMessage(msg.toJson()));

    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: isFamilyRoom ? ChatThreadType.familyGroup : ChatThreadType.group,
      displayName: roomName ??
          (isFamilyRoom
              ? ThreadTitleSentinels.familyGroup
              : ThreadTitleSentinels.group),
      chatRoomId: roomId,
      lastMessageText: text ?? '',
      lastMessageAt: createdAt != null
          ? DateTime.tryParse(createdAt)
          : DateTime.now(),
      unreadIncrement: true,
    );

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: next,
      },
    );
  }

  /// Handle delivery acks for outbound 1:1 and group messages.
  void onChatDelivered(Map<String, dynamic> data) {
    final messageId = data['messageId'] as String?;
    final recipientOwnerId = data['recipientOwnerId'] as String?;
    if (messageId == null || messageId.isEmpty) return;

    var changed = false;
    final nextMessages = <String, List<ChatMessage>>{};
    for (final entry in state.messages.entries) {
      final list = entry.value;
      final idx = list.indexWhere((m) => m.id == messageId);
      if (idx < 0) {
        nextMessages[entry.key] = list;
        continue;
      }
      final msg = list[idx];
      if (!msg.isOutbound) {
        nextMessages[entry.key] = list;
        continue;
      }
      final prior = msg.delivery ?? const GroupDeliveryMetadata();
      final merged = recipientOwnerId != null && recipientOwnerId.isNotEmpty
          ? prior.mergeAck(recipientOwnerId)
          : const GroupDeliveryMetadata(deliveryReceipt: 'delivered');
      final updated = _copyMessage(msg, delivery: merged);
      final updatedList = [...list];
      updatedList[idx] = updated;
      nextMessages[entry.key] = updatedList;
      changed = true;
      _persistMessage(updated);
    }
    if (changed) {
      state = state.copyWith(messages: nextMessages);
    }
  }

  /// Mark an outbound message as failed for one recipient (mesh group give-up).
  void onChatDeliveryFailed(Map<String, dynamic> data) {
    final messageId = data['messageId'] as String?;
    if (messageId == null || messageId.isEmpty) return;

    var changed = false;
    final nextMessages = <String, List<ChatMessage>>{};
    for (final entry in state.messages.entries) {
      final list = entry.value;
      final idx = list.indexWhere((m) => m.id == messageId);
      if (idx < 0) {
        nextMessages[entry.key] = list;
        continue;
      }
      final msg = list[idx];
      if (!msg.isOutbound) {
        nextMessages[entry.key] = list;
        continue;
      }
      final failed = _copyMessage(
        msg,
        delivery: (msg.delivery ?? const GroupDeliveryMetadata()).markFailed(),
      );
      final updatedList = [...list];
      updatedList[idx] = failed;
      nextMessages[entry.key] = updatedList;
      changed = true;
      _persistMessage(failed);
    }
    if (changed) {
      state = state.copyWith(messages: nextMessages);
    }
  }

  /// Handle a chat:room-updated push (invite / rename / membership).
  void onRoomUpdated(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;
    final room = ChatRoom.fromJson({
      ...data,
      'nodeId': nodeState.activeNode!.id,
    });
    if (room.id.isEmpty) return;
    final threadId = '${nodeState.activeNode!.id}:room:${room.id}';
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: room.isFamily ? ChatThreadType.familyGroup : ChatThreadType.group,
      displayName: room.name.isNotEmpty
          ? room.name
          : (room.isFamily
              ? ThreadTitleSentinels.familyGroup
              : ThreadTitleSentinels.group),
      chatRoomId: room.id,
      lastMessageText: room.lastMessageText,
      lastMessageAt: room.lastMessageAt,
    );
    _localDb.upsertRooms(nodeState.activeNode!.id, [room.toJson()]).catchError((_) {});
  }

  /// Handle a chat:room-removed push (leave / dismiss).
  void onRoomRemoved(String roomId) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null || roomId.isEmpty) return;
    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    final threads = state.threads.where((t) => t.id != threadId).toList();
    final messages = Map<String, List<ChatMessage>>.from(state.messages)
      ..remove(threadId);
    state = state.copyWith(threads: threads, messages: messages);
    _localDb.deleteThread(threadId).catchError((_) {});
  }

  /// Create a new chat room.
  Future<void> createRoom(String name) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;
    await nodeService.createChatRoom(name);
    await syncRooms();
  }

  /// Phase 51D — create a local family group (profile members only).
  Future<void> createFamilyRoom({
    required String title,
    required List<String> memberProfileIds,
  }) async {
    final nodeService = _liveNodeService();
    if (nodeService == null) throw StateError('Not connected to home node');
    final result = await nodeService.createFamilyRoom(
      title: title,
      memberProfileIds: memberProfileIds,
    );
    final roomRaw = result['room'];
    if (roomRaw is Map) {
      onRoomUpdated(Map<String, dynamic>.from(roomRaw));
    } else {
      await syncFamilyRooms();
    }
  }

  Future<void> syncFamilyRooms({NodeServiceClient? client}) async {
    final nodeService = client ?? _liveNodeService();
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;
    try {
      final result = await nodeService.listFamilyRooms();
      final roomsRaw = result['rooms'];
      if (roomsRaw is! List) return;
      final nodeId = nodeState.activeNode!.id;
      final seen = <String>{};
      for (final raw in roomsRaw) {
        if (raw is! Map) continue;
        final room = ChatRoom.fromJson({
          ...Map<String, dynamic>.from(raw),
          'nodeId': nodeId,
          'kind': 'family',
        });
        if (room.id.isEmpty) continue;
        seen.add(room.id);
        final threadId = '$nodeId:room:${room.id}';
        _upsertThread(
          threadId: threadId,
          nodeId: nodeId,
          type: ChatThreadType.familyGroup,
          displayName: room.name.isNotEmpty
              ? room.name
              : ThreadTitleSentinels.familyGroup,
          chatRoomId: room.id,
        );
      }
      final stale = state.threads.where((t) {
        if (t.nodeId != nodeId || t.type != ChatThreadType.familyGroup) {
          return false;
        }
        final parts = t.id.split(':room:');
        if (parts.length < 2) return true;
        return !seen.contains(parts[1].trim());
      }).toList();
      for (final t in stale) {
        unawaited(deleteThread(t.id));
      }
    } catch (e) {
      debugPrint('syncFamilyRooms failed: $e');
    }
  }

  Future<void> sendFamilyRoomMessage(String roomId, String text) async {
    final nodeService = _liveNodeService();
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) {
      throw StateError('Not connected to home node');
    }
    final trimmed = text.trim();
    if (trimmed.isEmpty) return;
    final threadId = '${nodeState.activeNode!.id}:room:$roomId';
    final now = DateTime.now().toUtc().toIso8601String();
    final myProfileId = nodeState.effectiveFamilyProfileId;
    final tempMsg = ChatMessage(
      id: 'temp_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      text: trimmed,
      createdAt: now,
      isOutbound: true,
      senderDisplayName: 'You',
      senderOwnerId: myProfileId,
      delivery: const GroupDeliveryMetadata(deliveryReceipt: 'delivered'),
    );
    _localDb.insertMessage(tempMsg.toJson());
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [tempMsg, ...?state.messages[threadId]],
      },
    );

    final existingThread =
        state.threads.where((t) => t.id == threadId).firstOrNull;
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.familyGroup,
      displayName: existingThread?.displayName ?? ThreadTitleSentinels.familyGroup,
      chatRoomId: roomId,
      lastMessageText: trimmed,
      lastMessageAt: DateTime.now(),
    );

    await nodeService.sendFamilyRoomMessage(roomId: roomId, text: trimmed);
  }

  /// Invite a contact to a room.
  Future<void> inviteToRoom(String roomId, String ownerId) async {
    final nodeService = _ref.read(nodeServiceProvider);
    if (nodeService == null) return;
    await nodeService.inviteToChatRoom(roomId, ownerId);
  }

  // -- AI Chat --

  /// Send a message to an AI agent.
  /// [agentType] is "envoyai" for the built-in OpenClaw assistant,
  /// or "external" for the bridge HTTP agent.
  ///
  /// [text] is what goes to the home agent (may include attachment context).
  /// [displayText] / [displayAttachments] control the local bubble when the
  /// outbound prompt was expanded with attachment context.
  Future<void> sendAgentMessage(
    String text, {
    String agentType = 'envoyai',
    String? displayText,
    List<ChatAttachment>? displayAttachments,
  }) async {
    final nodeService = _liveNodeService();
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) {
      throw StateError('Not connected to home node');
    }

    final trimmed = text.trim();
    if (trimmed.isEmpty) return;

    // Match Social: refuse AI-bot sends when home model providers are disabled
    // (check before optimistic local insert so we don't leave a stuck bubble).
    if (agentType.startsWith('bot:')) {
      try {
        final cfg = await nodeService.getNodeConfig();
        final mp = cfg['modelProviders'];
        final mode = mp is Map ? mp['mode']?.toString() : null;
        if (mode == 'disabled') {
          throw StateError(
            'AI model is disabled. Enable a model provider in Settings → AI.',
          );
        }
      } on StateError {
        rethrow;
      } catch (_) {
        // Config read failed — still attempt send; home will error if needed.
      }
    }

    final threadId = '${nodeState.activeNode!.id}:$agentType';
    final now = DateTime.now().toUtc().toIso8601String();
    final bubbleBody = (displayText ?? trimmed).trim();
    final atts = displayAttachments;
    final bubbleText = bubbleBody.isNotEmpty
        ? bubbleBody
        : (atts != null && atts.isNotEmpty
            ? '(${atts.length} attachment${atts.length == 1 ? '' : 's'})'
            : trimmed);
    final tempMsg = ChatMessage(
      id: 'temp_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      text: bubbleText,
      createdAt: now,
      isOutbound: true,
      senderDisplayName: 'You',
      senderOwnerId: nodeState.effectiveFamilyProfileId != 'owner'
          ? nodeState.effectiveFamilyProfileId
          : (nodeState.familyProfileId ?? nodeState.ownerId),
      attachments: atts,
    );

    // Persist to local DB immediately so the message survives app restarts
    // and re-entry to the chat screen (which loads from DB, not memory).
    _localDb.insertMessage(tempMsg.toJson());

    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [
          tempMsg,
          ...?state.messages[threadId],
        ],
      },
    );

    final isEnvoyAi = agentType == 'envoyai';
    final isBot = agentType.startsWith('bot:');
    final priorThread = state.threads.where((t) => t.id == threadId).firstOrNull;
    final priorLastText = priorThread?.lastMessageText;
    final priorLastAt = priorThread?.lastMessageAt;
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: isEnvoyAi
          ? ChatThreadType.envoyai
          : isBot
              ? ChatThreadType.aiBot
              : ChatThreadType.externalAgent,
      displayName: isEnvoyAi
          ? 'EnvoyAI'
          : isBot
              ? state.threads
                  .where((t) => t.id == threadId)
                  .firstOrNull
                  ?.displayName ??
                  agentType
              : ThreadTitleSentinels.extAgent,
      agentType: agentType,
      lastMessageText: bubbleText,
      lastMessageAt: DateTime.now(),
    );

    // Branch: built-in EnvoyAI uses sendToOpenClaw; external bridge uses
    // sendToBridge; AI bots use sendToAiBot.
    try {
      if (agentType == 'external') {
        await nodeService.sendToBridge(trimmed);
      } else if (agentType.startsWith('bot:')) {
        final botId = agentType.substring(4); // strip "bot:" prefix
        await nodeService.sendToAiBot(botId, trimmed);
      } else {
        await nodeService.sendToOpenClaw(trimmed);
      }
    } catch (e) {
      unawaited(_localDb.deleteMessage(tempMsg.id));
      final remaining = [
        for (final m in state.messages[threadId] ?? const <ChatMessage>[])
          if (m.id != tempMsg.id) m,
      ];
      state = state.copyWith(
        messages: {
          ...state.messages,
          threadId: remaining,
        },
      );
      // Restore chat-list preview to whatever was there before this failed send.
      final rollbackText = remaining.isNotEmpty
          ? (remaining.first.text ?? priorLastText)
          : priorLastText;
      final rollbackAt = remaining.isNotEmpty
          ? (DateTime.tryParse(remaining.first.createdAt ?? '') ?? priorLastAt)
          : priorLastAt;
      _upsertThread(
        threadId: threadId,
        nodeId: nodeState.activeNode!.id,
        type: isEnvoyAi
            ? ChatThreadType.envoyai
            : isBot
                ? ChatThreadType.aiBot
                : ChatThreadType.externalAgent,
        displayName: isEnvoyAi
            ? 'EnvoyAI'
            : isBot
                ? priorThread?.displayName ?? agentType
                : ThreadTitleSentinels.extAgent,
        agentType: agentType,
        lastMessageText: rollbackText,
        lastMessageAt: rollbackAt,
      );
      rethrow;
    }
  }

  /// Create an AI character bot on the home node and sync the local thread list.
  ///
  /// Same fields as Social Create Bot. Returns the new local thread id
  /// (`nodeId:bot:<id>`).
  Future<String> createAiBot({
    required String name,
    required String systemPrompt,
    String? description,
    String avatarColor = '#6366f1',
  }) async {
    final nodeService = _liveNodeService();
    final node = _ref.read(nodeProvider).activeNode;
    if (nodeService == null || node == null) {
      throw StateError('Not connected to home node');
    }

    final trimmedName = name.trim();
    final trimmedPrompt = systemPrompt.trim();
    if (trimmedName.isEmpty || trimmedPrompt.isEmpty) {
      throw ArgumentError('Name and system prompt are required');
    }

    final cfg = await nodeService.getNodeConfig();
    final existingRaw = cfg['aiBots'];
    final existing = <Map<String, dynamic>>[];
    if (existingRaw is List) {
      for (final raw in existingRaw) {
        if (raw is Map) {
          existing.add(Map<String, dynamic>.from(raw));
        }
      }
    }

    final nameKey = trimmedName.toLowerCase();
    if (existing.any(
        (b) => (b['name']?.toString().trim().toLowerCase() ?? '') == nameKey)) {
      throw ArgumentError('A bot named "$trimmedName" already exists');
    }

    var slug = trimmedName
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
        .replaceAll(RegExp(r'^-|-$'), '');
    if (slug.isEmpty) {
      slug = 'bot-${DateTime.now().millisecondsSinceEpoch}';
    }
    var uniqueId = slug;
    var counter = 1;
    while (existing.any((b) => b['id']?.toString() == uniqueId)) {
      uniqueId = '$slug-${counter++}';
    }

    final desc = description?.trim();
    final newBot = <String, dynamic>{
      'id': uniqueId,
      'name': trimmedName,
      'systemPrompt': trimmedPrompt,
      if (desc != null && desc.isNotEmpty) 'description': desc,
      'avatarColor': avatarColor,
      'enabled': true,
    };
    final newBots = [...existing, newBot];
    await _persistAiBots(nodeService, newBots);
    syncAiBots(newBots, node.id);
    return '${node.id}:bot:$uniqueId';
  }

  /// Load one AI bot definition from home `aiBots` config (for edit form).
  Future<Map<String, dynamic>?> getAiBot(String botId) async {
    final nodeService = _liveNodeService();
    if (nodeService == null) return null;
    final trimmedId = botId.trim();
    if (trimmedId.isEmpty) return null;
    final cfg = await nodeService.getNodeConfig();
    final existingRaw = cfg['aiBots'];
    if (existingRaw is! List) return null;
    for (final raw in existingRaw) {
      if (raw is! Map) continue;
      final map = Map<String, dynamic>.from(raw);
      if (map['id']?.toString() == trimmedId) return map;
    }
    return null;
  }

  /// Update an existing AI character bot on the home node (keeps the same id).
  Future<void> updateAiBot({
    required String botId,
    required String name,
    required String systemPrompt,
    String? description,
    String avatarColor = '#6366f1',
  }) async {
    final nodeService = _liveNodeService();
    final node = _ref.read(nodeProvider).activeNode;
    if (nodeService == null || node == null) {
      throw StateError('Not connected to home node');
    }

    final trimmedId = botId.trim();
    final trimmedName = name.trim();
    final trimmedPrompt = systemPrompt.trim();
    if (trimmedId.isEmpty || trimmedName.isEmpty || trimmedPrompt.isEmpty) {
      throw ArgumentError('Bot id, name, and system prompt are required');
    }

    final cfg = await nodeService.getNodeConfig();
    final existingRaw = cfg['aiBots'];
    final existing = <Map<String, dynamic>>[];
    if (existingRaw is List) {
      for (final raw in existingRaw) {
        if (raw is Map) {
          existing.add(Map<String, dynamic>.from(raw));
        }
      }
    }

    final idx = existing.indexWhere((b) => b['id']?.toString() == trimmedId);
    if (idx < 0) {
      throw ArgumentError('Bot "$trimmedId" not found');
    }

    final nameKey = trimmedName.toLowerCase();
    if (existing.any((b) =>
        b['id']?.toString() != trimmedId &&
        (b['name']?.toString().trim().toLowerCase() ?? '') == nameKey)) {
      throw ArgumentError('A bot named "$trimmedName" already exists');
    }

    final prev = existing[idx];
    final desc = description?.trim();
    existing[idx] = <String, dynamic>{
      ...prev,
      'id': trimmedId,
      'name': trimmedName,
      'systemPrompt': trimmedPrompt,
      'avatarColor': avatarColor,
      'enabled': prev['enabled'] != false,
      if (desc != null && desc.isNotEmpty) 'description': desc,
    };
    if (desc == null || desc.isEmpty) {
      existing[idx].remove('description');
    }

    await _persistAiBots(nodeService, existing);
    syncAiBots(existing, node.id);
  }

  /// Persist bot list: owner → node-config; family → updateFamilyProfile.
  Future<void> _persistAiBots(
    NodeServiceClient nodeService,
    List<Map<String, dynamic>> bots,
  ) async {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.isOwnerProfile) {
      await nodeService.updateAiBots(bots);
      return;
    }
    final profileId = nodeState.effectiveFamilyProfileId;
    if (profileId.isEmpty || profileId == 'owner') {
      throw StateError('No family profile bound to this session');
    }
    await nodeService.updateFamilyProfile(id: profileId, aiBots: bots);
  }

  /// Sync AI bot definitions from config — creates/removes bot threads
  /// dynamically. Called on connect + on config-updated events.
  void syncAiBots(List<dynamic> bots, String nodeId) {
    // Keep only enabled bots in the list. Disabled bots are removed locally
    // (same as deleted) so they disappear from the AI section.
    final botIds = <String>{};
    for (final raw in bots) {
      if (raw is! Map) continue;
      if (raw['enabled'] == false) continue;
      final id = raw['id']?.toString();
      if (id != null && id.isNotEmpty) botIds.add(id);
    }

    final removeIds = state.threads
        .where((t) =>
            t.nodeId == nodeId &&
            t.type == ChatThreadType.aiBot &&
            !botIds.contains(t.botId))
        .map((t) => t.id)
        .toSet();
    if (removeIds.isNotEmpty) {
      final messages = Map<String, List<ChatMessage>>.from(state.messages);
      for (final id in removeIds) {
        messages.remove(id);
        unawaited(_localDb.deleteThread(id));
      }
      state = state.copyWith(
        threads: state.threads.where((t) => !removeIds.contains(t.id)).toList(),
        messages: messages,
      );
    }

    // Upsert threads for enabled bots in config.
    for (final raw in bots) {
      if (raw is! Map) continue;
      final bot = raw;
      final id = bot['id']?.toString();
      if (id == null || id.isEmpty) continue;
      if (bot['enabled'] == false) continue;
      onAiBotDefined(
        nodeId: nodeId,
        botId: id,
        name: bot['name']?.toString() ?? id,
        avatarColor: bot['avatarColor']?.toString(),
        description: bot['description']?.toString(),
      );
    }
  }

  /// Create or update an AI bot thread.
  void onAiBotDefined({
    required String nodeId,
    required String botId,
    required String name,
    String? avatarColor,
    String? description,
  }) {
    final threadId = '$nodeId:bot:$botId';
    _upsertThread(
      threadId: threadId,
      nodeId: nodeId,
      type: ChatThreadType.aiBot,
      displayName: name,
      agentType: 'bot:$botId',
      botId: botId,
      avatarColor: avatarColor,
      description: description,
    );
  }

  /// Resolve Ext Agent display name from bridge status (active preset name).
  /// Matches Social: show the current agent name, never Online/Offline suffixes.
  static String resolveExtAgentDisplayName(Map<String, dynamic> data) {
    final activeId = (data['activeExtAgentId'] as String?)?.trim();
    final extAgents = data['extAgents'];
    if (activeId != null && activeId.isNotEmpty && extAgents is List) {
      for (final raw in extAgents) {
        if (raw is! Map) continue;
        if (raw['id']?.toString() != activeId) continue;
        final n = (raw['name'] as String?)?.trim();
        if (n != null && n.isNotEmpty) return n;
        break;
      }
    }
    final rawName = (data['agentName'] as String?)?.trim() ?? '';
    if (rawName.isNotEmpty) return rawName;
    return ThreadTitleSentinels.extAgent;
  }

  /// Handle a bridge:status push event.
  ///
  /// Bridge status carries both built-in OpenClaw reachability (`agentType`
  /// may be `envoyai` when the assistant webhook is configured) and the
  /// active Ext Agent name (`agentName` / `activeExtAgentId`, often "Pi").
  /// Those must not be conflated — EnvoyAI keeps a fixed title; only the
  /// Ext Agent row reflects the selected external agent.
  ///
  /// Visibility rule:
  /// - **Denied family** (non-owner without `extAgentEnabled: true`) → hide.
  ///   Fail closed: unknown / unloaded profiles stay hidden. App Review
  ///   joins via family QR and must not see Ext Agent.
  /// - **Owner / opted-in family** → always show the row (even if the
  ///   bridge reports `enabled: false` / offline).
  void onBridgeStatus(Map<String, dynamic> data) {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;
    final nodeId = nodeState.activeNode!.id;

    _upsertThread(
      threadId: '$nodeId:envoyai',
      nodeId: nodeId,
      type: ChatThreadType.envoyai,
      displayName: 'EnvoyAI',
      agentType: 'envoyai',
    );

    final extThreadId = '$nodeId:external';
    final deniedFamily = _isDeniedExtAgentFamily(nodeState);
    if (deniedFamily) {
      final next = state.threads.where((t) => t.id != extThreadId).toList();
      if (next.length != state.threads.length) {
        state = state.copyWith(threads: next);
      }
      return;
    }

    final extName = resolveExtAgentDisplayName(data);
    _upsertThread(
      threadId: extThreadId,
      nodeId: nodeId,
      type: ChatThreadType.externalAgent,
      displayName: extName.isNotEmpty ? extName : ThreadTitleSentinels.extAgent,
      agentType: 'external',
    );
  }

  /// True when this session must not see Ext Agent chat.
  /// Non-owners require an explicit `extAgentEnabled: true` on their
  /// loaded profile; anything else (missing list, missing row, false,
  /// omitted) is denied.
  bool _isDeniedExtAgentFamily(NodeState nodeState) {
    if (nodeState.isOwnerProfile) return false;
    final pid = nodeState.familyProfileId?.trim();
    if (pid == null || pid.isEmpty || pid == 'owner') {
      // Non-owner session without a clear family id — fail closed.
      return true;
    }
    Map<String, dynamic>? mine;
    for (final p in nodeState.familyProfiles) {
      if (p['id']?.toString() == pid) {
        mine = p;
        break;
      }
    }
    if (mine == null) return true;
    return mine['extAgentEnabled'] != true;
  }

  /// Whether this session may see/use Coding assistants (Pi + EH).
  bool get mayUseCoding => _mayUseCoding(_ref.read(nodeProvider));

  bool _mayUseCoding(NodeState nodeState) {
    if (nodeState.activeNode == null) return false;
    if (nodeState.isOwnerProfile) return true;
    return !_isDeniedCodingFamily(nodeState);
  }

  bool _isDeniedCodingFamily(NodeState nodeState) {
    if (nodeState.isOwnerProfile) return false;
    final pid = nodeState.effectiveFamilyProfileId.trim();
    if (pid.isEmpty || pid == 'owner') return true;
    Map<String, dynamic>? mine;
    for (final p in nodeState.familyProfiles) {
      if (p['id']?.toString() == pid) {
        mine = p;
        break;
      }
    }
    if (mine == null) return true;
    return mine['codingEnabled'] != true;
  }

  /// Sync Envoy Harness coding-chat threads from the home node.
  Future<void> syncEhChats() async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;
    if (_isDeniedCodingFamily(nodeState)) {
      final nodeId = nodeState.activeNode!.id;
      final next = state.threads
          .where((t) =>
              t.nodeId != nodeId || t.type != ChatThreadType.envoyHarness)
          .toList();
      if (next.length != state.threads.length) {
        state = state.copyWith(threads: next);
      }
      return;
    }

    try {
      final list = await nodeService.listEnvoyHarnessChats();
      final nodeId = nodeState.activeNode!.id;
      final seen = <String>{};
      for (final raw in list) {
        final chatId = raw['id']?.toString().trim() ?? '';
        if (chatId.isEmpty) continue;
        seen.add(chatId);
        final title = raw['title']?.toString().trim() ?? chatId;
        final threadId = '$nodeId:eh:$chatId';
        _upsertThread(
          threadId: threadId,
          nodeId: nodeId,
          type: ChatThreadType.envoyHarness,
          displayName: title,
          agentType: 'envoy-harness',
          lastMessageText: raw['messageCount'] != null
              ? '${raw['messageCount']} messages'
              : null,
        );
      }
      final stale = state.threads.where((t) {
        if (t.nodeId != nodeId || t.type != ChatThreadType.envoyHarness) {
          return false;
        }
        final parts = t.id.split(':eh:');
        if (parts.length < 2) return true;
        final chatId = parts[1].trim();
        return !seen.contains(chatId);
      }).toList();
      for (final t in stale) {
        unawaited(deleteThread(t.id));
      }
    } catch (_) {
      // Home node may be on an older build without EH chat RPCs.
    }
  }

  Future<String> createEhChat({required String projectPath}) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) {
      throw StateError('Not connected to home node');
    }
    final path = projectPath.trim();
    if (path.isEmpty) {
      throw ArgumentError('Choose a project folder.');
    }
    final created = await nodeService.createEnvoyHarnessChat(cwd: path);
    final chatId = created['id']?.toString().trim() ?? '';
    if (chatId.isEmpty) {
      throw StateError('Failed to create coding chat');
    }
    await syncEhChats();
    return '${nodeState.activeNode!.id}:eh:$chatId';
  }

  /// Sync terminal sessions from the home node as threads.
  Future<void> syncTerminals() async {
    if (_syncTerminalsInFlight != null) {
      return _syncTerminalsInFlight!;
    }
    _syncTerminalsInFlight = _syncTerminalsImpl();
    try {
      await _syncTerminalsInFlight;
    } finally {
      _syncTerminalsInFlight = null;
    }
  }

  Future<void> _syncTerminalsImpl() async {
    final termNotifier = _ref.read(terminalProvider.notifier);
    await termNotifier.loadSessions();

    final termState = _ref.read(terminalProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;

    final nodeId = nodeState.activeNode!.id;
    final seen = <String>{};
    for (final session in termState.sessions) {
      final threadId = '$nodeId:term:${session.id}';
      seen.add(session.id);
      final String displayName;
      if (session.isEnvoyHarness) {
        displayName = session.name.startsWith('EH ')
            ? session.name
            : 'EH ${session.name}';
      } else if (session.isPi) {
        displayName = session.name.startsWith('π')
            ? session.name
            : 'π ${session.name}';
      } else {
        displayName = '${ThreadTitleSentinels.terminalPrefix}${session.name}';
      }
      _upsertThread(
        threadId: threadId,
        nodeId: nodeId,
        type: ChatThreadType.terminal,
        displayName: displayName,
        lastMessageText:
            '${session.runningProcess ?? (session.isEnvoyHarness ? 'envoy' : session.isPi ? 'pi' : 'shell')} — ${session.cwd ?? '~'}',
      );
    }
    final stale = state.threads.where((t) {
      if (t.nodeId != nodeId || t.type != ChatThreadType.terminal) {
        return false;
      }
      final parts = t.id.split(':term:');
      if (parts.length < 2) return true;
      return !seen.contains(parts[1].trim());
    }).toList();
    for (final t in stale) {
      unawaited(deleteThread(t.id));
    }
  }

  /// Create a new terminal session on the home node.
  Future<void> createTerminal(
      {required String name, String? cwd}) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) return;

    final result =
        await nodeService.createTerminalSession(command: name, cwd: cwd);
    final sessionId = result['sessionId'] as String?;
    if (sessionId == null) return;

    // Create a terminal thread.
    final threadId = '${nodeState.activeNode!.id}:term:$sessionId';
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.terminal,
      displayName: '${ThreadTitleSentinels.terminalPrefix}$name',
      lastMessageAt: DateTime.now(),
    );

    await syncTerminals();
  }

  /// Start a Pi coding TUI on the home node (same as Social “π Pi”).
  ///
  /// Returns `sessionId` on success, or throws with the home-node reason.
  Future<String> createPiTerminal({required String projectPath}) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) {
      throw StateError('Not connected to home node');
    }

    final path = projectPath.trim();
    if (path.isEmpty) {
      throw ArgumentError('Choose a project folder to open Pi.');
    }

    final result = await nodeService.ensurePiTerminalSession(
      projectPath: path,
    );
    if (result['ok'] != true) {
      throw StateError(
        (result['reason'] as String?)?.trim().isNotEmpty == true
            ? result['reason'] as String
            : 'Failed to start Pi',
      );
    }

    final session = result['session'];
    Map<String, dynamic>? sessionMap;
    if (session is Map<String, dynamic>) {
      sessionMap = session;
    } else if (session is Map) {
      sessionMap = session.cast<String, dynamic>();
    }
    final sessionId = sessionMap?['sessionId'] as String?;
    if (sessionId == null || sessionId.isEmpty) {
      throw StateError('Pi started but session id was missing');
    }

    final title = (sessionMap?['title'] as String?)?.trim();
    final displayName = (title != null && title.isNotEmpty)
        ? (title.startsWith('π') ? title : 'π $title')
        : 'π Pi';

    final threadId = '${nodeState.activeNode!.id}:term:$sessionId';
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.terminal,
      displayName: displayName,
      lastMessageText: path,
      lastMessageAt: DateTime.now(),
    );

    // Refresh full terminal list so role/cwd stay in sync.
    await syncTerminals();
    return sessionId;
  }

  /// Start an Envoy Harness TUI terminal on the home node (Social Terminal → Envoy).
  Future<String> createEnvoyTerminal({
    required String projectPath,
    String? sessionId,
    bool forceRestart = false,
  }) async {
    final nodeService = _ref.read(nodeServiceProvider);
    final nodeState = _ref.read(nodeProvider);
    if (nodeService == null || nodeState.activeNode == null) {
      throw StateError('Not connected to home node');
    }

    final path = projectPath.trim();
    if (path.isEmpty) {
      throw ArgumentError('Choose a project folder to open Envoy.');
    }

    final result = await nodeService.ensureEnvoyTerminalSession(
      projectPath: path,
      sessionId: sessionId,
      forceRestart: forceRestart,
    );
    if (result['ok'] != true) {
      throw StateError(
        (result['reason'] as String?)?.trim().isNotEmpty == true
            ? result['reason'] as String
            : 'Failed to start Envoy',
      );
    }

    final session = result['session'];
    Map<String, dynamic>? sessionMap;
    if (session is Map<String, dynamic>) {
      sessionMap = session;
    } else if (session is Map) {
      sessionMap = session.cast<String, dynamic>();
    }
    final newSessionId = sessionMap?['sessionId'] as String?;
    if (newSessionId == null || newSessionId.isEmpty) {
      throw StateError('Envoy started but session id was missing');
    }

    final title = (sessionMap?['title'] as String?)?.trim();
    final displayName = (title != null && title.isNotEmpty)
        ? (title.startsWith('EH') ? title : 'EH $title')
        : 'EH Envoy';

    final threadId = '${nodeState.activeNode!.id}:term:$newSessionId';
    _upsertThread(
      threadId: threadId,
      nodeId: nodeState.activeNode!.id,
      type: ChatThreadType.terminal,
      displayName: displayName,
      lastMessageText: path,
      lastMessageAt: DateTime.now(),
    );

    await syncTerminals();
    return newSessionId;
  }

  /// Append a local inbound bubble (not sent to the mesh) — e.g. MiniMax media results.
  void appendLocalInboundMessage({
    required String threadId,
    required String text,
    String senderDisplayName = 'MiniMax',
  }) {
    final now = DateTime.now().toUtc().toIso8601String();
    final msg = ChatMessage(
      id: 'local_mmx_${DateTime.now().microsecondsSinceEpoch}',
      threadId: threadId,
      text: text,
      createdAt: now,
      isOutbound: false,
      senderDisplayName: senderDisplayName,
    );
    unawaited(_localDb.insertMessage(msg.toJson()));
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: [msg, ...?state.messages[threadId]],
      },
    );
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode != null) {
      _upsertThread(
        threadId: threadId,
        nodeId: nodeState.activeNode!.id,
        type: state.threads.where((t) => t.id == threadId).firstOrNull?.type ??
            ChatThreadType.direct,
        displayName:
            state.threads.where((t) => t.id == threadId).firstOrNull?.displayName ??
                senderDisplayName,
        lastMessageText: text.length > 80 ? '${text.substring(0, 80)}…' : text,
        lastMessageAt: DateTime.tryParse(now),
      );
    }
  }

  /// Delete a single message from a thread.
  Future<void> deleteMessage(String threadId, ChatMessage msg) async {
    await _localDb.deleteMessage(msg.id);
    final existing = state.messages[threadId] ?? [];
    state = state.copyWith(
      messages: {
        ...state.messages,
        threadId: existing.where((m) => m.id != msg.id).toList(),
      },
    );
  }

  /// Clear all messages in a thread.
  Future<void> clearMessages(String threadId) async {
    await _localDb.deleteMessagesForThread(threadId);
    state = state.copyWith(
      messages: {...state.messages, threadId: []},
      threads: state.threads.map((t) {
        if (t.id == threadId) {
          return ChatThread.fromJson({
            ...t.toJson(),
            'last_message_text': null,
            'last_message_at': null,
          });
        }
        return t;
      }).toList(),
    );
  }

  /// Delete a thread and all its messages.
  ///
  /// For AI character bots, also removes the bot from home `aiBots` config
  /// so it does not reappear on the next `syncAiBots` / config-updated.
  Future<void> deleteThread(String threadId) async {
    final existing = state.threads.where((t) => t.id == threadId).firstOrNull;

    if (existing?.type == ChatThreadType.envoyHarness) {
      final parts = threadId.split(':eh:');
      if (parts.length > 1) {
        final chatId = parts[1].trim();
        final nodeService = _liveNodeService();
        if (nodeService != null && chatId.isNotEmpty) {
          try {
            await nodeService.removeEnvoyHarnessChat(chatId);
          } catch (e) {
            debugPrint('[chat] remove EH chat failed: $e');
            // Keep the local thread when the node refuses (e.g. turn busy)
            // so the next syncEhChats does not resurrect a ghost delete.
            rethrow;
          }
        }
      }
    }

    if (existing?.type == ChatThreadType.aiBot &&
        existing!.botId != null &&
        existing.botId!.isNotEmpty) {
      final nodeService = _liveNodeService();
      final node = _ref.read(nodeProvider).activeNode;
      if (nodeService != null && node != null) {
        try {
          final cfg = await nodeService.getNodeConfig();
          final existingRaw = cfg['aiBots'];
          final remaining = <Map<String, dynamic>>[];
          if (existingRaw is List) {
            for (final raw in existingRaw) {
              if (raw is! Map) continue;
              final map = Map<String, dynamic>.from(raw);
              if (map['id']?.toString() == existing.botId) continue;
              remaining.add(map);
            }
          }
          await _persistAiBots(nodeService, remaining);
          syncAiBots(remaining, node.id);
          return;
        } catch (e) {
          debugPrint('[chat] delete ai bot from config failed: $e');
          // Fall through to local-only delete.
        }
      }
    }

    // Remove from local DB.
    await _localDb.deleteThread(threadId);
    // Remove from in-memory state.
    final threads = state.threads.where((t) => t.id != threadId).toList();
    final messages = Map<String, List<ChatMessage>>.from(state.messages);
    messages.remove(threadId);
    state = state.copyWith(threads: threads, messages: messages);
  }

  /// Select a tab.
  void selectTab(int index) {
    state = state.copyWith(selectedTab: index);
  }

  /// Create chat threads for all bonded contacts that don't have one yet.
  /// Called after bonds sync so all contacts appear in the Chats tab.
  /// Self-bonds (the user's own ownerId, or any envoy_device_ key)
  /// are skipped — see [isSelfThreadPeer].
  void createContactThreads() {
    final nodeState = _ref.read(nodeProvider);
    if (nodeState.activeNode == null) return;
    final selfOwnerId = nodeState.ownerId;
    final contacts = _ref.read(contactProvider).bonds;
    final existingThreadIds = state.threads
        .where((t) => t.type == ChatThreadType.direct)
        .map((t) => t.contactOwnerId)
        .toSet();

    for (final contact in contacts) {
      // Defensive: the contact_provider bond filter already
      // excludes self, but if a stale contact list arrives
      // (e.g. from the local DB before the bond filter was
      // applied) this keeps the chat list clean.
      if (isSelfThreadPeer(contact.ownerId, selfOwnerId)) continue;
      if (existingThreadIds.contains(contact.ownerId)) continue;
      final threadId = '${nodeState.activeNode!.id}:${contact.ownerId}';
      _upsertThread(
        threadId: threadId,
        nodeId: nodeState.activeNode!.id,
        type: ChatThreadType.direct,
        displayName: contact.displayName ?? contact.ownerId,
        contactOwnerId: contact.ownerId,
      );
    }
  }

  /// Refresh thread display names from contact data.
  /// Called after bonds sync so threads with raw owner IDs get real names.
  void refreshThreadDisplayNames() {
    final contacts = _ref.read(contactProvider).bonds;
    if (contacts.isEmpty) return;
    final selfOwnerId = _ref.read(nodeProvider).ownerId;
    final contactMap = <String, String>{};
    for (final c in contacts) {
      if (c.displayName != null && c.displayName!.isNotEmpty) {
        contactMap[c.ownerId] = c.displayName!;
      }
    }
    if (contactMap.isEmpty) return;

    var changed = false;
    final updated = state.threads.map((t) {
      if (t.type == ChatThreadType.direct &&
          t.contactOwnerId != null &&
          contactMap.containsKey(t.contactOwnerId) &&
          t.displayName.startsWith('envoy:owner:')) {
        changed = true;
        return ChatThread.fromJson({
          ...t.toJson(),
          'display_name': contactMap[t.contactOwnerId]!,
        });
      }
      return t;
    })
        // Filter self-threads (the user themselves, in either
        // owner-id or device-key form) so the chat list never
        // shows a thread for the active user. Defensive: this is
        // also enforced in [loadThreads] and [onChatMessage], but
        // refreshing display names is another place a stale
        // self-thread could survive.
        .where((t) => !isSelfThreadPeer(t.contactOwnerId, selfOwnerId))
        .toList();

    if (changed) {
      state = state.copyWith(threads: updated);
    }
  }

  /// Resolve the display name for a thread, preventing overwrites
  /// on direct threads (where the name should be static).
  String _resolveThreadName(ChatThreadType type, String newName, String? existingName) {
    if (newName.isEmpty) return existingName ?? '';
    // Direct/group: keep a human display name once resolved (avoid raw owner IDs
    // bouncing back in). Ext Agent titles update when bridge status changes
    // (e.g. HomeClaw → Hermes) or to clear legacy " (Bridge Offline)".
    if (existingName != null && existingName.isNotEmpty) {
      if (type == ChatThreadType.direct || type == ChatThreadType.group) {
        if (!existingName.startsWith('envoy:owner:') &&
            existingName != ThreadTitleSentinels.group) {
          return existingName;
        }
      } else if (type == ChatThreadType.envoyai) {
        // Built-in assistant title is always EnvoyAI — never inherit Ext
        // Agent names (e.g. "Pi") from bridge:status payloads.
        return 'EnvoyAI';
      } else if (type == ChatThreadType.externalAgent ||
          type == ChatThreadType.aiBot) {
        return newName;
      } else {
        return existingName;
      }
    }
    return newName;
  }

  /// Create or update a thread in memory and local DB.
  void _upsertThread({
    required String threadId,
    required String nodeId,
    required ChatThreadType type,
    required String displayName,
    String? contactOwnerId,
    String? chatRoomId,
    String? agentType,
    String? botId,
    String? avatarColor,
    String? description,
    String? lastMessageText,
    DateTime? lastMessageAt,
    bool unreadIncrement = false,
  }) {
    // Choke-point filter: never create or update a thread for
    // the user themselves (the owner's own ownerId, or a
    // envoy_device_ key). This is the central place every
    // entry point funnels through, so the chat list can never
    // re-acquire a self-thread from any future code path.
    final selfOwnerId = _ref.read(nodeProvider).ownerId;
    if (isSelfThreadPeer(contactOwnerId, selfOwnerId)) return;
    final existing = state.threads
        .where((t) => t.id == threadId)
        .firstOrNull;

    final newThread = ChatThread(
      id: threadId,
      nodeId: nodeId,
      // For agent / family threads, preserve the existing type once set —
      // it is determined at creation time and must not be overwritten by a
      // misclassified incoming message.
      type: existing != null &&
             (existing.type == ChatThreadType.envoyai ||
              existing.type == ChatThreadType.externalAgent ||
              existing.type == ChatThreadType.aiBot ||
              existing.type == ChatThreadType.family ||
              existing.type == ChatThreadType.familyGroup)
          ? existing.type
          : type,
      displayName: _resolveThreadName(
          type, displayName, existing?.displayName),
      contactOwnerId: contactOwnerId ?? existing?.contactOwnerId,
      chatRoomId: chatRoomId ?? existing?.chatRoomId,
      agentType: agentType ?? existing?.agentType,
      botId: botId ?? existing?.botId,
      avatarColor: avatarColor ?? existing?.avatarColor,
      description: description ?? existing?.description,
      lastMessageText: lastMessageText ?? existing?.lastMessageText,
      lastMessageAt: lastMessageAt ?? existing?.lastMessageAt,
      unreadCount: (existing?.unreadCount ?? 0) +
          (unreadIncrement ? 1 : 0),
    );

    _localDb.upsertThread(newThread.toJson());

    final threads = [
      newThread,
      ...state.threads.where((t) => t.id != threadId),
    ];

    state = state.copyWith(threads: threads);
  }
}
