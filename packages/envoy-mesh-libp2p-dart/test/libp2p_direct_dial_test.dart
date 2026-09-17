// A direct libp2p dial, proved against two real hosts on loopback.
//
// The rung this covers is only worth having if it dials: a candidate that a screen names and a
// transport cannot open is the repository's own definition of a capability claim the code does not
// provide. So this test starts a real `Libp2pNode` as the home, registers the client-proxy protocol
// on it, and drives the exact path a phone takes — `connectPeer`, `dial`, `performHandshake`, then
// JSON-RPC over the stream.
//
// It binds loopback and not a LAN address on purpose: `connectPeer` seeds the peerstore directly
// because `BasicHost.connect` runs addresses through the host's `addrsFactory`, which drops loopback
// (see the method's doc). Loopback is also the address a daemon reached through an SSH forward is
// dialled at, so this is not only a test convenience.

import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:envoy_mesh_libp2p/envoy_mesh_libp2p.dart';
import 'package:envoy_mesh_libp2p/src/mesh_framing.dart';
import 'package:test/test.dart';

Future<int> _freePort() async {
  final socket = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
  final port = socket.port;
  await socket.close();
  return port;
}

Uint8List _frame(String text) =>
    Uint8List.fromList(utf8.encode(frameMessage(text)));

/// The next whole frame from [stream], buffered across reads.
Future<String> _nextFrame(MeshFrameBuffer buffer, P2PStream<dynamic> stream) async {
  while (true) {
    final frames = buffer.add(await stream.read());
    if (frames.isNotEmpty) return frames.first;
  }
}

void main() {
  late Libp2pNode home;
  late Libp2pNode phone;
  late String homeAddr;

  setUp(() async {
    final port = await _freePort();
    home = Libp2pNode(seedStore: MemoryLibp2pSeedStore());
    phone = Libp2pNode(seedStore: MemoryLibp2pSeedStore());
    await home.start(
      listenAddrs: ['/ip4/127.0.0.1/tcp/$port'],
      enableRelay: false,
    );
    await phone.start(enableRelay: false);
    homeAddr = '/ip4/127.0.0.1/tcp/$port/p2p/${home.peerId}';
  });

  tearDown(() async {
    await phone.stop();
    await home.stop();
  });

  test('connectPeer opens a real connection, and dial opens a stream on it', () async {
    const protocol = '/envoymesh/test/echo/1.0.0';
    home.registerStreamHandler(protocol, (stream, remote) async {
      stream.write(await stream.read());
      await stream.close();
    });

    expect(await phone.connectPeer(homeAddr), isTrue);

    final transport = await phone.dial(peerMultiaddr: homeAddr, protocolId: protocol);
    transport.markImmediatelyOpen();
    final got = Completer<String>();
    transport.onMessage = (event) => got.complete(event.data);
    transport.send('hello');

    expect(await got.future.timeout(const Duration(seconds: 10)), 'hello');
  }, timeout: const Timeout(Duration(seconds: 60)));

  test('the client-proxy handshake and a JSON-RPC round trip ride that stream', () async {
    // The home answers the way the daemon's mesh transport does: accept the proxy-connect, then
    // serve one RPC.
    final handshake = Completer<Map<String, dynamic>>();
    home.registerStreamHandler(kClientProxyProtocol, (stream, remote) async {
      final buffer = MeshFrameBuffer();
      final connect =
          jsonDecode(await _nextFrame(buffer, stream)) as Map<String, dynamic>;
      handshake.complete(connect);
      stream.write(_frame(jsonEncode({'type': 'proxy-accept'})));
      final rpc =
          jsonDecode(await _nextFrame(buffer, stream)) as Map<String, dynamic>;
      stream.write(_frame(jsonEncode({
        'id': rpc['id'],
        'result': {'product': 'EnvoyDev'},
      })));
      await stream.close();
    });

    expect(await phone.connectPeer(homeAddr), isTrue);
    final transport = await phone.dial(
      peerMultiaddr: homeAddr,
      protocolId: kClientProxyProtocol,
    );

    final connected = Completer<void>();
    final reply = Completer<String>();
    transport.onMessage = (event) {
      final message = jsonDecode(event.data) as Map<String, dynamic>;
      if (message['event'] == 'connected') {
        if (!connected.isCompleted) connected.complete();
        return;
      }
      if (message['id'] != null && !reply.isCompleted) reply.complete(event.data);
    };
    transport.onOpen = () {
      if (!connected.isCompleted) connected.complete();
    };

    await transport.performHandshake('tok');
    await connected.future.timeout(const Duration(seconds: 10));
    // `HomeRemoteClient` is only ready for RPC once the `connected` event has landed — that is the
    // gate the transport re-emits after the handshake consumed the home's own ready signal.
    transport.send(jsonEncode({'id': 'rpc_1', 'method': 'coder.hello', 'params': {}}));

    final decoded =
        jsonDecode(await reply.future.timeout(const Duration(seconds: 10)))
            as Map<String, dynamic>;
    expect(decoded['result'], {'product': 'EnvoyDev'});
    expect(await handshake.future, {'type': 'proxy-connect', 'token': 'tok'});
  }, timeout: const Timeout(Duration(seconds: 60)));
}
