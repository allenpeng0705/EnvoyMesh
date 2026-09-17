import 'dart:async';

import 'package:dart_libp2p/p2p/host/pstoremanager/pstoremanager.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/event/bus.dart';
import 'package:dart_libp2p/core/network/network.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';
import 'package:test/test.dart';

// Generate mocks
@GenerateMocks([Peerstore, EventBus, Network, Emitter, Subscription])
import 'pstoremanager_test.mocks.dart';

void main() {
  group('PeerstoreManager', () {
    late MockPeerstore pstore;
    late MockEventBus eventBus;
    late MockNetwork network;
    late MockEmitter emitter;
    late MockSubscription subscription;
    late StreamController<Object> eventController;

    setUp(() {
      pstore = MockPeerstore();
      eventBus = MockEventBus();
      network = MockNetwork();
      emitter = MockEmitter();
      subscription = MockSubscription();
      eventController = StreamController<Object>.broadcast();

      when(eventBus.subscribe(any)).thenReturn(subscription);
      when(eventBus.emitter(any)).thenAnswer((_) => Future.value(emitter));
      when(subscription.stream).thenAnswer((_) => eventController.stream);
      when(network.conns).thenReturn([]);
    });

    tearDown(() {
      eventController.close();
    });

    test('grace period removes peer after timeout', () async {
      const gracePeriod = Duration(milliseconds: 250);
      final peerId = PeerId.fromString('QmYyQSo1c1Ym7orWxLYvCrM2EmxFTANf8wXmmE7DWjhx5N');

      // Setup manager with short grace period for testing
      final manager = PeerstoreManager(
        pstore, 
        eventBus, 
        network, 
        opts: [withGracePeriod(gracePeriod)]
      );

      await manager.start();

      // Expect removePeer to be called after grace period
      final completer = Completer<void>();
      when(pstore.removePeer(peerId)).thenAnswer((_) {
        completer.complete();
        return Future.value();
      });

      // Simulate peer disconnection
      eventController.add(EvtPeerConnectednessChanged(
        peer: peerId,
        connectedness: Connectedness.notConnected,
      ));

      // Wait for grace period plus a little buffer
      await completer.future.timeout(gracePeriod * 3);

      // Verify removePeer was called
      verify(pstore.removePeer(peerId)).called(1);

      await manager.close();
    });

    test('reconnecting peer is not removed', () async {
      const gracePeriod = Duration(milliseconds: 200);
      final peerId = PeerId.fromString('QmYyQSo1c1Ym7orWxLYvCrM2EmxFTANf8wXmmE7DWjhx5N');

      // Setup manager with short grace period for testing
      final manager = PeerstoreManager(
        pstore, 
        eventBus, 
        network, 
        opts: [withGracePeriod(gracePeriod)]
      );

      await manager.start();

      // Simulate peer disconnection
      eventController.add(EvtPeerConnectednessChanged(
        peer: peerId,
        connectedness: Connectedness.notConnected,
      ));

      // Simulate peer reconnection
      eventController.add(EvtPeerConnectednessChanged(
        peer: peerId,
        connectedness: Connectedness.connected,
      ));

      // Wait for grace period plus a little buffer
      await Future.delayed(gracePeriod * 3 ~/ 2);

      // Verify removePeer was not called
      verifyNever(pstore.removePeer(peerId));

      await manager.close();
    });

    test('close removes all disconnected peers', () async {
      final peerId = PeerId.fromString('QmYyQSo1c1Ym7orWxLYvCrM2EmxFTANf8wXmmE7DWjhx5N');
      const gracePeriod = Duration(hours: 1); // Long grace period

      // Setup manager with long grace period
      final manager = PeerstoreManager(
        pstore, 
        eventBus, 
        network, 
        opts: [withGracePeriod(gracePeriod)]
      );

      await manager.start();

      // Simulate peer disconnection
      eventController.add(EvtPeerConnectednessChanged(
        peer: peerId,
        connectedness: Connectedness.notConnected,
      ));

      // Wait to ensure the event is processed
      await Future.delayed(Duration(milliseconds: 100));

      // Close the manager
      await manager.close();

      // Verify removePeer was called on close
      verify(pstore.removePeer(peerId)).called(1);
    });
  });
}
