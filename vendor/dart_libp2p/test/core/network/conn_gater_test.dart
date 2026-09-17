import 'dart:async';

import 'package:dart_libp2p/p2p/network/conn_gater.dart';
import 'package:dart_libp2p/core/peer/peer_id.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:test/test.dart';
import '../../mocks/mock_connection.dart';

void main() {
  group('BasicConnGater', () {
    late BasicConnGater gater;
    late MockConnection mockConn;
    late PeerId mockPeerId;
    late MultiAddr mockAddr;

    setUp(() {
      gater = BasicConnGater();
      mockConn = MockConnection(
        localAddr: MultiAddr('/ip4/127.0.0.1/tcp/1234'),
        remoteAddr: MultiAddr('/ip4/127.0.0.1/tcp/5678'),
        remotePeer: PeerId.fromString('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSupNKC'),
      );
      mockPeerId = PeerId.fromString('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSupNKC');
      mockAddr = MultiAddr('/ip4/127.0.0.1/tcp/1234');
    });

    tearDown(() {
      gater.close();
    });

    group('Peer blocking', () {
      test('blocks and unblocks peers', () {
        expect(gater.isPeerBlocked(mockPeerId), isFalse);
        
        gater.blockPeer(mockPeerId);
        expect(gater.isPeerBlocked(mockPeerId), isTrue);
        
        gater.unblockPeer(mockPeerId);
        expect(gater.isPeerBlocked(mockPeerId), isFalse);
      });

      test('interceptPeerDial blocks blocked peers', () {
        gater.blockPeer(mockPeerId);
        expect(gater.interceptPeerDial(mockPeerId), isFalse);
      });

      test('interceptPeerDial allows unblocked peers', () {
        expect(gater.interceptPeerDial(mockPeerId), isTrue);
      });
    });

    group('Address blocking', () {
      test('blocks and unblocks addresses', () {
        expect(gater.isAddrBlocked(mockAddr), isFalse);
        
        gater.blockAddr(mockAddr);
        expect(gater.isAddrBlocked(mockAddr), isTrue);
        
        gater.unblockAddr(mockAddr);
        expect(gater.isAddrBlocked(mockAddr), isFalse);
      });

      test('interceptAddrDial blocks blocked addresses', () {
        gater.blockAddr(mockAddr);
        expect(gater.interceptAddrDial(mockPeerId, mockAddr), isFalse);
      });

      test('interceptAddrDial allows unblocked addresses', () {
        expect(gater.interceptAddrDial(mockPeerId, mockAddr), isTrue);
      });
    });

    group('Connection blocking', () {
      test('blocks and unblocks connections', () {
        expect(gater.isConnBlocked(mockConn.id), isFalse);
        
        gater.blockConn(mockConn.id);
        expect(gater.isConnBlocked(mockConn.id), isTrue);
        
        gater.unblockConn(mockConn.id);
        expect(gater.isConnBlocked(mockConn.id), isFalse);
      });

      test('interceptAccept blocks blocked connections', () {
        gater.blockConn(mockConn.id);
        expect(gater.interceptAccept(mockConn), isFalse);
      });

      test('interceptAccept allows unblocked connections', () {
        expect(gater.interceptAccept(mockConn), isTrue);
      });
    });

    group('Subnet blocking', () {
      test('blocks and unblocks subnets', () {
        final subnet = '192.168.1.0/24';
        expect(gater.isSubnetBlocked(subnet), isFalse);
        
        gater.blockSubnet(subnet);
        expect(gater.isSubnetBlocked(subnet), isTrue);
        
        gater.unblockSubnet(subnet);
        expect(gater.isSubnetBlocked(subnet), isFalse);
      });

      test('interceptAddrDial blocks addresses in blocked subnets', () {
        gater.blockSubnet('192.168.1.0/24');
        final addr = MultiAddr('/ip4/192.168.1.100/tcp/1234');
        expect(gater.interceptAddrDial(mockPeerId, addr), isFalse);
      });

      test('interceptAddrDial allows addresses not in blocked subnets', () {
        gater.blockSubnet('192.168.1.0/24');
        final addr = MultiAddr('/ip4/10.0.0.1/tcp/1234');
        expect(gater.interceptAddrDial(mockPeerId, addr), isTrue);
      });
    });

    group('Connection metrics', () {
      test('records and updates connection metrics', () {
        expect(gater.getConnectionMetrics(mockConn.id), isNull);
        
        gater.interceptAccept(mockConn);
        final metrics = gater.getConnectionMetrics(mockConn.id);
        expect(metrics, isNotNull);
        expect(metrics?.peerId, equals(mockConn.remotePeer));
        expect(metrics?.bytesIn, equals(0));
        expect(metrics?.bytesOut, equals(0));
        
        // Update metrics
        gater.updateConnectionMetrics(mockConn.id, bytesIn: 100, bytesOut: 200);
        expect(metrics?.bytesIn, equals(100));
        expect(metrics?.bytesOut, equals(200));
        expect(metrics?.totalBytes, equals(300));
      });
    });

    group('Connection timeouts', () {
      test('sets up connection timeout', () async {
        gater = BasicConnGater(connectionTimeout: Duration(milliseconds: 100));
        gater.interceptAccept(mockConn);
        
        // Wait for timeout
        await Future.delayed(Duration(milliseconds: 150));
        
        expect(gater.isConnBlocked(mockConn.id), isTrue);
      });

      test('cleans up connection timeout', () {
        gater.interceptAccept(mockConn);

        // Connection should not be blocked after cleanup
        expect(gater.isConnBlocked(mockConn.id), isFalse);
      });
    });

    group('Resource limits', () {
      test('respects maximum connections limit', () {
        gater = BasicConnGater(maxConnections: 2);
        
        final conn1 = MockConnection(
          localAddr: MultiAddr('/ip4/127.0.0.1/tcp/1234'),
          remoteAddr: MultiAddr('/ip4/127.0.0.1/tcp/5678'),
          remotePeer: PeerId.fromString('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSupNKC'),
          id: 'conn1',
        );
        
        final conn2 = MockConnection(
          localAddr: MultiAddr('/ip4/127.0.0.1/tcp/1234'),
          remoteAddr: MultiAddr('/ip4/127.0.0.1/tcp/5678'),
          remotePeer: PeerId.fromString('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSupNKC'),
          id: 'conn2',
        );
        
        final conn3 = MockConnection(
          localAddr: MultiAddr('/ip4/127.0.0.1/tcp/1234'),
          remoteAddr: MultiAddr('/ip4/127.0.0.1/tcp/5678'),
          remotePeer: PeerId.fromString('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSupNKC'),
          id: 'conn3',
        );
        
        expect(gater.interceptAccept(conn1), isTrue);
        expect(gater.interceptAccept(conn2), isTrue);
        expect(gater.interceptAccept(conn3), isFalse);
      });

      test('respects maximum connections per peer limit', () {
        gater = BasicConnGater(maxConnectionsPerPeer: 2);
        
        final peerId = PeerId.fromString('QmcgpsyWgH8Y8ajJz1Cu72KnS5uo2Aa2LpzU7kinSupNKC');
        
        final conn1 = MockConnection(
          localAddr: MultiAddr('/ip4/127.0.0.1/tcp/1234'),
          remoteAddr: MultiAddr('/ip4/127.0.0.1/tcp/5678'),
          remotePeer: peerId,
          id: 'conn1',
        );
        
        final conn2 = MockConnection(
          localAddr: MultiAddr('/ip4/127.0.0.1/tcp/1234'),
          remoteAddr: MultiAddr('/ip4/127.0.0.1/tcp/5678'),
          remotePeer: peerId,
          id: 'conn2',
        );
        
        final conn3 = MockConnection(
          localAddr: MultiAddr('/ip4/127.0.0.1/tcp/1234'),
          remoteAddr: MultiAddr('/ip4/127.0.0.1/tcp/5678'),
          remotePeer: peerId,
          id: 'conn3',
        );
        
        expect(gater.interceptAccept(conn1), isTrue);
        expect(gater.interceptAccept(conn2), isTrue);
        expect(gater.interceptAccept(conn3), isFalse);
      });
    });

    group('Cleanup', () {
      test('cleans up resources on close', () {
        gater.interceptAccept(mockConn);
        expect(gater.getConnectionMetrics(mockConn.id), isNotNull);
        
        gater.close();
        expect(gater.getConnectionMetrics(mockConn.id), isNull);
      });
    });
  });
} 