# Event Bus System

This directory contains the Dart port of the event bus system from go-libp2p.

## Overview

The event bus provides a type-based event subscription system that allows different components of libp2p to communicate with each other through events. The implementation uses native Dart idioms like Stream Controllers instead of Go channels while maintaining strong typing.

## Files

- `bus.dart`: Contains the core interfaces for the event bus system:
  - `Bus`: The main event bus interface
  - `Subscription`: Interface for event subscriptions
  - `Emitter`: Interface for event emitters
- `protocol.dart`: Protocol-related events:
  - `EvtPeerProtocolsUpdated`: Emitted when a peer adds or removes protocols
  - `EvtLocalProtocolsUpdated`: Emitted when local stream handlers are attached or detached
- `addrs.dart`: Address-related events:
  - `EvtLocalAddressesUpdated`: Emitted when the set of listen addresses for the local host changes
- `dht.dart`: DHT-related events:
  - `GenericDHTEvent`: A generic wrapper for DHT events
- `identify.dart`: Identify-related events:
  - `EvtPeerIdentificationCompleted`: Emitted when peer identification succeeds
  - `EvtPeerIdentificationFailed`: Emitted when peer identification fails
- `network.dart`: Network-related events:
  - `EvtPeerConnectednessChanged`: Emitted when peer connectedness changes
- `reachability.dart`: Reachability-related events:
  - `EvtLocalReachabilityChanged`: Emitted when local node reachability changes
- `nattype.dart`: NAT-related events:
  - `EvtNATDeviceTypeChanged`: Emitted when the NAT device type changes

## Event Types

In the Go implementation, event types are defined in separate files following this naming convention:
```
Evt[Entity (noun)][Event (verb past tense / gerund)]
```

For example:
- `EvtConnEstablishing`: An event indicating a connection is being established
- `EvtConnEstablished`: An event indicating a connection has been established

When porting specific event types from Go to Dart, follow these guidelines:

1. Create a new file for each category of events (e.g., `connection_events.dart` for connection-related events)
2. Define each event as a class with appropriate properties
3. Follow the same naming convention as in Go
4. Ensure the event classes are immutable (use `final` for properties)

## Usage Example

```dart
// Example event class
class MyEventType {
  final String data;

  MyEventType(this.data);
}

void main() async {
  // Create an event bus implementation
  final eventBus = MyEventBusImplementation();

  // Subscribe to events
  final subscription = await eventBus.subscribe(MyEventType);
  subscription.stream.listen((event) {
    // Handle the event
    final myEvent = event as MyEventType;
    print('Received event: ${myEvent.data}');
  });

  // Create an emitter
  final emitter = await eventBus.emitter(MyEventType);

  // Emit events
  await emitter.emit(MyEventType('some data'));

  // Clean up
  await emitter.close();
  await subscription.close();
}
```

## Implementation Notes

When implementing the event bus:

1. Use `StreamController` for managing event streams
2. Ensure type safety by checking event types at runtime
3. Handle backpressure appropriately
4. Implement proper cleanup to avoid memory leaks
