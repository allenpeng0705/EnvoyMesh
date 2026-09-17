import 'dart:async';

import 'stomp_constants.dart';
import 'stomp_exceptions.dart';
import 'stomp_frame.dart';

/// Represents a STOMP subscription
class StompSubscription {
  final String id;
  final String destination;
  final String ackMode;
  final Map<String, String> headers;
  final StreamController<StompMessage> _messageController;
  final StreamController<void> _unsubscribeController;

  bool _isActive = true;

  StompSubscription({
    required this.id,
    required this.destination,
    required this.ackMode,
    Map<String, String>? headers,
  }) : headers = headers ?? <String, String>{},
       _messageController = StreamController<StompMessage>.broadcast(),
       _unsubscribeController = StreamController<void>.broadcast();

  /// Stream of messages for this subscription
  Stream<StompMessage> get messages => _messageController.stream;

  /// Stream that emits when the subscription is unsubscribed
  Stream<void> get onUnsubscribe => _unsubscribeController.stream;

  /// Whether this subscription is active
  bool get isActive => _isActive;

  /// Delivers a message to this subscription
  void deliverMessage(StompMessage message) {
    if (!_isActive) {
      throw StompSubscriptionException('Cannot deliver message to inactive subscription', id);
    }
    _messageController.add(message);
  }

  /// Marks this subscription as unsubscribed
  void markUnsubscribed() {
    if (!_isActive) return;
    
    _isActive = false;
    _unsubscribeController.add(null);
    _messageController.close();
    _unsubscribeController.close();
  }

  @override
  String toString() {
    return 'StompSubscription(id: $id, destination: $destination, ackMode: $ackMode, active: $_isActive)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is StompSubscription && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;
}

/// Represents a STOMP message received from a subscription
class StompMessage {
  final String messageId;
  final String destination;
  final String subscriptionId;
  final Map<String, String> headers;
  final String? body;
  final String? ackId;

  StompMessage({
    required this.messageId,
    required this.destination,
    required this.subscriptionId,
    required this.headers,
    this.body,
    this.ackId,
  });

  /// Creates a StompMessage from a MESSAGE frame
  factory StompMessage.fromFrame(StompFrame frame) {
    if (frame.command != StompCommands.message) {
      throw StompFrameException('Cannot create StompMessage from non-MESSAGE frame: ${frame.command}');
    }

    final messageId = frame.getHeader(StompHeaders.messageId);
    final destination = frame.getHeader(StompHeaders.destination);
    final subscriptionId = frame.getHeader(StompHeaders.subscription);

    if (messageId == null) {
      throw const StompFrameException('MESSAGE frame missing message-id header');
    }
    if (destination == null) {
      throw const StompFrameException('MESSAGE frame missing destination header');
    }
    if (subscriptionId == null) {
      throw const StompFrameException('MESSAGE frame missing subscription header');
    }

    return StompMessage(
      messageId: messageId,
      destination: destination,
      subscriptionId: subscriptionId,
      headers: Map<String, String>.from(frame.headers),
      body: frame.getBodyAsString(),
      ackId: frame.getHeader(StompHeaders.ack),
    );
  }

  /// Gets a header value
  String? getHeader(String name) {
    return headers[name];
  }

  /// Gets the content type
  String? get contentType => getHeader(StompHeaders.contentType);

  /// Gets the content length
  int? get contentLength {
    final lengthStr = getHeader(StompHeaders.contentLength);
    if (lengthStr == null) return null;
    return int.tryParse(lengthStr);
  }

  /// Whether this message requires acknowledgment
  bool get requiresAck => ackId != null;

  @override
  String toString() {
    return 'StompMessage(messageId: $messageId, destination: $destination, subscriptionId: $subscriptionId, requiresAck: $requiresAck)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is StompMessage && other.messageId == messageId;
  }

  @override
  int get hashCode => messageId.hashCode;
}

/// Manager for STOMP subscriptions
class StompSubscriptionManager {
  final Map<String, StompSubscription> _subscriptions = {};
  final StreamController<StompSubscription> _subscriptionController = StreamController<StompSubscription>.broadcast();
  final StreamController<String> _unsubscribeController = StreamController<String>.broadcast();

