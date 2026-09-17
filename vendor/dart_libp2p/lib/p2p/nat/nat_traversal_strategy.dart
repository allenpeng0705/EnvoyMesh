import 'nat_behavior.dart';

/// Enum representing different NAT traversal strategies
enum TraversalStrategy {
  /// Direct connection (no NAT traversal needed)
  direct,
  
  /// UDP hole punching
  udpHolePunching,
  
  /// TCP hole punching
  tcpHolePunching,
  
  /// Relayed connection through a TURN server
  relayed,
  
  /// Unknown or undetermined strategy
  unknown,
}

/// A class that provides NAT traversal strategy selection based on NAT type
class NatTraversalStrategy {
  /// Selects the appropriate traversal strategy based on the local NAT behavior
  static TraversalStrategy selectStrategy(NatBehavior localBehavior) {
    // If mapping behavior is unknown, use relayed as a safe fallback
    if (localBehavior.mappingBehavior == NatMappingBehavior.unknown) {
      return TraversalStrategy.relayed;
    }
    
    // If filtering behavior is unknown, use relayed as a safe fallback
    if (localBehavior.filteringBehavior == NatFilteringBehavior.unknown) {
      return TraversalStrategy.relayed;
    }
    
    // For endpoint-independent mapping and filtering, direct connection may work
    if (localBehavior.mappingBehavior == NatMappingBehavior.endpointIndependent &&
        localBehavior.filteringBehavior == NatFilteringBehavior.endpointIndependent) {
      return TraversalStrategy.direct;
    }
    
    // For endpoint-independent mapping but stricter filtering, UDP hole punching is likely to work
    if (localBehavior.mappingBehavior == NatMappingBehavior.endpointIndependent) {
      return TraversalStrategy.udpHolePunching;
    }
    
    // For address-dependent mapping, UDP hole punching might work but is less reliable
    if (localBehavior.mappingBehavior == NatMappingBehavior.addressDependent) {
      return TraversalStrategy.udpHolePunching;
    }
    
    // For address-and-port-dependent mapping (symmetric NAT), TCP hole punching might be needed
    if (localBehavior.mappingBehavior == NatMappingBehavior.addressAndPortDependent) {
      return TraversalStrategy.tcpHolePunching;
    }
    
    // Default to relayed as a fallback
    return TraversalStrategy.relayed;
  }
  
  /// Selects the appropriate traversal strategy for a connection between two peers
  static TraversalStrategy selectPeerStrategy(NatBehavior localBehavior, NatBehavior remoteBehavior) {
    // If either behavior is unknown, use the strategy for the known behavior
    if (localBehavior.mappingBehavior == NatMappingBehavior.unknown ||
        localBehavior.filteringBehavior == NatFilteringBehavior.unknown) {
      return selectStrategy(remoteBehavior);
    }
    
    if (remoteBehavior.mappingBehavior == NatMappingBehavior.unknown ||
        remoteBehavior.filteringBehavior == NatFilteringBehavior.unknown) {
      return selectStrategy(localBehavior);
    }
    
    // If both are endpoint-independent mapping and filtering, direct connection may work
    if (localBehavior.mappingBehavior == NatMappingBehavior.endpointIndependent &&
        localBehavior.filteringBehavior == NatFilteringBehavior.endpointIndependent &&
        remoteBehavior.mappingBehavior == NatMappingBehavior.endpointIndependent &&
        remoteBehavior.filteringBehavior == NatFilteringBehavior.endpointIndependent) {
      return TraversalStrategy.direct;
    }
    
    // If both have endpoint-independent mapping, UDP hole punching is likely to work
    if (localBehavior.mappingBehavior == NatMappingBehavior.endpointIndependent &&
        remoteBehavior.mappingBehavior == NatMappingBehavior.endpointIndependent) {
      return TraversalStrategy.udpHolePunching;
    }
    
    // If either has address-and-port-dependent mapping (symmetric NAT), TCP hole punching might be needed
    if (localBehavior.mappingBehavior == NatMappingBehavior.addressAndPortDependent ||
        remoteBehavior.mappingBehavior == NatMappingBehavior.addressAndPortDependent) {
      return TraversalStrategy.tcpHolePunching;
    }
    
    // For other combinations, UDP hole punching might work but is less reliable
    return TraversalStrategy.udpHolePunching;
  }
  
  /// Returns a description of the traversal strategy
  static String getStrategyDescription(TraversalStrategy strategy) {
    switch (strategy) {
      case TraversalStrategy.direct:
        return 'Direct connection (no NAT traversal needed)';
      case TraversalStrategy.udpHolePunching:
        return 'UDP hole punching';
      case TraversalStrategy.tcpHolePunching:
        return 'TCP hole punching';
      case TraversalStrategy.relayed:
        return 'Relayed connection through a TURN server';
      case TraversalStrategy.unknown:
        return 'Unknown or undetermined strategy';
    }
  }
}