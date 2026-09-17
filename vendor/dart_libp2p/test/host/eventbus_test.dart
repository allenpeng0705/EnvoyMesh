import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/host/eventbus/eventbus.dart';
import 'package:dart_libp2p/core/event/bus.dart';

// Test event classes
class TestEvent {
  final String message;
  TestEvent(this.message);

  @override
  String toString() => 'TestEvent';
}

class AnotherTestEvent {
  final int value;
  AnotherTestEvent(this.value);

  @override
  String toString() => 'AnotherTestEvent';
}

void main() {
  group('EventBus Tests', () {
    late EventBus bus;

    setUp(() {
      bus = BasicBus();
    });

    test('Subscribe and emit events', () async {
      final evBus = BasicBus();

      // Subscribe to TestEvent
      final subscription = await evBus.subscribe(TestEvent);

      // Create an emitter for TestEvent
      final emitter = await evBus.emitter(TestEvent);

      // Collect events
      final events = <Object>[];
      final subscription2 = subscription.stream.listen((event) {
        print(event);
        events.add(event);
      });

      // Emit an event
      final event = TestEvent('Hello, world!');
      await emitter.emit(event);

      // Wait for events to be processed
      await Future.delayed(Duration(milliseconds: 100));

      // Verify that the event was received
      expect(events.length, equals(1));
      expect(events[0], isA<TestEvent>());
      expect((events[0] as TestEvent).message, equals('Hello, world!'));

      // Clean up
      await subscription2.cancel();
      await subscription.close();
      await emitter.close();
    });

    test('Subscribe to multiple event types', () async {
      // Create emitters for both event types
      final testEmitter = await bus.emitter(TestEvent);
      final anotherEmitter = await bus.emitter(AnotherTestEvent);

      // Subscribe to both event types
      final subscription = await bus.subscribe([TestEvent, AnotherTestEvent]);

      // Collect events
      final events = <Object>[];
      final subscription2 = subscription.stream.listen((event) {
        events.add(event);
      });

      // Emit events
      await testEmitter.emit(TestEvent('Event 1'));
      await anotherEmitter.emit(AnotherTestEvent(42));
      await testEmitter.emit(TestEvent('Event 2'));

      // Wait for events to be processed
      await Future.delayed(Duration(milliseconds: 100));

      // Verify that all events were received
      expect(events.length, equals(3));
      expect(events[0], isA<TestEvent>());
      expect((events[0] as TestEvent).message, equals('Event 1'));
      expect(events[1], isA<AnotherTestEvent>());
      expect((events[1] as AnotherTestEvent).value, equals(42));
      expect(events[2], isA<TestEvent>());
      expect((events[2] as TestEvent).message, equals('Event 2'));

      // Clean up
      await subscription2.cancel();
      await subscription.close();
      await testEmitter.close();
      await anotherEmitter.close();
    });

    test('Wildcard subscription', () async {
      // Create emitters for both event types
      final testEmitter = await bus.emitter(TestEvent);
      final anotherEmitter = await bus.emitter(AnotherTestEvent);

      // Subscribe to all events
      final subscription = await bus.subscribe(WildcardSubscription);

      // Collect events
      final events = <Object>[];
      final subscription2 = subscription.stream.listen((event) {
        events.add(event);
      });

      // Emit events
      await testEmitter.emit(TestEvent('Event 1'));
      await anotherEmitter.emit(AnotherTestEvent(42));

      // Wait for events to be processed
      await Future.delayed(Duration(milliseconds: 100));

      // Verify that all events were received
      expect(events.length, equals(2));
      expect(events[0], isA<TestEvent>());
      expect(events[1], isA<AnotherTestEvent>());

      // Clean up
      await subscription2.cancel();
      await subscription.close();
      await testEmitter.close();
      await anotherEmitter.close();
    });

    test('Stateful emitter', () async {
      // Create a stateful emitter
      final emitter = await bus.emitter(TestEvent, opts: [stateful()]);

      // Emit an event
      final event = TestEvent('Stateful event');
      await emitter.emit(event);

      // Subscribe after the event was emitted
      final subscription = await bus.subscribe(TestEvent);

      // Collect events
      final events = <Object>[];
      final subscription2 = subscription.stream.listen((event) {
        print('[DEBUG_LOG] Received event in stateful emitter test: $event');
        events.add(event);
      });

      // Wait for events to be processed
      await Future.delayed(Duration(milliseconds: 500));

      // Print events for debugging
      print('[DEBUG_LOG] Events in stateful emitter test: ${events.length}');
      for (var i = 0; i < events.length; i++) {
        print('[DEBUG_LOG] Event $i: ${events[i]}');
      }

      // Verify that the event was received (because the emitter is stateful)
      expect(events.length, equals(1));
      expect(events[0], isA<TestEvent>());
      expect((events[0] as TestEvent).message, equals('Stateful event'));

      // Clean up
      await subscription2.cancel();
      await subscription.close();
      await emitter.close();
    });

    test('Metrics tracking', () async {
      // Create a bus with metrics
      final metricsTracer = SimpleMetricsTracer();
      final metricsBus = BasicBus();
      metricsBus.setMetricsTracer(metricsTracer);

      // Create an emitter and subscription
      final emitter = await metricsBus.emitter(TestEvent);
      final subscription = await metricsBus.subscribe(TestEvent);

      // Emit events
      await emitter.emit(TestEvent('Event 1'));
      await emitter.emit(TestEvent('Event 2'));

      // Verify metrics
      expect(metricsTracer.getEventsEmitted(TestEvent), equals(2));
      expect(metricsTracer.getSubscribers(TestEvent), equals(1));

      // Clean up
      await subscription.close();
      await emitter.close();
    });
  });
}
