/// DHT-related events for libp2p.
///
/// This is a port of the Go implementation from go-libp2p/core/event/dht.go
/// to Dart, using native Dart idioms.

/// RawJSON is a type that contains a raw JSON string.
typedef RawJSON = String;

/// GenericDHTEvent is a type that encapsulates an actual DHT event by carrying
/// its raw JSON.
///
/// Context: the DHT event system is rather bespoke and a bit messy at the time,
/// so until we unify/clean that up, this event bridges the gap. It should only
/// be consumed for informational purposes.
///
/// EXPERIMENTAL: this will likely be removed if/when the DHT event types are
/// hoisted to core, and the DHT event system is reconciled with the eventbus.
class GenericDHTEvent {
  /// Type is the type of the DHT event that occurred.
  final String type;

  /// Raw is the raw JSON representation of the event payload.
  final RawJSON raw;


  @override
  String toString() {
    return "GenericDHTEvent";
  }

  /// Creates a new GenericDHTEvent.
  GenericDHTEvent({
    required this.type,
    required this.raw,
  });
}