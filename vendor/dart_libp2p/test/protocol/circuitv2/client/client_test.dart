import 'package:test/test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

import 'package:dart_libp2p/core/host/host.dart';
import 'package:dart_libp2p/core/multiaddr.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/connmgr/conn_manager.dart';
import 'package:dart_libp2p/core/peerstore.dart';
import 'package:dart_libp2p/p2p/transport/upgrader.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/client/client.dart';
import 'package:dart_libp2p/p2p/protocol/circuitv2/proto.dart';

@GenerateMocks([Host, Upgrader, ConnManager, P2PStream, Conn, Peerstore])
import 'client_test.mocks.dart';

void main() {
  group('CircuitV2Client', () {
    late MockHost mockHost;
    late MockUpgrader mockUpgrader;
    late MockConnManager mockConnManager;
    late CircuitV2Client client;

    setUp(() {
      mockHost = MockHost();
      mockUpgrader = MockUpgrader();
      mockConnManager = MockConnManager();

      client = CircuitV2Client(
        host: mockHost,
        upgrader: mockUpgrader,
        connManager: mockConnManager,
      );
    });

    group('Initialization', () {
      test('should start and register STOP protocol handler', () async {
        // Act
        await client.start();

        // Assert
        verify(mockHost.setStreamHandler(
          CircuitV2Protocol.protoIDv2Stop,
          any,
        )).called(1);
      });

      test('should stop and remove protocol handler', () async {
        // Arrange
        await client.start();

        // Act
        await client.stop();

        // Assert
        verify(mockHost.removeStreamHandler(CircuitV2Protocol.protoIDv2Stop))
            .called(1);
      });
    });

    group('Circuit Address Validation', () {
      test('canDial should accept valid circuit addresses', () {
        // Arrange - Valid circuit address format
        final validAddr = MultiAddr(
          '/ip4/10.10.3.10/tcp/4001/p2p/12D3KooWRelayID/p2p-circuit/p2p/12D3KooWDestID',
        );

        // Act
        final canDial = client.canDial(validAddr);

        // Assert
        expect(canDial, isTrue);
      });

      test('canDial should accept circuit address to relay itself', () {
        // Arrange - Circuit address ending with /p2p-circuit
        final relayAddr = MultiAddr(
          '/ip4/10.10.3.10/tcp/4001/p2p/12D3KooWRelayID/p2p-circuit',
        );

        // Act
        final canDial = client.canDial(relayAddr);

        // Assert
        expect(canDial, isTrue);
      });

      test('canDial should reject non-circuit addresses', () {
        // Arrange - Regular TCP address
        final directAddr = MultiAddr('/ip4/10.10.3.10/tcp/4001');

        // Act
        final canDial = client.canDial(directAddr);

        // Assert
        expect(canDial, isFalse);
      });

      test('canDial should reject addresses without relay ID', () {
        // Arrange - Circuit address missing /p2p/ component
        final invalidAddr = MultiAddr('/ip4/10.10.3.10/tcp/4001/p2p-circuit');

        // Act
        final canDial = client.canDial(invalidAddr);

        // Assert
        expect(canDial, isFalse);
      });

      test('canDial should reject malformed circuit addresses', () {
        // Arrange - Circuit component in wrong order
        final malformedAddr = MultiAddr(
          '/ip4/10.10.3.10/tcp/4001/p2p-circuit/p2p/12D3KooWRelayID',
        );

        // Act
        final canDial = client.canDial(malformedAddr);

        // Assert
        expect(canDial, isFalse);
      });
    });

    group('Circuit Address Parsing', () {
      test('should correctly parse relay ID from circuit address', () {
        // Arrange
        final relayId = '12D3KooWRelayPeerID123456789';
        final destId = '12D3KooWDestPeerID987654321';
        final circuitAddr = MultiAddr(
          '/ip4/10.10.3.10/tcp/4001/p2p/$relayId/p2p-circuit/p2p/$destId',
        );

        // Act - We'll verify by checking the address components
        final components = circuitAddr.components;
        
        // Assert - Find the relay ID and dest ID in components
        final hasRelayId = components.any((comp) => comp.$2 == relayId);
        final hasDestId = components.any((comp) => comp.$2 == destId);
        
        expect(hasRelayId, isTrue, reason: 'Should contain relay peer ID');
        expect(hasDestId, isTrue, reason: 'Should contain destination peer ID');
      });

      test('should handle circuit address with only relay ID', () {
        // Arrange - No destination, connecting to relay itself
        final relayId = '12D3KooWRelayPeerID123456789';
        final circuitAddr = MultiAddr(
          '/ip4/10.10.3.10/tcp/4001/p2p/$relayId/p2p-circuit',
        );

        // Act
        final components = circuitAddr.components;

        // Assert
        final hasRelayId = components.any((comp) => comp.$2 == relayId);
        expect(hasRelayId, isTrue);
        expect(components.last.$1.name, equals('p2p-circuit'));
      });
    });

    group('Listen Capability', () {
      test('canListen should accept circuit addresses', () {
        // Arrange
        final circuitAddr = MultiAddr(
          '/ip4/10.10.3.10/tcp/4001/p2p/12D3KooWRelayID/p2p-circuit',
        );

        // Act
        final canListen = client.canListen(circuitAddr);

        // Assert
        expect(canListen, isTrue);
      });

      test('canListen should reject non-circuit addresses', () {
        // Arrange
        final directAddr = MultiAddr('/ip4/0.0.0.0/tcp/4001');

        // Act
        final canListen = client.canListen(directAddr);

        // Assert
        expect(canListen, isFalse);
      });

      test('listenAddrs should return empty when not listening', () {
        // Act
        final addrs = client.listenAddrs();

        // Assert
        expect(addrs, isEmpty);
      });
    });

    group('Protocol Information', () {
      test('should expose correct protocol IDs', () {
        // Act
        final protocols = client.protocols;

        // Assert - protocols returns the transport protocol identifier
        expect(protocols, contains('/p2p-circuit'));
      });

      test('should return correct protocol ID', () {
        // Act
        final protocolId = client.protocolId;

        // Assert
        expect(protocolId, equals(CircuitV2Protocol.protoIDv2Hop));
      });
    });

    group('Transport Selection', () {
      test('transportForDial should return self for circuit addresses', () {
        // Arrange
        final circuitAddr = MultiAddr(
          '/ip4/10.10.3.10/tcp/4001/p2p/12D3KooWRelayID/p2p-circuit/p2p/12D3KooWDestID',
        );

        // Act
        final transport = client.transportForDial(circuitAddr);

        // Assert
        expect(transport, equals(client));
      });

      test('transportForDial should return null for non-circuit addresses', () {
        // Arrange
        final directAddr = MultiAddr('/ip4/10.10.3.10/tcp/4001');

        // Act
        final transport = client.transportForDial(directAddr);

        // Assert
        expect(transport, isNull);
      });

      test('transportForListen should return self for circuit addresses', () {
        // Arrange
        final circuitAddr = MultiAddr(
          '/ip4/10.10.3.10/tcp/4001/p2p/12D3KooWRelayID/p2p-circuit',
        );

        // Act
        final transport = client.transportForListen(circuitAddr);

        // Assert
        expect(transport, equals(client));
      });
    });

    group('Error Handling', () {
      test('dial should throw on invalid circuit address format', () async {
        // Arrange - Invalid address missing components
        final invalidAddr = MultiAddr('/ip4/10.10.3.10/tcp/4001');

        // Act & Assert
        expect(
          () async => await client.dial(invalidAddr),
          throwsA(isA<ArgumentError>()),
        );
      });

      test('dial should throw when relay peer ID is missing', () async {
        // Arrange - Circuit address without relay ID
        final invalidAddr = MultiAddr('/ip4/10.10.3.10/tcp/4001/p2p-circuit');

        // Act & Assert
        expect(
          () async => await client.dial(invalidAddr),
          throwsA(isA<ArgumentError>()),
        );
      });

      test('should handle connection failures gracefully', () async {
        // Arrange
        final circuitAddr = MultiAddr(
          '/ip4/10.10.3.10/tcp/4001/p2p/12D3KooWRelayID/p2p-circuit/p2p/12D3KooWDestID',
        );

        // Mock host.newStream to fail
        when(mockHost.newStream(any, any, any))
            .thenThrow(Exception('Connection failed'));

        // Act & Assert - Should propagate error
        expect(
          () async => await client.dial(circuitAddr),
          throwsException,
        );
      });
    });

    group('Address Format Compliance', () {
      test('should validate IPv4 circuit addresses', () {
        final addr = MultiAddr(
          '/ip4/192.168.1.1/tcp/4001/p2p/12D3KooWRelay/p2p-circuit',
        );
        expect(client.canDial(addr), isTrue);
      });

      test('should validate IPv6 circuit addresses', () {
        final addr = MultiAddr(
          '/ip6/::1/tcp/4001/p2p/12D3KooWRelay/p2p-circuit',
        );
        expect(client.canDial(addr), isTrue);
      });

      test('should validate DNS circuit addresses', () {
        final addr = MultiAddr(
          '/dns4/relay.example.com/tcp/4001/p2p/12D3KooWRelay/p2p-circuit',
        );
        expect(client.canDial(addr), isTrue);
      });
    });

    group('Integration with Host', () {
      test('should access host peerstore correctly', () {
        // Arrange
        final mockPeerstore = MockPeerstore();
        when(mockHost.peerStore).thenReturn(mockPeerstore);

        // Act
        final result = client.peerstore;

        // Assert
        expect(result, equals(mockPeerstore));
        verify(mockHost.peerStore).called(1);
      });
    });

    group('Lifecycle Management', () {
      test('close should stop the client', () async {
        // Arrange - void methods don't need stubbing with mockito

        await client.start();

        // Act
        await client.close();

        // Assert
        verify(mockHost.removeStreamHandler(CircuitV2Protocol.protoIDv2Stop))
            .called(1);
      });

      test('should handle multiple start calls gracefully', () async {
        // Act - Start twice
        await client.start();
        await client.start();

        // Assert - Handler should be registered twice
        verify(mockHost.setStreamHandler(any, any)).called(2);
      });

      test('should handle stop before start gracefully', () async {
        // Act & Assert - Should not throw
        expect(() async => await client.stop(), returnsNormally);
      });
    });
  });
}
