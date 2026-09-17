/// Implementation of the EventBus interface.
///
/// This is a port of the Go implementation from go-libp2p/p2p/host/eventbus/basic.go
/// to Dart, using native Dart idioms like Stream Controllers instead of Go channels.

import 'dart:async';

import 'package:synchronized/synchronized.dart';

import '../../../core/event/bus.dart';
import 'opts.dart';
import 'metrics.dart';

/// BasicBus is a type-based event delivery system
class BasicBus implements EventBus {
  final Map<String, _Node> _nodes = {};
  final _WildcardNode _wildcard = _WildcardNode();
  MetricsTracer? _metricsTracer;

  /// Creates a new BasicBus with the given options
  BasicBus({List<BusOption>? options}) : _metricsTracer = null {
    if (options != null) {
      for (final opt in options) {
        opt(this);
      }
    }
  }

  /// Sets the metrics tracer for this bus
  void setMetricsTracer(MetricsTracer tracer) {
    _metricsTracer = tracer;
    _wildcard._metricsTracer = tracer;

    // Update existing nodes with the new tracer
    for (final node in _nodes.values) {
      node.metricsTracer = tracer;
    }
  }

  @override
  Subscription subscribe(dynamic eventType, {List<SubscriptionOpt>? opts}) {
    final settings = SubSettings();
    if (opts != null) {
      for (final opt in opts) {
        opt(settings);
      }
    }

    // Handle wildcard subscription
    if (identical(eventType, WildcardSubscription)) {
      final controller = StreamController<Object>.broadcast(sync: false);
      final sub = _WildcardSubscription(
        controller: controller,
        node: _wildcard,
        name: settings.name,
        metricsTracer: _metricsTracer,
      );
      _wildcard.addSink(_NamedSink(controller: controller, name: sub.name));
      return sub;
    }

    // Handle regular subscriptions
    List<String> types;
    if (eventType is List) {
      types = eventType.map((e) => e.toString()).toList();

      // Check for wildcard in multi-type subscription
      if (types.any((t) => identical(t, WildcardSubscription.toString()))) {
        throw Exception('Wildcard subscriptions must be started separately');
      }
    } else {
      types = [eventType.toString()];
    }

    final controller = StreamController<Object>.broadcast(sync: false);
    final List<_Node> nodeListForSubscription = [];
    final List<Future<void>> pendingInitializations = [];

    final sub = _Subscription(
      controller: controller,
      nodes: nodeListForSubscription,
      pendingOps: pendingInitializations,
      dropper: _tryDropNode,
      name: settings.name,
      metricsTracer: _metricsTracer,
    );

    for (final eventTypeString in types) {
      final future = _withNode(eventTypeString, (node) async {
        await node.addSink(_NamedSink(controller: controller, name: sub.name));
        nodeListForSubscription.add(node); // Add to the list passed to _Subscription
        node.keepLast = true; // Always keep the last event when there are subscribers
        _metricsTracer?.addSubscriber(eventTypeString);
        // Deliver the last event directly if available
        if (node.last != null) {
          Future.microtask(() {
            if (!controller.isClosed) {
              controller.add(node.last!);
            }
          });
        }
      }, null);
      pendingInitializations.add(future);
    }

    return sub;
  }

  @override
  Future<Emitter> emitter(dynamic eventType, {List<EmitterOpt>? opts}) async {
    final eventName = eventType.toString();
    if (identical(eventName, WildcardSubscription.toString())) {
      throw Exception('Illegal emitter for wildcard subscription');
    }

    final settings = EmitterSettings();
    if (opts != null) {
      for (final opt in opts) {
        opt(settings);
      }
    }

    late _Emitter emitter;

    await _withNode(eventName, (node) async {
      node.nEmitters++;
      if (settings.makeStateful) {
        node.keepLast = true;
      }
      emitter = _Emitter(
        node: node,
        type: eventName,
        dropper: _tryDropNode,
        wildcard: _wildcard,
        metricsTracer: _metricsTracer,
      );
    }, null);

    return emitter;
  }

  @override
  List<String> getAllEventTypes() {
    return List.unmodifiable(_nodes.keys);
  }

  Future<void> _withNode(String type, Future<void> Function(_Node) callback, Future<void> Function(_Node?)? asyncCallback) async {
    _Node? node = _nodes[type.toString()];
    if (node == null) {
      node = _Node(type: type, metricsTracer: _metricsTracer);
      _nodes[type.toString()] = node;
    }

    await node.lock.synchronized(() async {
      await callback(node!);
    });

    if (asyncCallback != null) {
      await asyncCallback(node);
    }
  }

  Future<void> _tryDropNode(String type) async {
    final node = _nodes[type.toString()];
    if (node == null) {
      return; 
    }

    bool shouldDrop = false;
    if (node.nEmitters == 0 && node.sinks.isEmpty) {
      shouldDrop = true;
    }

    if (shouldDrop) {
      _nodes.remove(type.toString());
    }
  }
}

class _Emitter implements Emitter {
  final _Node node;
  final String type;
  final Future<void> Function(String) dropper;
  final _WildcardNode wildcard;
  final MetricsTracer? metricsTracer;
  bool _closed = false;

  _Emitter({
    required this.node,
    required this.type,
    required this.dropper,
    required this.wildcard,
    this.metricsTracer,
  });

  @override
  Future<void> emit(Object event) async {
    if (_closed) {
      throw Exception('Emitter is closed');
    }

    if (event.runtimeType.toString() != type) {
      throw Exception('Emit called with wrong type. Expected: $type, got: ${event.toString()}');
    }

    await node.emit(event);
    await wildcard.emit(event);

    metricsTracer?.eventEmitted(type);
  }

