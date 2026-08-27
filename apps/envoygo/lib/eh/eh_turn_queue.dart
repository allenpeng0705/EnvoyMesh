import 'dart:async';

import 'package:flutter/foundation.dart';

/// Codex / Claude Code–style turn queue (mirrors Social `useEhTurnQueue`).
class EhQueuedInput {
  EhQueuedInput({required this.id, required this.text});
  final String id;
  String text;
}

enum EhSubmitMode { send, queue, inject }

typedef EhStartTurn = Future<String> Function(
  String text, {
  List<Map<String, String>>? attachments,
});
typedef EhCancelTurn = Future<void> Function();

class EhTurnQueue extends ChangeNotifier {
  EhTurnQueue({
    this.chatId,
    required this.startTurn,
    required this.cancelTurn,
    this.onUserTurn,
    this.onAssistantTurn,
    this.onAssistantStreaming,
    this.onSystem,
    this.onTurnStart,
    this.onTurnEnd,
  });

  final String? chatId;
  final EhStartTurn startTurn;
  final EhCancelTurn cancelTurn;
  final void Function(String text)? onUserTurn;
  final void Function(String text, String turnId)? onAssistantTurn;
  final void Function(String text, String turnId)? onAssistantStreaming;
  final void Function(String text, {bool error})? onSystem;
  final VoidCallback? onTurnStart;
  final VoidCallback? onTurnEnd;

  bool busy = false;
  final List<EhQueuedInput> queue = [];

  int _generation = 0;
  String? _activeTurnId;
  String? _injectAfterCancel;
  List<Map<String, String>>? _injectAfterCancelAttachments;
  Completer<Map<String, dynamic>>? _waiter;
  String? _waiterTurnId;

  bool eventMatchesChat(String? eventChatId) {
    if (eventChatId == null || chatId == null) return true;
    return chatId == eventChatId;
  }

  void handleTurnComplete(Map data) {
    if (!eventMatchesChat(data['chatId']?.toString())) return;
    final turnId = data['turnId']?.toString();
    if (_waiter != null && turnId != null && turnId == _waiterTurnId) {
      final waiter = _waiter!;
      _waiter = null;
      _waiterTurnId = null;
      if (data['ok'] == true) {
        waiter.complete(Map<String, dynamic>.from(data));
      } else if (data['cancelled'] == true) {
        waiter.completeError(StateError('envoy_harness_cancelled'));
      } else {
        waiter.completeError(
          StateError(data['error']?.toString() ?? 'envoy_harness_turn_failed'),
        );
      }
      return;
    }
    if (turnId != null && turnId == _activeTurnId) {
      _finishFromEvent(Map<String, dynamic>.from(data));
    }
  }

  void handleTurnToken(Map data) {
    if (!eventMatchesChat(data['chatId']?.toString())) return;
    final turnId = data['turnId']?.toString() ?? '';
    final text = data['streamingText']?.toString() ??
        data['text']?.toString() ??
        '';
    if (text.isEmpty) return;
    onAssistantStreaming?.call(text, '$turnId::assistant');
  }

  void handlePromptBusy(Map data) {
    if (!eventMatchesChat(data['chatId']?.toString())) return;
    if (data['busy'] != true && busy) {
      _failWaiter(StateError('envoy_harness_cancelled'));
      _activeTurnId = null;
      busy = false;
      onTurnEnd?.call();
      notifyListeners();
    }
  }

  void restoreBusyFromStatus(Map status) {
    if (status['busy'] != true) return;
    final statusChatId = status['chatId']?.toString();
    if (statusChatId != null && !eventMatchesChat(statusChatId)) return;
    final turnId = status['turnId']?.toString();
    if (turnId == null || turnId.isEmpty) return;
    _activeTurnId = turnId;
    busy = true;
    final stream = status['streamingText']?.toString() ?? '';
    if (stream.isNotEmpty) {
      onAssistantStreaming?.call(stream, '$turnId::assistant');
    }
    _waiterTurnId = turnId;
    _waiter = Completer<Map<String, dynamic>>();
    unawaited(
      _waiter!.future.then(_finishFromEvent).catchError((Object e) {
        final msg = e.toString();
        if (!msg.contains('cancel')) {
          onSystem?.call(msg, error: true);
        }
        busy = false;
        onTurnEnd?.call();
        notifyListeners();
      }),
    );
    notifyListeners();
  }

  void _finishFromEvent(Map<String, dynamic> event) {
    final turnId = event['turnId']?.toString() ?? '';
    if (event['ok'] == true) {
      final text = event['text']?.toString() ?? '';
      // Always notify — empty clears a thinking-only stream bubble.
      onAssistantTurn?.call(text.trim(), '$turnId::assistant');
    } else if (event['cancelled'] != true) {
      onAssistantTurn?.call('', '$turnId::assistant');
      final err = event['error']?.toString();
      if (err != null && err.isNotEmpty) {
        onSystem?.call(err, error: true);
      }
    }
    final gen = _generation;
    _activeTurnId = null;
    busy = false;
    onTurnEnd?.call();
    notifyListeners();
    _drainAfterTurn(gen);
  }

