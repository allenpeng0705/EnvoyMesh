/// Metrics for the EventBus implementation.
///
/// This is a port of the Go implementation from go-libp2p/p2p/host/eventbus/basic_metrics.go
/// to Dart, using native Dart idioms.

/// MetricsTracer tracks metrics for the eventbus subsystem
abstract class MetricsTracer {
  /// Counts the total number of events grouped by event type
  void eventEmitted(String type);

  /// Adds a subscriber for the event type
  void addSubscriber(String type);

  /// Removes a subscriber for the event type
  void removeSubscriber(String type);

  /// Reports the length of the subscriber's queue
  void subscriberQueueLength(String name, int length);

  /// Reports whether a subscriber's queue is full
  void subscriberQueueFull(String name, bool isFull);

  /// Counts the total number of events grouped by subscriber
  void subscriberEventQueued(String name);
}

/// A simple implementation of MetricsTracer that logs metrics to the console
class SimpleMetricsTracer implements MetricsTracer {
  final Map<String, int> _eventsEmitted = {};
  final Map<String, int> _subscribers = {};
  final Map<String, int> _subscriberEvents = {};

  @override
  void eventEmitted(String type) {
    _eventsEmitted[type] = (_eventsEmitted[type] ?? 0) + 1;
  }

  @override
  void addSubscriber(String type) {
    _subscribers[type] = (_subscribers[type] ?? 0) + 1;
  }

  @override
  void removeSubscriber(String type) {
    final count = _subscribers[type] ?? 0;
    if (count > 0) {
      _subscribers[type] = count - 1;
    }
  }

  @override
  void subscriberQueueLength(String name, int length) {
    // Not implemented in this simple tracer
  }

  @override
  void subscriberQueueFull(String name, bool isFull) {
    // Not implemented in this simple tracer
  }

  @override
  void subscriberEventQueued(String name) {
    _subscriberEvents[name] = (_subscriberEvents[name] ?? 0) + 1;
  }

  /// Returns the number of events emitted for a given type
  int getEventsEmitted(Type type) {
    return _eventsEmitted[type.toString()] ?? 0;
  }

  /// Returns the number of subscribers for a given type
  int getSubscribers(Type type) {
    return _subscribers[type.toString()] ?? 0;
  }

  /// Returns the number of events queued for a given subscriber
  int getSubscriberEvents(String name) {
    return _subscriberEvents[name] ?? 0;
  }
}

/// A no-op implementation of MetricsTracer that does nothing
class NoopMetricsTracer implements MetricsTracer {
  @override
  void eventEmitted(String type) {}

  @override
  void addSubscriber(String type) {}

  @override
  void removeSubscriber(String type) {}

  @override
  void subscriberQueueLength(String name, int length) {}

  @override
  void subscriberQueueFull(String name, bool isFull) {}

  @override
  void subscriberEventQueued(String name) {}
}

/// Creates a new MetricsTracer
///
/// If [simple] is true, returns a SimpleMetricsTracer.
/// Otherwise, returns a NoopMetricsTracer.
MetricsTracer createMetricsTracer({bool simple = false}) {
  if (simple) {
    return SimpleMetricsTracer();
  } else {
    return NoopMetricsTracer();
  }
}