  @override
  Future<void> close() async {
    if (_closed) {
      throw Exception('Closed an emitter more than once');
    }
    _closed = true;

    await node.lock.synchronized(() async {
      node.nEmitters--;
      if (node.nEmitters == 0) {
        await dropper(type);
      }
    });
  }
}

class _NamedSink {
  final StreamController<Object> controller;
  final String name;

  _NamedSink({required this.controller, required this.name});
}

class _WildcardSubscription implements Subscription {
  final StreamController<Object> _controller;
  @override
  Stream<Object> get stream => _controller.stream.asBroadcastStream();
  final _WildcardNode node;
  final String name;
  final MetricsTracer? metricsTracer;
  bool _closed = false;
  final Lock _closeLock = Lock();

  _WildcardSubscription({
    required StreamController<Object> controller,
    required this.node,
    required this.name,
    this.metricsTracer,
  }) : _controller = controller;

  @override
  Future<void> close() async {
    await _closeLock.synchronized(() async {
      if (_closed) return;
      _closed = true;

      if (!_controller.isClosed) {
        await _controller.close();
      }

      await node.lock.synchronized(() async {
        node.sinks.removeWhere((sink) => sink.name == name && sink.controller == _controller);
        metricsTracer?.removeSubscriber(WildcardSubscription.toString());
      });
    });
  }
}

class _Subscription implements Subscription {
  final StreamController<Object> _controller;
  @override
  Stream<Object> get stream => _controller.stream.asBroadcastStream();
  final List<_Node> nodes;
  final List<Future<void>> _pendingOps;
  final Future<void> Function(String) dropper;
  @override
  final String name;
  final MetricsTracer? metricsTracer;
  bool _closed = false;
  bool _initializationComplete = false;
  final Lock _closeLock = Lock();

  _Subscription({
    required StreamController<Object> controller,
    required this.nodes,
    required List<Future<void>> pendingOps,
    required this.dropper,
    required this.name,
    this.metricsTracer,
  })  : _controller = controller,
        _pendingOps = pendingOps;

  Future<void> _ensureInitialized() async {
    if (!_initializationComplete) {
      final List<Future<void>> opsToWait = List.from(_pendingOps);
      try {
        await Future.wait(opsToWait);
      } finally {
        _initializationComplete = true; 
      }
    }
  }

  @override
  Future<void> close() async {
    await _closeLock.synchronized(() async {
      if (_closed) return;

      await _ensureInitialized();
      _closed = true;

      if (!_controller.isClosed) {
        await _controller.close();
      }

      final List<_Node> nodesToProcess = List.from(nodes);

      for (final node in nodesToProcess) {
        await node.lock.synchronized(() async {
          node.sinks.removeWhere((sink) => sink.name == name && sink.controller == _controller);
          metricsTracer?.removeSubscriber(node.type);
          if (node.sinks.isEmpty && node.nEmitters == 0) {
            await dropper(node.type);
          }
        });
      }
      nodes.clear();
      _pendingOps.clear();
    });
  }
}

class _Node {
  final Lock lock = Lock();
  final String type;
  final List<_NamedSink> sinks = [];
  MetricsTracer? metricsTracer;

  int nEmitters = 0;
  bool keepLast = false;
  Object? last;

  _Node({required this.type, this.metricsTracer});

  Future<void> addSink(_NamedSink sink) async {
    sinks.add(sink);
  }

  Future<void> emit(Object event) async {
    await lock.synchronized(() async {
      if (keepLast) {
        last = event;
      }

      // Iterate over a copy of sinks to avoid concurrent modification if a sink.controller.add throws
      // and somehow leads to modification of the sinks list (though unlikely with current structure).
      final List<_NamedSink> sinksToNotify = List.from(sinks);
      for (final sink in sinksToNotify) {
        _sendSubscriberMetrics(metricsTracer, sink);
        try {
          if (!sink.controller.isClosed) {
            sink.controller.add(event);
          }
        } catch (e) {
          // Log slow consumer warning or other errors
        }
      }
    });
  }
}

class _WildcardNode {
  final Lock lock = Lock();
  final List<_NamedSink> sinks = [];
  MetricsTracer? _metricsTracer;

  _WildcardNode({MetricsTracer? metricsTracer}) : _metricsTracer = metricsTracer;

  Future<void> addSink(_NamedSink sink) async {
    await lock.synchronized(() async {
      sinks.add(sink);
      _metricsTracer?.addSubscriber(WildcardSubscription.toString());
    });
  }

  Future<void> removeSink(StreamSink<Object> controller) async { // This method seems unused, but kept for now.
    await lock.synchronized(() async {
      sinks.removeWhere((sink) => sink.controller.sink == controller);
    });
  }

  Future<void> emit(Object event) async {
    if (sinks.isEmpty) return;

    await lock.synchronized(() async {
      // Iterate over a copy of sinks
      final List<_NamedSink> sinksToNotify = List.from(sinks);
      for (final sink in sinksToNotify) {
        _sendSubscriberMetrics(_metricsTracer, sink);
        try {
          if (!sink.controller.isClosed) {
            sink.controller.add(event);
          }
        } catch (e) {
              print('This can lead to libp2p stalling and hard to debug issues. Error: $e');
        }
      }
    });
  }
}

void _sendSubscriberMetrics(MetricsTracer? metricsTracer, _NamedSink sink) {
  if (metricsTracer != null) {
    metricsTracer.subscriberEventQueued(sink.name);
  }
}
