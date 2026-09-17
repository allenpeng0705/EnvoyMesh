import 'dart:async';
import 'package:dart_libp2p/p2p/nat/nat_behavior.dart';
import 'package:dart_libp2p/p2p/nat/nat_behavior_tracker.dart';
import 'package:dart_libp2p/p2p/nat/storage_broker.dart';
import 'package:dart_libp2p/p2p/nat/stun/stun_client_pool.dart';
import 'package:test/test.dart';

/// A mock implementation of StunClientPool for testing
class MockStunClientPool extends StunClientPool {
  NatBehavior _mockBehavior;

  MockStunClientPool({
    NatBehavior? mockBehavior,
  }) : _mockBehavior = mockBehavior ?? NatBehavior(),
       super(stunServers: []);

  void setMockBehavior(NatBehavior behavior) {
    _mockBehavior = behavior;
  }

  @override
  Future<NatBehavior> discoverNatBehavior() async {
    return _mockBehavior;
  }
}

void main() {
  group('NatBehaviorTracker', () {
    late MockStunClientPool mockStunClientPool;
    late InMemoryStorageBroker storageBroker;
    late NatBehaviorTracker tracker;

    setUp(() {
      mockStunClientPool = MockStunClientPool();
      storageBroker = InMemoryStorageBroker();
      tracker = NatBehaviorTracker(
        stunClientPool: mockStunClientPool,
        storageBroker: storageBroker,
        checkInterval: Duration(milliseconds: 100), // Short interval for testing
        maxHistorySize: 5,
        storageKey: 'test_nat_behavior',
      );
    });

    tearDown(() {
      tracker.dispose();
    });

    test('should initialize and discover behavior', () async {
      // Set up mock behavior
      final mockBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.endpointIndependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(mockBehavior);

      // Initialize tracker
      await tracker.initialize();

      // Check that behavior was discovered
      expect(tracker.currentBehavior.mappingBehavior, equals(NatMappingBehavior.endpointIndependent));
      expect(tracker.currentBehavior.filteringBehavior, equals(NatFilteringBehavior.addressDependent));

      // Check that history was updated
      expect(tracker.behaviorHistory.length, equals(1));
      expect(tracker.behaviorHistory.first.behavior.mappingBehavior, equals(NatMappingBehavior.endpointIndependent));
      expect(tracker.behaviorHistory.first.behavior.filteringBehavior, equals(NatFilteringBehavior.addressDependent));
    });

    test('should save and load behavior from storage', () async {
      // Set up mock behavior
      final mockBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.endpointIndependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(mockBehavior);

      // Initialize tracker
      await tracker.initialize();

      // Create a new tracker with the same storage broker
      final newTracker = NatBehaviorTracker(
        stunClientPool: mockStunClientPool,
        storageBroker: storageBroker,
        checkInterval: Duration(milliseconds: 100),
        maxHistorySize: 5,
        storageKey: 'test_nat_behavior',
      );

      // Initialize the new tracker
      await newTracker.initialize();

      // Check that behavior was loaded from storage
      expect(newTracker.currentBehavior.mappingBehavior, equals(NatMappingBehavior.endpointIndependent));
      expect(newTracker.currentBehavior.filteringBehavior, equals(NatFilteringBehavior.addressDependent));

      // Check that history was loaded from storage
      expect(newTracker.behaviorHistory.length, equals(1));
      expect(newTracker.behaviorHistory.first.behavior.mappingBehavior, equals(NatMappingBehavior.endpointIndependent));
      expect(newTracker.behaviorHistory.first.behavior.filteringBehavior, equals(NatFilteringBehavior.addressDependent));

      // Clean up
      newTracker.dispose();
    });

    test('should detect behavior changes', () async {
      // Set up initial mock behavior
      final initialBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.endpointIndependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(initialBehavior);

      // Initialize tracker
      await tracker.initialize();

      // Change mock behavior
      final newBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.addressAndPortDependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(newBehavior);

      // Discover behavior again
      await tracker.discoverBehavior();

      // Check that behavior was updated
      expect(tracker.currentBehavior.mappingBehavior, equals(NatMappingBehavior.addressAndPortDependent));
      expect(tracker.currentBehavior.filteringBehavior, equals(NatFilteringBehavior.addressDependent));

      // Check that history was updated
      expect(tracker.behaviorHistory.length, equals(2));
      expect(tracker.behaviorHistory.last.behavior.mappingBehavior, equals(NatMappingBehavior.addressAndPortDependent));
      expect(tracker.behaviorHistory.last.behavior.filteringBehavior, equals(NatFilteringBehavior.addressDependent));
    });

    test('should not update if behavior has not changed', () async {
      // Set up mock behavior
      final mockBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.endpointIndependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(mockBehavior);

      // Initialize tracker
      await tracker.initialize();

      // Discover behavior again with the same behavior
      await tracker.discoverBehavior();

      // Check that history was not updated (still only one entry)
      expect(tracker.behaviorHistory.length, equals(1));
    });

    test('should notify callbacks on behavior change', () async {
      // Set up initial mock behavior
      final initialBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.endpointIndependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(initialBehavior);

      // Initialize tracker
      await tracker.initialize();

      // Set up callback
      NatBehavior? oldBehaviorFromCallback;
      NatBehavior? newBehaviorFromCallback;
      tracker.addBehaviorChangeCallback((oldBehavior, newBehavior) {
        oldBehaviorFromCallback = oldBehavior;
        newBehaviorFromCallback = newBehavior;
      });

      // Change mock behavior
      final newBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.addressAndPortDependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(newBehavior);

      // Discover behavior again
      await tracker.discoverBehavior();

      // Check that callback was called with correct behaviors
      expect(oldBehaviorFromCallback?.mappingBehavior, equals(NatMappingBehavior.endpointIndependent));
      expect(oldBehaviorFromCallback?.filteringBehavior, equals(NatFilteringBehavior.addressDependent));
      expect(newBehaviorFromCallback?.mappingBehavior, equals(NatMappingBehavior.addressAndPortDependent));
      expect(newBehaviorFromCallback?.filteringBehavior, equals(NatFilteringBehavior.addressDependent));
    });

    test('should limit history size', () async {
      // Set up initial mock behavior
      final initialBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.endpointIndependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(initialBehavior);

      // Initialize tracker
      await tracker.initialize();

      // Change behavior multiple times
      for (var i = 0; i < 10; i++) {
        final newBehavior = NatBehavior(
          mappingBehavior: i % 2 == 0 
              ? NatMappingBehavior.addressDependent 
              : NatMappingBehavior.addressAndPortDependent,
          filteringBehavior: NatFilteringBehavior.addressDependent,
        );
        mockStunClientPool.setMockBehavior(newBehavior);
        await tracker.discoverBehavior();
      }

      // Check that history is limited to maxHistorySize
      expect(tracker.behaviorHistory.length, equals(5));

      // Print out the mapping behaviors of all records in the history
      print('History size: ${tracker.behaviorHistory.length}');
      for (var i = 0; i < tracker.behaviorHistory.length; i++) {
        print('Record $i: ${tracker.behaviorHistory[i].behavior.mappingBehavior}');
      }

      // Check that the history contains the expected entries
      // The history contains the 5 most recent entries, which are the last 5 entries from the loop
      // The loop alternates between addressDependent and addressAndPortDependent
      expect(tracker.behaviorHistory.first.behavior.mappingBehavior, equals(NatMappingBehavior.addressAndPortDependent));
      expect(tracker.behaviorHistory.last.behavior.mappingBehavior, equals(NatMappingBehavior.addressAndPortDependent));
    });

    test('should perform periodic checks', () async {
      // Set up initial mock behavior
      final initialBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.endpointIndependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(initialBehavior);

      // Initialize tracker
      await tracker.initialize();

      // Wait for a short time
      await Future.delayed(Duration(milliseconds: 50));

      // Change mock behavior
      final newBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.addressAndPortDependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(newBehavior);

      // Wait for periodic check to happen
      await Future.delayed(Duration(milliseconds: 150));

      // Check that behavior was updated
      expect(tracker.currentBehavior.mappingBehavior, equals(NatMappingBehavior.addressAndPortDependent));
      expect(tracker.behaviorHistory.length, equals(2));
    });

    test('should stop periodic checks', () async {
      // Set up initial mock behavior
      final initialBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.endpointIndependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(initialBehavior);

      // Initialize tracker
      await tracker.initialize();

      // Stop periodic checks
      tracker.stopPeriodicChecks();

      // Change mock behavior
      final newBehavior = NatBehavior(
        mappingBehavior: NatMappingBehavior.addressAndPortDependent,
        filteringBehavior: NatFilteringBehavior.addressDependent,
      );
      mockStunClientPool.setMockBehavior(newBehavior);

      // Wait for what would have been a periodic check
      await Future.delayed(Duration(milliseconds: 150));

      // Check that behavior was not updated
      expect(tracker.currentBehavior.mappingBehavior, equals(NatMappingBehavior.endpointIndependent));
      expect(tracker.behaviorHistory.length, equals(1));
    });
  });
}
