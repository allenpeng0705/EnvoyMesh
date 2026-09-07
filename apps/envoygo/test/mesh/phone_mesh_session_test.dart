import 'package:envoygo/mesh/phone_mesh_session.dart';
import 'package:envoygo/services/libp2p_node.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:envoy_mesh/envoy_mesh.dart';

class FakeLibp2pMeshHost implements Libp2pMeshHost {
  FakeLibp2pMeshHost({this.started = true, this.epoch = 1});

  bool started;
  int epoch;
  final Set<String> _protocols = {};
  final Map<String, Libp2pStreamHandler> handlers = {};
  String? _reserved;
  final List<String> reserveCalls = [];
  int releaseCount = 0;
  Object? reserveError;

  @override
  bool get isStarted => started;

  @override
  int get hostEpoch => epoch;

  @override
  Set<String> get registeredProtocols => Set.unmodifiable(_protocols);

  @override
  String? get reservedRelayPeerId => _reserved;

  @override
  void registerStreamHandler(String protocolId, Libp2pStreamHandler handler) {
    handlers[protocolId] = handler;
    _protocols.add(protocolId);
  }

  @override
  void removeStreamHandler(String protocolId) {
    handlers.remove(protocolId);
    _protocols.remove(protocolId);
  }

  @override
  Future<void> reserveRelay(String relayMultiaddr) async {
    reserveCalls.add(relayMultiaddr);
    if (reserveError != null) throw reserveError!;
    _reserved = peerIdFromBootstrapMultiaddr(relayMultiaddr);
  }

  @override
  Future<void> releaseRelayReservation() async {
    releaseCount++;
    _reserved = null;
  }
}

void main() {
  group('PhoneMeshSession', () {
    test('enable registers message+chat handlers and reserves relay', () async {
      final host = FakeLibp2pMeshHost();
      final session = PhoneMeshSession(host);
      var calls = 0;

      await session.enable(
        onStream: (stream, peer, protocol) async {
          calls++;
        },
      );

      expect(session.isActive, isTrue);
      expect(
        host.registeredProtocols,
        containsAll([envoyMessageProtocol, envoyChatProtocol]),
      );
      expect(host.reserveCalls, [defaultEnvoyCommunityRelayBootstrapAddr]);
      expect(
        session.reservedRelayPeerId,
        '12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo',
      );
      expect(calls, 0);
    });

    test('enable throws if host not started', () async {
      final host = FakeLibp2pMeshHost(started: false);
      final session = PhoneMeshSession(host);
      expect(
        () => session.enable(onStream: (_, __, ___) async {}),
        throwsStateError,
      );
    });

    test('enable without reserve skips reserveRelay', () async {
      final host = FakeLibp2pMeshHost();
      final session = PhoneMeshSession(host);
      await session.enable(
        onStream: (_, __, ___) async {},
        reserveRelay: false,
      );
      expect(host.reserveCalls, isEmpty);
      expect(session.isActive, isTrue);
      expect(host.registeredProtocols, hasLength(2));
    });

    test('isActive becomes false when host epoch changes', () async {
      final host = FakeLibp2pMeshHost(epoch: 1);
      final session = PhoneMeshSession(host);
      await session.enable(
        onStream: (_, __, ___) async {},
        reserveRelay: false,
      );
      expect(session.isActive, isTrue);
      host.epoch = 2;
      expect(session.isActive, isFalse);
    });

    test('reserve failure still leaves handlers active', () async {
      final host = FakeLibp2pMeshHost()..reserveError = Exception('offline');
      final session = PhoneMeshSession(host);
      await session.enable(onStream: (_, __, ___) async {});
      expect(session.isActive, isTrue);
      expect(host.registeredProtocols, hasLength(2));
      expect(session.reservedRelayPeerId, isNull);
    });

    test('disable removes handlers and releases reservation', () async {
      final host = FakeLibp2pMeshHost();
      final session = PhoneMeshSession(host);
      await session.enable(onStream: (_, __, ___) async {});
      await session.disable();

      expect(session.isActive, isFalse);
      expect(host.registeredProtocols, isEmpty);
      expect(host.releaseCount, 1);
      expect(session.reservedRelayPeerId, isNull);
      expect(host.reservedRelayPeerId, isNull);
    });

    test('disable is safe when never enabled', () async {
      final host = FakeLibp2pMeshHost();
      final session = PhoneMeshSession(host);
      await session.disable();
      expect(host.releaseCount, 1);
      expect(session.isActive, isFalse);
    });
  });
}
