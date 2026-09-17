import 'package:dart_libp2p/core/network/common.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/limit.dart';
import 'package:dart_libp2p/p2p/host/resource_manager/scope_impl.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/core/network/errors.dart' as network_errors;

// Helper to create a simple BaseLimit for testing
BaseLimit createTestLimit({
  int streams = 10,
  int streamsInbound = 5,
  int streamsOutbound = 5,
  int conns = 10,
  int connsInbound = 5,
  int connsOutbound = 5,
  int memory = 1024 * 1024, // 1MB
  // fds will use the default from BaseLimit constructor
}) {
  return BaseLimit(
    streamsInbound: streamsInbound,
    streamsOutbound: streamsOutbound,
    streams: streams,
    connsInbound: connsInbound,
    connsOutbound: connsOutbound,
    conns: conns,
    memory: memory,
  );
}

// Mock ResourceScopeImpl to track calls to public methods like incRef/decRef
// and to allow checking its state after its child calls done().
class MockResourceScope extends ResourceScopeImpl {
  int incRefCalls = 0;
  int decRefCalls = 0;
  // We won't try to override _private library methods.
  // Instead, we'll check the public state (stat) of the mock parent
  // to verify _releaseResourcesForChild had the correct effect.

  MockResourceScope(Limit limit, String name, {ResourceScopeImpl? owner, List<ResourceScopeImpl>? edges})
      : super(limit, name, owner: owner, edges: edges);

  @override
  void incRef() {
    super.incRef();
    incRefCalls++;
  }

  @override
  void decRef() {
    super.decRef();
    decRefCalls++;
  }
  
  void resetCounters() {
    incRefCalls = 0;
    decRefCalls = 0;
  }
}

