# The Event Bus

The `EventBus` provides a powerful, type-based system for subscribing to and emitting events within the libp2p host. It allows different components of the system to communicate with each other and with your application in a decoupled way.

Every `Host` has an `EventBus` instance, accessible via `host.eventBus`.

## Key Concepts

-   **Events**: Events are simply Dart objects. Any object can be an event. The event's type is used to route it to the correct subscribers.
-   **Emitter**: An `Emitter` is used to send events onto the bus.
-   **Subscription**: A `Subscription` is used to listen for events of a specific type (or types). It provides a `Stream` that you can listen to.

## Subscribing to Events

You can subscribe to events to react to things happening within the libp2p stack. The `subscribe` method returns a `Subscription` object, which contains a `Stream` of events.

### Example: Subscribing to Connection Events

The library defines several core event types. For example, `EvtPeerConnected` is emitted when a new connection to a peer is established, and `EvtPeerDisconnected` is emitted when a connection is lost.

```dart
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/event/network.dart'; // Contains network event types

// Assuming 'host' is your initialized Host
final EventBus bus = host.eventBus;

// Subscribe to both connected and disconnected events
final sub = bus.subscribe([EvtPeerConnected, EvtPeerDisconnected]);

sub.stream.listen((event) {
  if (event is EvtPeerConnected) {
    print('Peer connected: ${event.peer}');
  } else if (event is EvtPeerDisconnected) {
    print('Peer disconnected: ${event.peer}');
  }
});

// When you're done, close the subscription to release resources
// await sub.close();
```

### Subscribing to All Events

You can subscribe to all events on the bus using the `WildcardSubscription` type.

```dart
final sub = bus.subscribe(WildcardSubscription);
sub.stream.listen((event) {
  print('Received event of type ${event.runtimeType}: $event');
});
```

## Emitting Events

While the libp2p stack emits many useful events, you can also use the event bus to emit your own custom events for your application's internal communication.

### Example: Emitting a Custom Event

1.  **Define your event class:**

    ```dart
    class MyCustomEvent {
      final String message;
      MyCustomEvent(this.message);
    }
    ```

2.  **Create an emitter and emit the event:**

    ```dart
    // Create an emitter for your event type
    final emitter = await bus.emitter(MyCustomEvent);

    // Emit an instance of your event
    await emitter.emit(MyCustomEvent('Hello, Event Bus!'));

    // Close the emitter when you are done with it
    await emitter.close();
    ```

3.  **Subscribe to your custom event elsewhere in your application:**

    ```dart
    final sub = bus.subscribe(MyCustomEvent);
    sub.stream.listen((event) {
      // event is guaranteed to be of type MyCustomEvent
      print('Handled custom event: ${event.message}');
    });
    ```

## Core Event Types

Here are some of the core event types you can subscribe to:

-   **`EvtPeerConnected`**: A new connection to a peer has been established.
-   **`EvtPeerDisconnected`**: A connection to a peer has been terminated.
-   **`EvtListen`**: The host has started listening on a new address.
-   **`EvtListenClose`**: The host has stopped listening on an address.
-   **`EvtPeerIdentificationCompleted`**: The `Identify` protocol has completed with a peer.
-   **`EvtPeerProtocolsUpdated`**: A peer's supported protocols have been updated.