  /// Stream of new subscriptions
  Stream<StompSubscription> get onSubscription => _subscriptionController.stream;

  /// Stream of unsubscribed subscription IDs
  Stream<String> get onUnsubscribe => _unsubscribeController.stream;

  /// Gets all active subscriptions
  List<StompSubscription> get subscriptions => _subscriptions.values.where((s) => s.isActive).toList();

  /// Gets a subscription by ID
  StompSubscription? getSubscription(String id) {
    return _subscriptions[id];
  }

  /// Adds a new subscription
  StompSubscription addSubscription({
    required String id,
    required String destination,
    String ackMode = StompHeaders.ackAuto,
    Map<String, String>? headers,
  }) {
    if (_subscriptions.containsKey(id)) {
      throw StompSubscriptionException('Subscription with ID already exists', id);
    }

    if (_subscriptions.length >= StompConstants.maxSubscriptions) {
      throw StompSubscriptionException('Maximum number of subscriptions reached', id);
    }

    final subscription = StompSubscription(
      id: id,
      destination: destination,
      ackMode: ackMode,
      headers: headers,
    );

    _subscriptions[id] = subscription;
    _subscriptionController.add(subscription);

    // Listen for unsubscribe
    subscription.onUnsubscribe.listen((_) {
      _unsubscribeController.add(id);
    });

    return subscription;
  }

  /// Removes a subscription
  bool removeSubscription(String id) {
    final subscription = _subscriptions.remove(id);
    if (subscription != null) {
      subscription.markUnsubscribed();
      return true;
    }
    return false;
  }

  /// Delivers a message to the appropriate subscription
  bool deliverMessage(StompMessage message) {
    final subscription = _subscriptions[message.subscriptionId];
    if (subscription == null || !subscription.isActive) {
      return false;
    }

    subscription.deliverMessage(message);
    return true;
  }

  /// Removes all subscriptions
  void clear() {
    final subscriptionIds = List<String>.from(_subscriptions.keys);
    for (final id in subscriptionIds) {
      removeSubscription(id);
    }
  }

  /// Closes the subscription manager
  void close() {
    clear();
    _subscriptionController.close();
    _unsubscribeController.close();
  }

  @override
  String toString() {
    return 'StompSubscriptionManager(subscriptions: ${_subscriptions.length})';
  }
}

/// Acknowledgment modes for STOMP subscriptions
enum StompAckMode {
  auto,
  client,
  clientIndividual;

  /// Converts to STOMP header value
  String toHeaderValue() {
    switch (this) {
      case StompAckMode.auto:
        return StompHeaders.ackAuto;
      case StompAckMode.client:
        return StompHeaders.ackClient;
      case StompAckMode.clientIndividual:
        return StompHeaders.ackClientIndividual;
    }
  }

  /// Creates from STOMP header value
  static StompAckMode fromHeaderValue(String value) {
    switch (value) {
      case StompHeaders.ackAuto:
        return StompAckMode.auto;
      case StompHeaders.ackClient:
        return StompAckMode.client;
      case StompHeaders.ackClientIndividual:
        return StompAckMode.clientIndividual;
      default:
        throw StompFrameException('Unknown ack mode: $value');
    }
  }
}

/// Pending acknowledgment for a message
class PendingAck {
  final String messageId;
  final String subscriptionId;
  final String? ackId;
  final DateTime timestamp;
  final StompAckMode ackMode;

  PendingAck({
    required this.messageId,
    required this.subscriptionId,
    required this.ackId,
    required this.ackMode,
  }) : timestamp = DateTime.now();

  @override
  String toString() {
    return 'PendingAck(messageId: $messageId, subscriptionId: $subscriptionId, ackMode: $ackMode)';
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is PendingAck && other.messageId == messageId;
  }

