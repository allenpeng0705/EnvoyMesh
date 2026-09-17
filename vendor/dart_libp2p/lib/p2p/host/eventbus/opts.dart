/// Options for the EventBus implementation.
///
/// This is a port of the Go implementation from go-libp2p/p2p/host/eventbus/opts.go
/// to Dart, using native Dart idioms.

import 'dart:async';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:stack_trace/stack_trace.dart';
import 'basic.dart';
import 'metrics.dart';

/// Settings for a subscription
class SubSettings {
  /// Buffer size for the subscription's stream
  int bufferSize = 16;

  /// Name of the subscription
  String name;

  /// Creates a new SubSettings with default values
  SubSettings() : name = _generateSubscriberName();

  /// Generates a name for a subscriber based on the call stack
  static String _generateSubscriberName() {
    try {
      // Get the current stack trace
      final frames = Trace.current().frames;

      // Skip the first few frames which are related to this method and the EventBus
      // Try to find a frame that's not from the eventbus package
      for (var i = 2; i < frames.length; i++) {
        final frame = frames[i];
        if (!frame.library.contains('eventbus')) {
          return '${frame.library}-L${frame.line}';
        }
      }

      // Fallback if we can't find a good frame
      return 'subscriber-${DateTime.now().millisecondsSinceEpoch}';
    } catch (e) {
      // Fallback if stack trace analysis fails
      return 'subscriber-${DateTime.now().millisecondsSinceEpoch}';
    }
  }
}

/// Settings for an emitter
class EmitterSettings {
  /// Whether the emitter should be stateful (remember the last event)
  bool makeStateful = false;
}

/// A function that configures a BasicBus
typedef BusOption = void Function(BasicBus bus);

/// Option to set the buffer size for a subscription
SubscriptionOpt bufSize(int size) {
  return (Object settings) {
    if (settings is SubSettings) {
      settings.bufferSize = size;
    }
    return settings;
  };
}

/// Option to set the name for a subscription
SubscriptionOpt name(String name) {
  return (Object settings) {
    if (settings is SubSettings) {
      settings.name = name;
    }
    return settings;
  };
}

/// Option to make an emitter stateful
EmitterOpt stateful() {
  return (Object settings) {
    if (settings is EmitterSettings) {
      settings.makeStateful = true;
    }
    return settings;
  };
}

/// Option to set the metrics tracer for a bus
BusOption withMetricsTracer(MetricsTracer metricsTracer) {
  return (BasicBus bus) {
    // Set the metrics tracer on the bus
    bus.setMetricsTracer(metricsTracer);
  };
}
