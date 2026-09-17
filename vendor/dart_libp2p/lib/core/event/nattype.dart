/// NAT type-related events for libp2p.
///
/// This is a port of the Go implementation from go-libp2p/core/event/nattype.go
/// to Dart, using native Dart idioms.

/// NATTransportProtocol represents the transport protocol for which the NAT device type has been determined.
enum NATTransportProtocol {
  /// TCP protocol
  tcp,
  
  /// UDP protocol
  udp,
}

/// NATDeviceType indicates the type of the NAT device for a transport protocol.
enum NATDeviceType {
  /// Unknown NAT type
  unknown,
  
  /// Cone NAT allows inbound connections from any external IP address and port
  /// if the internal host has previously sent outbound packets to that specific IP address and port.
  cone,
  
  /// Symmetric NAT restricts inbound connections based on the external IP address and port.
  /// Each outbound connection from the same internal IP address and port to a different destination
  /// creates a unique external IP address and port mapping, making it difficult for external hosts
  /// to predict the correct external IP address and port to connect to.
  symmetric,
}

/// EvtNATDeviceTypeChanged is an event struct to be emitted when the type of the NAT device changes for a Transport Protocol.
///
/// Note: This event is meaningful ONLY if the AutoNAT Reachability is Private.
/// Consumers of this event should ALSO consume the `EvtLocalReachabilityChanged` event and interpret
/// this event ONLY if the Reachability on the `EvtLocalReachabilityChanged` is Private.
class EvtNATDeviceTypeChanged {
  /// TransportProtocol is the Transport Protocol for which the NAT Device Type has been determined.
  final NATTransportProtocol transportProtocol;
  
  /// NatDeviceType indicates the type of the NAT Device for the Transport Protocol.
  /// Currently, it can be either a `Cone NAT` or a `Symmetric NAT`. Please see the detailed documentation
  /// on the `NATDeviceType` enumeration for a better understanding of what these types mean and
  /// how they impact Connectivity and Hole Punching.
  final NATDeviceType natDeviceType;

  @override
  String toString() {
    return "EvtNATDeviceTypeChanged";
  }

  /// Creates a new EvtNATDeviceTypeChanged event.
  EvtNATDeviceTypeChanged({
    required this.transportProtocol,
    required this.natDeviceType,
  });
}