  @override
  int get hashCode => messageId.hashCode;
}

/// Manager for pending message acknowledgments
class StompAckManager {
  final Map<String, PendingAck> _pendingAcks = {};
  final Map<String, List<PendingAck>> _subscriptionAcks = {};

  /// Adds a pending acknowledgment
  void addPendingAck(PendingAck ack) {
    if (ack.ackId == null) return; // No ack required

    _pendingAcks[ack.ackId!] = ack;
    
    final subscriptionAcks = _subscriptionAcks.putIfAbsent(ack.subscriptionId, () => <PendingAck>[]);
    subscriptionAcks.add(ack);
  }

  /// Acknowledges a message
  List<PendingAck> acknowledge(String ackId) {
    final ack = _pendingAcks.remove(ackId);
    if (ack == null) {
      throw StompAckException('No pending acknowledgment found', ackId);
    }

    final acknowledged = <PendingAck>[ack];

    // For client mode, acknowledge all previous messages in the subscription
    if (ack.ackMode == StompAckMode.client) {
      final subscriptionAcks = _subscriptionAcks[ack.subscriptionId];
      if (subscriptionAcks != null) {
        final ackIndex = subscriptionAcks.indexOf(ack);
        if (ackIndex != -1) {
          // Acknowledge all messages up to and including this one
          for (int i = 0; i <= ackIndex; i++) {
            final pendingAck = subscriptionAcks[i];
            if (pendingAck.ackId != null) {
              _pendingAcks.remove(pendingAck.ackId!);
              if (pendingAck != ack) {
                acknowledged.add(pendingAck);
              }
            }
          }
          subscriptionAcks.removeRange(0, ackIndex + 1);
        }
      }
    } else {
      // For client-individual mode, only acknowledge this message
      final subscriptionAcks = _subscriptionAcks[ack.subscriptionId];
      subscriptionAcks?.remove(ack);
    }

    return acknowledged;
  }

  /// Negatively acknowledges a message
  List<PendingAck> nack(String ackId) {
    final ack = _pendingAcks.remove(ackId);
    if (ack == null) {
      throw StompAckException('No pending acknowledgment found', ackId);
    }

    final nacked = <PendingAck>[ack];

    // For client mode, nack all previous messages in the subscription
    if (ack.ackMode == StompAckMode.client) {
      final subscriptionAcks = _subscriptionAcks[ack.subscriptionId];
      if (subscriptionAcks != null) {
        final ackIndex = subscriptionAcks.indexOf(ack);
        if (ackIndex != -1) {
          // Nack all messages up to and including this one
          for (int i = 0; i <= ackIndex; i++) {
            final pendingAck = subscriptionAcks[i];
            if (pendingAck.ackId != null) {
              _pendingAcks.remove(pendingAck.ackId!);
              if (pendingAck != ack) {
                nacked.add(pendingAck);
              }
            }
          }
          subscriptionAcks.removeRange(0, ackIndex + 1);
        }
      }
    } else {
      // For client-individual mode, only nack this message
      final subscriptionAcks = _subscriptionAcks[ack.subscriptionId];
      subscriptionAcks?.remove(ack);
    }

    return nacked;
  }

  /// Gets pending acknowledgments for a subscription
  List<PendingAck> getPendingAcks(String subscriptionId) {
    return _subscriptionAcks[subscriptionId] ?? <PendingAck>[];
  }

  /// Removes all pending acknowledgments for a subscription
  void clearSubscription(String subscriptionId) {
    final subscriptionAcks = _subscriptionAcks.remove(subscriptionId);
    if (subscriptionAcks != null) {
      for (final ack in subscriptionAcks) {
        if (ack.ackId != null) {
          _pendingAcks.remove(ack.ackId!);
        }
      }
    }
  }

  /// Gets all pending acknowledgments
  List<PendingAck> get allPendingAcks => _pendingAcks.values.toList();

  /// Clears all pending acknowledgments
  void clear() {
    _pendingAcks.clear();
    _subscriptionAcks.clear();
  }

  @override
  String toString() {
    return 'StompAckManager(pendingAcks: ${_pendingAcks.length})';
  }
}
