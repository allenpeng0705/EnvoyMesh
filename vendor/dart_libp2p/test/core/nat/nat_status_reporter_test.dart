import 'package:dart_libp2p/p2p/nat/nat_behavior.dart';
import 'package:dart_libp2p/p2p/nat/nat_behavior_tracker.dart';
import 'package:dart_libp2p/p2p/nat/nat_status_reporter.dart';
import 'package:dart_libp2p/p2p/nat/nat_traversal_strategy.dart';
import 'package:dart_libp2p/p2p/nat/stun/stun_client_pool.dart';
import 'package:test/test.dart';

/// A mock implementation of NatBehaviorTracker for testing
class MockNatBehaviorTracker extends NatBehaviorTracker {
  NatBehavior _mockBehavior;
  final List<NatBehaviorRecord> _mockHistory;
  
  MockNatBehaviorTracker({
    NatBehavior? mockBehavior,
    List<NatBehaviorRecord>? mockHistory,
  }) : _mockBehavior = mockBehavior ?? NatBehavior(),
       _mockHistory = mockHistory ?? [],
       super(stunClientPool: StunClientPool(stunServers: []));
  
  @override
  NatBehavior get currentBehavior => _mockBehavior;
  
  @override
  List<NatBehaviorRecord> get behaviorHistory => _mockHistory;
  
  void setMockBehavior(NatBehavior behavior) {
    _mockBehavior = behavior;
  }
  
  @override
  Future<NatBehavior> discoverBehavior() async {
    return _mockBehavior;
  }
}

void main() {
  group('NatStatusReporter', () {
    late MockNatBehaviorTracker mockTracker;
    late NatStatusReporter reporter;
    
    setUp(() {
      // Create a mock tracker with a specific behavior
      final mockBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.endpointIndependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
        supportsHairpinning: true,
        preservesPorts: true,
      );
      
      final mockHistory = [
        NatBehaviorRecord(
          behavior: mockBehavior,
          timestamp: DateTime.now().subtract(Duration(hours: 1)),
        ),
      ];
      
      mockTracker = MockNatBehaviorTracker(
        mockBehavior: mockBehavior,
        mockHistory: mockHistory,
      );
      
      reporter = NatStatusReporter(behaviorTracker: mockTracker);
    });
    
    test('should report current NAT behavior', () {
      final behavior = reporter.currentBehavior;
      
      expect(behavior.mappingBehavior, equals(NatMappingBehavior.endpointIndependent));
      expect(behavior.filteringBehavior, equals(NatFilteringBehavior.addressDependent));
      expect(behavior.supportsHairpinning, isTrue);
      expect(behavior.preservesPorts, isTrue);
    });
    
    test('should report recommended traversal strategy', () {
      final strategy = reporter.recommendedStrategy;
      
      // For endpoint-independent mapping with address-dependent filtering,
      // UDP hole punching is the recommended strategy
      expect(strategy, equals(TraversalStrategy.udpHolePunching));
    });
    
    test('should report strategy description', () {
      final description = reporter.recommendedStrategyDescription;
      
      expect(description, equals('UDP hole punching'));
    });
    
    test('should provide status summary', () {
      final summary = reporter.getStatusSummary();
      
      expect(summary['currentBehavior']['mappingBehavior'], equals('endpointIndependent'));
      expect(summary['currentBehavior']['filteringBehavior'], equals('addressDependent'));
      expect(summary['currentBehavior']['supportsHairpinning'], isTrue);
      expect(summary['currentBehavior']['preservesPorts'], isTrue);
      expect(summary['recommendedStrategy'], equals('udpHolePunching'));
      expect(summary['recommendedStrategyDescription'], equals('UDP hole punching'));
      expect(summary['historySize'], equals(1));
      expect(summary['lastUpdated'], isNotNull);
    });
    
    test('should provide detailed report with history', () {
      final report = reporter.getDetailedReport();
      
      expect(report['history'], isA<List>());
      expect(report['history'].length, equals(1));
      expect(report['history'][0]['mappingBehavior'], equals('endpointIndependent'));
      expect(report['history'][0]['filteringBehavior'], equals('addressDependent'));
      expect(report['history'][0]['timestamp'], isNotNull);
    });
    
    test('should recommend peer strategy based on remote behavior', () {
      final remoteBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.addressAndPortDependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      
      final strategy = reporter.getRecommendedPeerStrategy(remoteBehavior);
      
      // For a peer with address-and-port-dependent mapping, TCP hole punching is recommended
      expect(strategy, equals(TraversalStrategy.tcpHolePunching));
    });
    
    test('should provide peer strategy description', () {
      final remoteBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.addressAndPortDependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      
      final description = reporter.getRecommendedPeerStrategyDescription(remoteBehavior);
      
      expect(description, equals('TCP hole punching'));
    });
    
    test('should trigger behavior update', () async {
      // Change the mock behavior
      mockTracker.setMockBehavior(NatBehavior(
        mappingBehavior: NatMappingBehavior.addressDependent,
        filteringBehavior: NatFilteringBehavior.addressAndPortDependent,
      ));
      
      // Trigger update
      final updatedBehavior = await reporter.updateNatBehavior();
      
      // Check that behavior was updated
      expect(updatedBehavior.mappingBehavior, equals(NatMappingBehavior.addressDependent));
      expect(updatedBehavior.filteringBehavior, equals(NatFilteringBehavior.addressAndPortDependent));
    });
    
    test('should handle behavior change callbacks', () {
      var callbackCalled = false;
      NatBehavior? oldBehaviorFromCallback;
      NatBehavior? newBehaviorFromCallback;
      
      // Add callback
      reporter.addBehaviorChangeCallback((oldBehavior, newBehavior) {
        callbackCalled = true;
        oldBehaviorFromCallback = oldBehavior;
        newBehaviorFromCallback = newBehavior;
      });
      
      // Simulate behavior change by calling the callback directly on the tracker
      final oldBehavior = mockTracker.currentBehavior;
      final newBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.addressDependent,
        filteringBehavior: NatFilteringBehavior.addressAndPortDependent,
      );
      
      // Get the callback from the tracker and call it
      final callback = mockTracker.callbacks.first;
      callback(oldBehavior, newBehavior);
      
      // Check that our callback was called with the correct behaviors
      expect(callbackCalled, isTrue);
      expect(oldBehaviorFromCallback?.mappingBehavior, equals(NatMappingBehavior.endpointIndependent));
      expect(newBehaviorFromCallback?.mappingBehavior, equals(NatMappingBehavior.addressDependent));
    });
  });
}