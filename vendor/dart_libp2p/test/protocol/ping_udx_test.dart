import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/addr_info.dart';
import 'package:dart_libp2p/p2p/protocol/ping/ping.dart';
import 'package:logging/logging.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/network/context.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_udx/dart_udx.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';
import 'package:dart_libp2p/p2p/transport/connection_manager.dart' as p2p_conn_mgr;
import 'package:dart_libp2p/p2p/host/eventbus/basic.dart' as p2p_event_bus;
import 'package:dart_libp2p/core/event/identify.dart';
import 'dart:async';

import '../real_net_stack.dart';

void main() {
  Logger.root.level = Level.INFO;
  Logger.root.onRecord.listen((record) {
    print('${record.level.name}: ${record.time}: ${record.loggerName}: ${record.message}');
  });

  group('Ping with UDX Transport using real_net_stack', () {
    late Libp2pNode node1;
    late Libp2pNode node2;
    late Host host1;
    late Host host2;
    late PeerId peerId1;
    late PeerId peerId2;
    late UDX udx;

    setUp(() async {
      udx = UDX();
      final resourceManager = NullResourceManager();
      final connManager = p2p_conn_mgr.ConnectionManager();
      final eventBus = p2p_event_bus.BasicBus();

      node1 = await createLibp2pNode(
        udxInstance: udx,
        resourceManager: resourceManager,
        connManager: connManager,
        hostEventBus: eventBus,
      );
      host1 = node1.host;
      peerId1 = node1.peerId;

      node2 = await createLibp2pNode(
        udxInstance: udx,
        resourceManager: resourceManager,
        connManager: connManager,
        hostEventBus: eventBus,
      );
      host2 = node2.host;
      peerId2 = node2.peerId;
    });

    tearDown(() async {
      await host1.close();
      await host2.close();

      // Wait for all connections to be closed
      while (host1.network.conns.isNotEmpty || host2.network.conns.isNotEmpty) {
        await Future.delayed(Duration(milliseconds: 100));
      }
    });

    test('Ping between two hosts', () async {
      final identifyCompleter = Completer();
      final sub = host2.eventBus.subscribe(EvtPeerIdentificationCompleted);
      final subscription = sub.stream.listen((event) {
        if (event is EvtPeerIdentificationCompleted && event.peer == peerId1) {
          if (!identifyCompleter.isCompleted) {
            identifyCompleter.complete();
          }
        }
      });

      await host2.connect(AddrInfo(peerId1, host1.addrs));

      // Wait for identify to complete
      await identifyCompleter.future;

      final stream = await host2.newStream(peerId1, [PingConstants.protocolId], Context());
      final pingPayload = Uint8List(32);
      await stream.write(pingPayload);
      final response = await stream.read();
      expect(response, equals(pingPayload));
      await stream.close();
      await subscription.cancel();
      await sub.close();
    }, timeout: Timeout(Duration(seconds: 30)));
  });
}
