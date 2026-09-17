/// Enums and classes for NAT behavior discovery as defined in RFC 5780.

/// NAT mapping behavior as defined in RFC 5780.
/// 
/// This describes how a NAT maps internal endpoints to external endpoints.
enum NatMappingBehavior {
  /// Unknown mapping behavior (not yet determined)
  unknown,
  
  /// Endpoint-independent mapping: The NAT reuses the same external endpoint
  /// (IP address and port) for all connections from the same internal endpoint
  /// to any external endpoint.
  endpointIndependent,
  
  /// Address-dependent mapping: The NAT reuses the same external endpoint
  /// for connections from the same internal endpoint to the same external IP
  /// address, regardless of the external port.
  addressDependent,
  
  /// Address and port-dependent mapping: The NAT reuses the same external endpoint
  /// for connections from the same internal endpoint to the same external endpoint.
  addressAndPortDependent,
}

/// NAT filtering behavior as defined in RFC 5780.
/// 
/// This describes how a NAT filters incoming packets.
enum NatFilteringBehavior {
  /// Unknown filtering behavior (not yet determined)
  unknown,
  
  /// Endpoint-independent filtering: The NAT forwards any packets destined to
  /// the internal endpoint regardless of the external endpoint's IP address or port.
  endpointIndependent,
  
  /// Address-dependent filtering: The NAT forwards packets destined to the
  /// internal endpoint only if the internal endpoint previously sent packets
  /// to the external IP address.
  addressDependent,
  
  /// Address and port-dependent filtering: The NAT forwards packets destined
  /// to the internal endpoint only if the internal endpoint previously sent
  /// packets to the specific external endpoint (IP address and port).
  addressAndPortDependent,
}

/// Comprehensive NAT behavior information
class NatBehavior {
  /// The NAT mapping behavior
  final NatMappingBehavior mappingBehavior;
  
  /// The NAT filtering behavior
  final NatFilteringBehavior filteringBehavior;
  
  /// Whether hairpinning is supported
  final bool? supportsHairpinning;
  
  /// Whether the NAT preserves ports
  final bool? preservesPorts;
  
  /// Whether the NAT supports port mapping
  final bool? supportsPortMapping;
  
  /// The mapping lifetime in seconds (if known)
  final int? mappingLifetime;
  
  NatBehavior({
    this.mappingBehavior = NatMappingBehavior.unknown,
    this.filteringBehavior = NatFilteringBehavior.unknown,
    this.supportsHairpinning,
    this.preservesPorts,
    this.supportsPortMapping,
    this.mappingLifetime,
  });
  
  /// Returns a string representation of the NAT behavior
  @override
  String toString() {
    return 'NatBehavior(mapping: $mappingBehavior, filtering: $filteringBehavior, '
           'hairpinning: $supportsHairpinning, preservesPorts: $preservesPorts, '
           'portMapping: $supportsPortMapping, lifetime: $mappingLifetime)';
  }
}