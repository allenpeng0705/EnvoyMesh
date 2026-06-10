import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../providers/chat_provider.dart';
import '../../providers/contact_provider.dart';
import '../../widgets/chat_bubble.dart';

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

  bool get _isRoom => widget.chatRoomId != null;
  bool get _isAgent => widget.agentType != null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_initialized) {
        _initialized = true;
        final notifier = ref.read(chatProvider.notifier);
        // Load from local DB first (instant), then from home node.
        notifier.loadMessagesFromDb(widget.threadId);
        if (!_isAgent) {
          notifier.loadHistory(
            widget.threadId,
            contactOwnerId: widget.contactOwnerId,
          );
        }
        notifier.markRead(
          widget.threadId,
          contactOwnerId: widget.contactOwnerId,
        );
      }
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatProvider);
    final messages = chatState.messages[widget.threadId] ?? [];

    return Scaffold(
      appBar: AppBar(
        title: Text(widget.displayName),
        actions: _isRoom
            ? [
                IconButton(
                  icon: const Icon(Icons.person_add),
                  tooltip: 'Invite',
                  onPressed: () => _showInviteDialog(context),
                ),
              ]
            : null,
      ),
      body: Column(
        children: [
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
                      return ChatBubble(
                        message: msg,
                        isOutbound: msg.isOutbound,
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

  void _sendMessage() {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    if (_isAgent) {
      ref.read(chatProvider.notifier).sendAgentMessage(text);
    } else if (_isRoom) {
      ref.read(chatProvider.notifier).sendRoomMessage(
            widget.chatRoomId!,
            text,
          );
    } else if (widget.contactOwnerId != null) {
      ref.read(chatProvider.notifier).sendMessage(
            widget.contactOwnerId!,
            text,
          );
    }
    _textController.clear();
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
