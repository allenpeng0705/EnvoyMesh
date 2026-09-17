/// Package event provides a type-based event subscription system.
///
/// This is a port of the Go implementation from go-libp2p/core/event/bus.go
/// to Dart, using native Dart idioms like Stream Controllers instead of Go channels.

import 'dart:async';

/// A function that represents a subscription option.
/// Use the options exposed by the implementation of choice.
typedef SubscriptionOpt = Function(Object);

/// A function that represents an emitter option.
/// Use the options exposed by the implementation of choice.
typedef EmitterOpt = Function(Object);

/// A function that closes a subscriber.
typedef CancelFunc = Function();

/// A virtual type to represent wildcard subscriptions.
class _WildcardSubscriptionType {}

/// WildcardSubscription is the type to subscribe to receive all events
/// emitted in the eventbus.
final WildcardSubscription = _WildcardSubscriptionType();

/// Emitter represents an actor that emits events onto the eventbus.
abstract class Emitter {
  /// Emit emits an event onto the eventbus. If any stream subscribed to the topic is blocked,
  /// calls to Emit will block.
  ///
  /// Calling this function with wrong event type will cause an error.
  Future<void> emit(Object event);

  /// Closes the emitter.
  Future<void> close();
}

/// Subscription represents a subscription to one or multiple event types.
abstract class Subscription<T> {
  /// Returns the stream from which to consume events.
  Stream<T> get stream;

  /// Returns the name for the subscription.
  String get name;

  /// Closes the subscription.
  Future<void> close();
}

/// Bus is an interface for a type-based event delivery system.
abstract class EventBus {
  /// Subscribe creates a new Subscription.
  ///
  /// eventType can be either a single event type, or a list of types to
  /// subscribe to multiple event types at once, under a single subscription (and stream).
  ///
  /// If you want to subscribe to ALL events emitted in the bus, use
  /// `WildcardSubscription` as the `eventType`:
  ///
  ///   eventbus.subscribe(WildcardSubscription)
  ///
  /// Simple example:
  ///
  ///   var sub = await eventbus.subscribe(EventType);
  ///   await sub.stream.forEach((event) {
  ///     // The event is guaranteed to be of type EventType
  ///     // Handle the event
  ///   });
  ///   await sub.close();
  ///
  /// Multi-type example:
  ///
  ///   var sub = await eventbus.subscribe([EventA, EventB]);
  ///   await sub.stream.forEach((event) {
  ///     if (event is EventA) {
  ///       // Handle EventA
  ///     } else if (event is EventB) {
  ///       // Handle EventB
  ///     }
  ///   });
  ///   await sub.close();
  Subscription subscribe(Object eventType , {List<SubscriptionOpt>? opts});

  /// Creates a new event emitter.
  ///
  /// eventType is used for type information for wiring purposes.
  ///
  /// Example:
  ///   var em = await eventbus.emitter(EventT);
  ///   await em.emit(EventT());
  ///   await em.close(); // MUST call this after being done with the emitter
  Future<Emitter> emitter(dynamic eventType, {List<EmitterOpt>? opts});

  /// Returns all the event types that this bus knows about
  /// (having emitters and subscribers). It omits the WildcardSubscription.
  ///
  /// The caller is guaranteed that this function will only return value types;
  /// no pointer types will be returned.
  List<String> getAllEventTypes();
}