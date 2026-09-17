import 'dart:async';
import 'nat_behavior.dart';
import 'nat_behavior_tracker.dart';
import 'nat_traversal_strategy.dart';

/// A class that provides NAT status reporting
class NatStatusReporter {
  /// The NAT behavior tracker to use for status reporting
  final NatBehaviorTracker _behaviorTracker;

  /// Creates a new NAT status reporter
  NatStatusReporter({
    required NatBehaviorTracker behaviorTracker,
  }) : _behaviorTracker = behaviorTracker;

  /// Gets the current NAT behavior
  NatBehavior get currentBehavior => _behaviorTracker.currentBehavior;

  /// Gets the history of NAT behavior records
  List<NatBehaviorRecord> get behaviorHistory => _behaviorTracker.behaviorHistory;

  /// Gets the recommended traversal strategy based on the current NAT behavior
  TraversalStrategy get recommendedStrategy => 
      NatTraversalStrategy.selectStrategy(currentBehavior);

  /// Gets a description of the recommended traversal strategy
  String get recommendedStrategyDescription => 
      NatTraversalStrategy.getStrategyDescription(recommendedStrategy);

  /// Gets a summary of the current NAT status
  Map<String, dynamic> getStatusSummary() {
    return {
      'currentBehavior': {
        'mappingBehavior': currentBehavior.mappingBehavior.name,
        'filteringBehavior': currentBehavior.filteringBehavior.name,
        'supportsHairpinning': currentBehavior.supportsHairpinning,
        'preservesPorts': currentBehavior.preservesPorts,
        'supportsPortMapping': currentBehavior.supportsPortMapping,
        'mappingLifetime': currentBehavior.mappingLifetime,
      },
      'recommendedStrategy': recommendedStrategy.name,
      'recommendedStrategyDescription': recommendedStrategyDescription,
      'historySize': behaviorHistory.length,
      'lastUpdated': behaviorHistory.isNotEmpty 
          ? behaviorHistory.last.timestamp.toIso8601String() 
          : null,
    };
  }

  /// Gets a detailed report of the NAT status
  Map<String, dynamic> getDetailedReport() {
    final summary = getStatusSummary();
    
    // Add history to the report
    final historyList = behaviorHistory.map((record) => {
      'timestamp': record.timestamp.toIso8601String(),
      'mappingBehavior': record.behavior.mappingBehavior.name,
      'filteringBehavior': record.behavior.filteringBehavior.name,
      'supportsHairpinning': record.behavior.supportsHairpinning,
      'preservesPorts': record.behavior.preservesPorts,
      'supportsPortMapping': record.behavior.supportsPortMapping,
      'mappingLifetime': record.behavior.mappingLifetime,
    }).toList();
    
    summary['history'] = historyList;
    
    return summary;
  }

  /// Gets the recommended traversal strategy for a connection with a remote peer
  TraversalStrategy getRecommendedPeerStrategy(NatBehavior remoteBehavior) {
    return NatTraversalStrategy.selectPeerStrategy(currentBehavior, remoteBehavior);
  }

  /// Gets a description of the recommended traversal strategy for a connection with a remote peer
  String getRecommendedPeerStrategyDescription(NatBehavior remoteBehavior) {
    final strategy = getRecommendedPeerStrategy(remoteBehavior);
    return NatTraversalStrategy.getStrategyDescription(strategy);
  }

  /// Adds a callback for NAT behavior changes
  void addBehaviorChangeCallback(NatBehaviorChangeCallback callback) {
    _behaviorTracker.addBehaviorChangeCallback(callback);
  }

  /// Removes a callback for NAT behavior changes
  void removeBehaviorChangeCallback(NatBehaviorChangeCallback callback) {
    _behaviorTracker.removeBehaviorChangeCallback(callback);
  }

  /// Triggers a manual update of the NAT behavior
  Future<NatBehavior> updateNatBehavior() {
    return _behaviorTracker.discoverBehavior();
  }
}