void main() {
  group('ResourceScopeImpl Initialization and Basic Lifecycle', () {
    test('initializes with correct name, limit, and default state', () {
      final limit = createTestLimit();
      final scope = ResourceScopeImpl(limit, 'testScope');

      expect(scope.name, 'testScope');
      // expect(scope.limit, limit); // Limit is private in _resources, can't directly check
      expect(scope.stat.memory, 0); // Initial resources are zero
      expect(scope.stat.numStreamsOutbound, 0);
      // We can't directly check _isDone or _refCnt as they are private.
      // We test their effects via isUnused() and done() behavior.
      expect(scope.isUnused(), true); // Initially unused
    });

    test('done() sets scope to done, clears local resources, and becomes unused', () {
      final limit = createTestLimit();
      final scope = ResourceScopeImpl(limit, 'testScope');

      // Add some resources
      expect(() => scope.addStream(Direction.outbound), returnsNormally);
      expect(scope.stat.numStreamsOutbound, 1);
      expect(scope.isUnused(), false);

      scope.done();

      expect(scope.isUnused(), true); // Should be unused after done
      expect(scope.stat.numStreamsOutbound, 0); // Resources should be cleared
      
      // Verify ResourceScopeClosedException on subsequent operations
      expect(() => scope.addStream(Direction.inbound),
          throwsA(isA<network_errors.ResourceScopeClosedException>()));
    });

    test('done() is idempotent', () {
      final limit = createTestLimit();
      final scope = ResourceScopeImpl(limit, 'testScope');
      expect(() => scope.addStream(Direction.outbound), returnsNormally);
      
      scope.done();
      final statAfterFirstDone = scope.stat;
      final isUnusedAfterFirstDone = scope.isUnused();

      scope.done(); // Call done again
      
      expect(scope.stat.numStreamsOutbound, statAfterFirstDone.numStreamsOutbound);
      expect(scope.isUnused(), isUnusedAfterFirstDone);
      // No exceptions should be thrown
    });

    test('initial edges correctly increment parent ref counts', () {
      final parentLimit = createTestLimit();
      final mockParent1 = MockResourceScope(parentLimit, 'parent1');
      final mockParent2 = MockResourceScope(parentLimit, 'parent2');

      final childLimit = createTestLimit();
      // ignore: unused_local_variable
      final childScope = ResourceScopeImpl(childLimit, 'childScope', edges: [mockParent1, mockParent2]);

      expect(mockParent1.incRefCalls, 1);
      expect(mockParent2.incRefCalls, 1);
      // We can't check mockParent._refCnt directly, but isUnused() would be false if refCnt > 0
      expect(mockParent1.isUnused(), false); 
      expect(mockParent2.isUnused(), false);
    });
  });

  group('ResourceScopeImpl Reference Counting', () {
    test('incRef() and decRef() modify refCnt correctly (indirectly via isUnused)', () {
      final limit = createTestLimit();
      final scope = ResourceScopeImpl(limit, 'testScope');

      expect(scope.isUnused(), true, reason: 'Scope should initially be unused');

      scope.incRef();
      expect(scope.isUnused(), false, reason: 'Scope should not be unused after incRef');

      scope.decRef();
      expect(scope.isUnused(), true, reason: 'Scope should be unused after matching decRef');
    });

    test('decRef() does not allow refCnt to go below zero (stays unused)', () {
      final limit = createTestLimit();
      final scope = ResourceScopeImpl(limit, 'testScope');

      expect(scope.isUnused(), true);
      scope.decRef(); // Should log a BUG internally but not throw
      expect(scope.isUnused(), true, reason: 'Scope should remain unused even after extra decRef');
      
      scope.incRef();
      expect(scope.isUnused(), false);
      scope.decRef();
      expect(scope.isUnused(), true);
      scope.decRef(); // Another extra one
      expect(scope.isUnused(), true);
    });

    test('isUnused() returns false if resources are in use, even if refCnt is zero', () {
      final limit = createTestLimit();
      final scope = ResourceScopeImpl(limit, 'testScope');
      
      scope.addStream(Direction.outbound);
      expect(scope.isUnused(), false, reason: 'Scope has active resources');
      
      // Call done to clear resources, but let's imagine refCnt was manipulated elsewhere
      // For this test, we'll rely on the fact that done() also clears resources.
      // A more direct test of refCnt vs resources would require exposing refCnt or more complex mocks.
    });
     test('isUnused() returns true if done, regardless of refCnt or resources', () {
      final limit = createTestLimit();
      final scope = ResourceScopeImpl(limit, 'testScope');
      
      scope.incRef(); // refCnt = 1
      expect(() => scope.addStream(Direction.outbound), returnsNormally); // Has resources
      expect(scope.isUnused(), false);

      scope.done();
      expect(scope.isUnused(), true, reason: 'Scope should be unused after done(), even if refCnt might have been >0 or resources existed before done');
    });

    test('incRef() after done() does not change isUnused state or allow new resources', () {
      final limit = createTestLimit();
      final scope = ResourceScopeImpl(limit, 'testScope');

      scope.done();
      expect(scope.isUnused(), true, reason: 'Scope is done, so it should be unused');

      scope.incRef(); // Attempt to increment ref count
      expect(scope.isUnused(), true, reason: 'incRef() after done() should not make scope "used"');
      
      // Also verify that it doesn't allow new resource allocations
      expect(() => scope.addStream(Direction.outbound),
          throwsA(isA<network_errors.ResourceScopeClosedException>()),
          reason: 'Should not be able to add resources to a done scope, even after incRef');
    });

    test('decRef() after done() does not change isUnused state', () {
      final limit = createTestLimit();
      final scope = ResourceScopeImpl(limit, 'testScope');

      // Increment ref count first so it's not zero when done is called
      scope.incRef(); 
      scope.done();
      expect(scope.isUnused(), true, reason: 'Scope is done, so it should be unused');

      scope.decRef(); // Attempt to decrement ref count
      expect(scope.isUnused(), true, reason: 'decRef() after done() should not change isUnused state');
    });

    test('isUnused() is false when resources are present and refCnt is zero, true when resources are released', () {
      final limit = createTestLimit(streamsOutbound: 1);
      final scope = ResourceScopeImpl(limit, 'testScope');

      // At this point, refCnt is 0, no resources.
      expect(scope.isUnused(), true, reason: 'Initially unused (refCnt=0, no resources)');

      // Add a resource. refCnt is still 0.
      expect(() => scope.addStream(Direction.outbound), returnsNormally);
      expect(scope.stat.numStreamsOutbound, 1);
      expect(scope.isUnused(), false, reason: 'Not unused (refCnt=0, but has resources)');

      // Remove the resource. refCnt is still 0.
      scope.removeStream(Direction.outbound);
      expect(scope.stat.numStreamsOutbound, 0);
      expect(scope.isUnused(), true, reason: 'Unused again (refCnt=0, no resources)');
    });
  });

  group('ResourceScopeImpl DAG Hierarchy (Parent-Child)', () {
    late MockResourceScope mockParent;
    late ResourceScopeImpl childScope;
    final parentLimit = createTestLimit(streamsOutbound: 1, streams: 1);
    final childLimit = createTestLimit(streamsOutbound: 1, streams: 1);

    setUp(() {
      mockParent = MockResourceScope(parentLimit, 'mockParent');
      // Child scope with mockParent as its edge
      childScope = ResourceScopeImpl(childLimit, 'child', edges: [mockParent]);
      mockParent.resetCounters(); // Reset after child's constructor calls incRef
    });

    test('child.addStream() propagates to parent via _addStreamForChild', () {
      expect(mockParent.stat.numStreamsOutbound, 0);
      
      expect(() => childScope.addStream(Direction.outbound), returnsNormally);
      
      expect(childScope.stat.numStreamsOutbound, 1);
      expect(mockParent.stat.numStreamsOutbound, 1, reason: 'Parent should also have 1 stream');
    });

    test('child.addStream() fails if parent limit is exceeded', () {
      // Parent limit is 1 outbound stream. Add one directly to parent.
      expect(() => mockParent.addStream(Direction.outbound), returnsNormally);
      expect(mockParent.stat.numStreamsOutbound, 1);

      // Now child tries to add a stream, which should fail at the parent.
      expect(() => childScope.addStream(Direction.outbound),
          throwsA(isA<network_errors.ResourceLimitExceededException>()));
      
      expect(childScope.stat.numStreamsOutbound, 0, reason: 'Child stream should have been rolled back');
      expect(mockParent.stat.numStreamsOutbound, 1, reason: 'Parent stream count should remain 1');
    });
    
    test('child.removeStream() propagates to parent via _removeStreamForChild', () {
      expect(() => childScope.addStream(Direction.outbound), returnsNormally);
      expect(childScope.stat.numStreamsOutbound, 1);
      expect(mockParent.stat.numStreamsOutbound, 1);
      
      mockParent.resetCounters(); // Reset before the action we're testing

      childScope.removeStream(Direction.outbound);
      
      expect(childScope.stat.numStreamsOutbound, 0);
      expect(mockParent.stat.numStreamsOutbound, 0, reason: 'Parent stream count should be 0 after child removes stream');
    });

    test('child.done() calls _releaseResourcesForChild and decRef on parent', () {
      expect(() => childScope.addStream(Direction.outbound), returnsNormally); // Child has 1 outbound stream
      expect(mockParent.stat.numStreamsOutbound, 1);
      expect(mockParent.decRefCalls, 0);
      
      final childStatBeforeDone = childScope.stat;

      childScope.done();

      expect(mockParent.decRefCalls, 1);
      // Verify _releaseResourcesForChild effect: parent's stream count should be 0
      expect(mockParent.stat.numStreamsOutbound, 0, 
        reason: 'Parent should have its stream count (from child) released. Expected 0, got ${mockParent.stat.numStreamsOutbound}');
      
      // Check that the correct stats were "released" (this part of MockResourceScope was removed, so we check effect)
      // We can infer _releaseResourcesForChild was called if the parent's resources were decremented.
    });

    test('parent._releaseResourcesForChild correctly updates its resources and propagates to its own ancestors', () {
      // Setup: Grandparent -> Parent (mock) -> Child
      final grandParentLimit = createTestLimit(streamsOutbound: 5);
      final mockGrandParent = MockResourceScope(grandParentLimit, 'mockGrandParent');
      
      final parentLimitForThisTest = createTestLimit(streamsOutbound: 3);
      final actualParent = ResourceScopeImpl(parentLimitForThisTest, 'actualParent', edges: [mockGrandParent]);
      
      final childLimitForThisTest = createTestLimit(streamsOutbound: 1);
      final actualChild = ResourceScopeImpl(childLimitForThisTest, 'actualChild', edges: [actualParent]);

      // Child adds a stream, should propagate all the way up
      expect(() => actualChild.addStream(Direction.outbound), returnsNormally);
      expect(actualChild.stat.numStreamsOutbound, 1);
      expect(actualParent.stat.numStreamsOutbound, 1);
      expect(mockGrandParent.stat.numStreamsOutbound, 1);
      
      mockGrandParent.resetCounters();

      // Now, make the child done. This will call _releaseResourcesForChild on actualParent.
      // We want to verify that actualParent, when _releaseResourcesForChild is called on it,
      // not only updates its own _resources but also calls _removeStreamForAncestors.
      actualChild.done();

      expect(actualChild.stat.numStreamsOutbound, 0);
      expect(actualParent.stat.numStreamsOutbound, 0, reason: "Actual parent's stream count should be 0");
      expect(mockGrandParent.stat.numStreamsOutbound, 0, reason: "Grandparent's stream count should be 0 due to propagation from actualParent");
    });
  });

  group('ResourceScopeImpl Span Hierarchy (Owner-Span)', () {
    late MockResourceScope mockOwner;
    late ResourceScopeImpl spanScope; // This will be ResourceScopeSpan, but ResourceScopeImpl implements it
    
    final ownerLimit = createTestLimit(streamsOutbound: 1, streams: 1);

    setUp(() async { // Needs to be async for beginSpan
      mockOwner = MockResourceScope(ownerLimit, 'mockOwner');
      // Create a span from the owner
      spanScope = await mockOwner.beginSpan() as ResourceScopeImpl; // Cast to access underlying impl details if needed
      mockOwner.resetCounters(); // Reset after beginSpan calls incRef
    });

    test('beginSpan() increments owner refCnt and creates valid span', () async { // Made async
      // This is partially tested in setUp by checking mockOwner.incRefCalls was 1 (now reset).
      // We re-do it here for clarity on what beginSpan itself does.
      final freshOwner = MockResourceScope(ownerLimit, 'freshOwner');
      // incRefCalls is not useful here as beginSpan directly modifies _refCnt.
      // We check the effect via isUnused().
      expect(freshOwner.isUnused(), true, reason: "Fresh owner should initially be unused.");
      
      // ignore: unused_local_variable
      final newSpan = await freshOwner.beginSpan(); // Await the future
      
      // isUnused checks refCnt. If _refCnt > 0, isUnused is false (unless done).
      expect(freshOwner.isUnused(), false, reason: "Owner should not be unused after a span is created"); 
    });

    test('span.addStream() propagates to owner', () async {
      expect(mockOwner.stat.numStreamsOutbound, 0);
      
      expect(() => spanScope.addStream(Direction.outbound), returnsNormally); // spanScope is ResourceScopeImpl
      
      expect(spanScope.stat.numStreamsOutbound, 1);
      expect(mockOwner.stat.numStreamsOutbound, 1, reason: 'Owner should also have 1 stream from span');
    });

    test('span.addStream() fails if owner limit is exceeded', () async {
      // Owner limit is 1 outbound stream. Add one directly to owner.
      expect(() => mockOwner.addStream(Direction.outbound), returnsNormally);
      expect(mockOwner.stat.numStreamsOutbound, 1);

      // Now span tries to add a stream, which should fail at the owner.
      expect(() => spanScope.addStream(Direction.outbound),
          throwsA(isA<network_errors.ResourceLimitExceededException>()));
      
      expect(spanScope.stat.numStreamsOutbound, 0, reason: 'Span stream should have been rolled back');
      expect(mockOwner.stat.numStreamsOutbound, 1, reason: 'Owner stream count should remain 1');
    });
    
    test('span.removeStream() propagates to owner', () async {
      expect(() => spanScope.addStream(Direction.outbound), returnsNormally);
      expect(spanScope.stat.numStreamsOutbound, 1);
      expect(mockOwner.stat.numStreamsOutbound, 1);
      
      mockOwner.resetCounters();

      spanScope.removeStream(Direction.outbound);
      
      expect(spanScope.stat.numStreamsOutbound, 0);
      expect(mockOwner.stat.numStreamsOutbound, 0, reason: 'Owner stream count should be 0 after span removes stream');
    });

    test('span.done() calls _releaseResourcesForChild and decRef on owner', () async {
      expect(() => spanScope.addStream(Direction.outbound), returnsNormally); // Span has 1 outbound stream
      expect(mockOwner.stat.numStreamsOutbound, 1);
      // incRef for beginSpan was reset in setUp. decRefCalls should be 0 now.
      expect(mockOwner.decRefCalls, 0); 
      
      spanScope.done();

      expect(mockOwner.decRefCalls, 1);
      // Verify _releaseResourcesForChild effect: owner's stream count should be 0
      expect(mockOwner.stat.numStreamsOutbound, 0, 
        reason: 'Owner should have its stream count (from span) released.');
    });
  });

  group('ResourceScopeImpl Resource Limits and Errors', () {
    test('addStream() throws ResourceLimitExceededException when local stream limit is reached', () {
      final limit = createTestLimit(streamsOutbound: 1, streams: 1);
      final scope = ResourceScopeImpl(limit, 'testScope');

      // Add first stream, should succeed
      expect(() => scope.addStream(Direction.outbound), returnsNormally);
      expect(scope.stat.numStreamsOutbound, 1);

      // Add second stream, should fail
      expect(() => scope.addStream(Direction.outbound),
          throwsA(isA<network_errors.ResourceLimitExceededException>()));
      expect(scope.stat.numStreamsOutbound, 1, reason: 'Stream count should remain 1 after failed attempt');
    });
    
    test('addStream() throws ResourceLimitExceededException when local total stream limit is reached', () {
      final limit = createTestLimit(streamsInbound: 1, streamsOutbound: 1, streams: 1); // Total 1 stream
      final scope = ResourceScopeImpl(limit, 'testScope');

      // Add first stream (outbound), should succeed
      expect(() => scope.addStream(Direction.outbound), returnsNormally);
      expect(scope.stat.numStreamsOutbound, 1);
      expect(scope.stat.numStreamsInbound, 0);


      // Add second stream (inbound), should fail due to total limit
      expect(() => scope.addStream(Direction.inbound),
          throwsA(isA<network_errors.ResourceLimitExceededException>()));
      expect(scope.stat.numStreamsOutbound, 1);
      expect(scope.stat.numStreamsInbound, 0, reason: 'Inbound stream count should remain 0 after failed attempt');
    });

    test('addStream() throws ResourceScopeClosedException if scope is done', () {
      final limit = createTestLimit();
      final scope = ResourceScopeImpl(limit, 'testScope');
      scope.done();

      expect(() => scope.addStream(Direction.outbound),
          throwsA(isA<network_errors.ResourceScopeClosedException>()));
    });

    test('addStream() rolls back local reservation if an ancestor fails', () {
      // Setup: Child -> Parent (limited)
      final parentLimit = createTestLimit(streamsOutbound: 0, streams: 0); // Parent cannot take any streams
      final mockParent = MockResourceScope(parentLimit, 'mockParent');
      
      final childLimit = createTestLimit(streamsOutbound: 1, streams: 1);
      final childScope = ResourceScopeImpl(childLimit, 'childScope', edges: [mockParent]);
      
      mockParent.resetCounters();

      // Child attempts to add a stream. It should reserve locally, then try parent. Parent will fail.
      expect(() => childScope.addStream(Direction.outbound),
          throwsA(isA<network_errors.ResourceLimitExceededException>()), reason: 'Error should come from parent');
      
      expect(childScope.stat.numStreamsOutbound, 0, reason: 'Childs local reservation should be rolled back');
      expect(mockParent.stat.numStreamsOutbound, 0, reason: 'Parent should not have any streams');
    });

    // Memory tests (simplified as priority is not deeply implemented yet)
    test('reserveMemory() succeeds if within limit', () async {
      final limit = createTestLimit(memory: 100);
      final scope = ResourceScopeImpl(limit, 'testScope');
      
      await scope.reserveMemory(50, 0); // priority 0 (low)
      expect(scope.stat.memory, 50);
      
      await scope.reserveMemory(50, 0);
      expect(scope.stat.memory, 100);
    });

    test('reserveMemory() throws ResourceLimitExceededException if limit is surpassed', () async {
      final limit = createTestLimit(memory: 100);
      final scope = ResourceScopeImpl(limit, 'testScope');
      
      await scope.reserveMemory(80, 0);
      expect(scope.stat.memory, 80);
      
      expect(() async => await scope.reserveMemory(30, 0), 
          throwsA(isA<network_errors.ResourceLimitExceededException>()));
      expect(scope.stat.memory, 80, reason: 'Memory should remain 80 after failed attempt');
    });

    test('releaseMemory() decrements memory correctly', () async {
      final limit = createTestLimit(memory: 100);
      final scope = ResourceScopeImpl(limit, 'testScope');
      
      await scope.reserveMemory(80, 0);
      expect(scope.stat.memory, 80);
      
      scope.releaseMemory(30);
      expect(scope.stat.memory, 50);
      
      scope.releaseMemory(50);
      expect(scope.stat.memory, 0);
    });

    test('releaseMemory() does not allow memory to go below zero', () async {
      final limit = createTestLimit(memory: 100);
      final scope = ResourceScopeImpl(limit, 'testScope');
      
      await scope.reserveMemory(30, 0);
      scope.releaseMemory(50); // Release more than reserved
      expect(scope.stat.memory, 0, reason: 'Memory should be 0, not negative');
    });

     test('reserveMemory() rolls back local reservation if an ancestor fails', () async {
      final parentLimit = createTestLimit(memory: 50); 
      final mockParent = MockResourceScope(parentLimit, 'mockParent');
      
      final childLimit = createTestLimit(memory: 100);
      final childScope = ResourceScopeImpl(childLimit, 'childScope', edges: [mockParent]);
      
      mockParent.resetCounters();

      // Child reserves 70. Parent limit is 50.
      try {
        await childScope.reserveMemory(70,0);
        fail('Expected ResourceLimitExceededException was not thrown');
      } catch (e) {
        expect(e, isA<network_errors.ResourceLimitExceededException>());
      }
      
      // Add a small delay to see if it affects the state reading
      await Future.delayed(Duration(milliseconds: 10));
      
      // print('DEBUG TEST: About to check childScope.stat.memory. Current value: ${childScope.stat.memory}'); // Removed
      if (childScope.stat.memory != 0) {
        // This fail message will re-evaluate childScope.stat.memory for its message.
        fail('Childs local memory reservation was not rolled back. Expected 0, but got ${childScope.stat.memory}.');
      }
      
      // If we reach here, childScope.stat.memory was 0. Let's check mockParent as well.
      expect(mockParent.stat.memory, 0, reason: 'Parent should not have any memory reserved');
    });

  });
}
