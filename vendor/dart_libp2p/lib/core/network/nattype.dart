/// NATDeviceType indicates the type of the NAT device.
enum NATDeviceType {
  /// Indicates that the type of the NAT device is unknown.
  unknown,

  /// Indicates that the NAT device is a Cone NAT.
  /// A Cone NAT is a NAT where all outgoing connections from the same source IP address and port are mapped by the NAT device
  /// to the same IP address and port irrespective of the destination address.
  /// With regards to RFC 3489, this could be either a Full Cone NAT, a Restricted Cone NAT or a
  /// Port Restricted Cone NAT. However, we do NOT differentiate between them here and simply classify all such NATs as a Cone NAT.
  /// NAT traversal with hole punching is possible with a Cone NAT ONLY if the remote peer is ALSO behind a Cone NAT.
  /// If the remote peer is behind a Symmetric NAT, hole punching will fail.
  cone,

  /// Indicates that the NAT device is a Symmetric NAT.
  /// A Symmetric NAT maps outgoing connections with different destination addresses to different IP addresses and ports,
  /// even if they originate from the same source IP address and port.
  /// NAT traversal with hole-punching is currently NOT possible in libp2p with Symmetric NATs irrespective of the remote peer's NAT type.
  symmetric,
}

/// NATTransportProtocol is the transport protocol for which the NAT Device Type has been determined.
enum NATTransportProtocol {
  /// Means that the NAT Device Type has been determined for the UDP Protocol.
  udp,
  
  /// Means that the NAT Device Type has been determined for the TCP Protocol.
  tcp,
}