  void _failWaiter(Object error) {
    final w = _waiter;
    _waiter = null;
    _waiterTurnId = null;
    if (w != null && !w.isCompleted) {
      w.completeError(error);
    }
  }

  Future<void> submit(
    String text,
    EhSubmitMode mode, {
    List<Map<String, String>>? attachments,
  }) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty &&
        (attachments == null || attachments.isEmpty)) {
      return;
    }

    if (!busy || mode == EhSubmitMode.send) {
      final gen = ++_generation;
      await _runTurn(trimmed, gen, attachments: attachments);
      return;
    }

    if (mode == EhSubmitMode.queue) {
      enqueue(trimmed);
      return;
    }

    _injectAfterCancel = trimmed;
    _injectAfterCancelAttachments = attachments;
    _failWaiter(StateError('envoy_harness_cancelled'));
    try {
      await cancelTurn();
    } catch (_) {}
  }

  bool enqueue(String text) {
    final trimmed = text.trim();
    if (trimmed.isEmpty) return false;
    queue.add(
      EhQueuedInput(
        id: 'q_${DateTime.now().microsecondsSinceEpoch}',
        text: trimmed,
      ),
    );
    notifyListeners();
    return true;
  }

  void removeFromQueue(String id) {
    queue.removeWhere((e) => e.id == id);
    notifyListeners();
  }

  void updateQueued(String id, String text) {
    for (final item in queue) {
      if (item.id == id) {
        item.text = text;
        break;
      }
    }
    notifyListeners();
  }

  void clearQueue() {
    queue.clear();
    notifyListeners();
  }

  Future<void> cancelActiveTurn() async {
    _injectAfterCancel = null;
    _injectAfterCancelAttachments = null;
    _generation++;
    _failWaiter(StateError('envoy_harness_cancelled'));
    _activeTurnId = null;
    busy = false;
    onTurnEnd?.call();
    notifyListeners();
    try {
      await cancelTurn();
    } catch (_) {}
  }

  Future<void> _runTurn(
    String text,
    int generation, {
    List<Map<String, String>>? attachments,
  }) async {
    final trimmed = text.trim();
    if (trimmed.isEmpty &&
        (attachments == null || attachments.isEmpty)) {
      return;
    }

    busy = true;
    onTurnStart?.call();
    onUserTurn?.call(trimmed);
    notifyListeners();

    late final String turnId;
    try {
      turnId = await startTurn(trimmed, attachments: attachments);
      _activeTurnId = turnId;
    } catch (e) {
      if (generation != _generation) return;
      onSystem?.call(e.toString(), error: true);
      busy = false;
      onTurnEnd?.call();
      notifyListeners();
      _drainAfterTurn(generation);
      return;
    }

    if (generation != _generation) return;

    _waiterTurnId = turnId;
    _waiter = Completer<Map<String, dynamic>>();
    try {
      final result = await _waiter!.future;
      if (generation != _generation) return;
      if (result['ok'] == true) {
        final reply = result['text']?.toString() ?? '';
        // Always notify — empty string clears a thinking-only stream bubble.
        onAssistantTurn?.call(reply.trim(), '$turnId::assistant');
      } else if (result['cancelled'] != true) {
        onAssistantTurn?.call('', '$turnId::assistant');
        final err = result['error']?.toString();
        if (err != null && err.isNotEmpty) {
          onSystem?.call(err, error: true);
        }
      }
    } catch (e) {
      if (generation != _generation) return;
      final msg = e.toString();
      if (!msg.contains('cancel')) {
        onSystem?.call(msg, error: true);
      }
    } finally {
      if (generation == _generation) {
        _waiter = null;
        _waiterTurnId = null;
        _activeTurnId = null;
        busy = false;
        onTurnEnd?.call();
        notifyListeners();
        _drainAfterTurn(generation);
      }
    }
  }

  void _drainAfterTurn(int generation) {
    final inject = _injectAfterCancel;
    if (inject != null) {
      final injectAtt = _injectAfterCancelAttachments;
      _injectAfterCancel = null;
      _injectAfterCancelAttachments = null;
      final nextGen = ++_generation;
      unawaited(_runTurn(inject, nextGen, attachments: injectAtt));
      return;
    }

    final nextIndex = queue.indexWhere((e) => e.text.trim().isNotEmpty);
    if (nextIndex >= 0) {
      final next = queue.removeAt(nextIndex);
      notifyListeners();
      final nextGen = ++_generation;
      unawaited(_runTurn(next.text, nextGen));
    }
  }
}
