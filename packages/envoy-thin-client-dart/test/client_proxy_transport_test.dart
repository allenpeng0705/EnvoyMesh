// The relay proxy transport's own handshake bound, and the framing of what it sends.
//
// A connect timeout and a handshake timeout are different waits: `channel.ready` resolving means the
// socket is open, while `proxy-accept` only arrives once the relay's home has accepted the stream. A
// relay that opens the socket and then never answers used to leave the caller's timeout to move on
// — but the caller cannot close the channel this class owns, so every abandoned dial leaked a live
// socket and one of the relay's capped connection slots. These tests pin both halves: the wait ends,
// and the socket is closed when it does.
//
// The framing test is the same class of bug one layer further in: the relay forwards the client's
// text frames verbatim into the home's libp2p stream, and the home splits that stream on `\n`. An
// unframed write is an incomplete frame there — a hang, not a parse error.

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:envoy_thin_client/services/client_proxy_transport.dart';
import 'package:envoy_thin_client/services/mesh_frame.dart';
import 'package:test/test.dart';

Future<HttpServer> silentRelay(void Function() onSocketDone) async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.listen((request) async {
    if (!WebSocketTransformer.isUpgradeRequest(request)) return;
    final socket = await WebSocketTransformer.upgrade(request);
    socket.listen((_) {}, onDone: onSocketDone);
  });
  return server;
}

void main() {
  test('a relay that never answers the handshake times out and closes the socket', () async {
    final socketClosed = Completer<void>();
    final server = await silentRelay(() {
      if (!socketClosed.isCompleted) socketClosed.complete();
    });
    addTearDown(() => server.close(force: true));

    final stopwatch = Stopwatch()..start();
    await expectLater(
      ClientProxyTransport.connect(
        relayWsUrl: 'ws://127.0.0.1:${server.port}/ws',
        homePeerId: '12D3KooWhome',
        sessionToken: 'tok',
        handshakeTimeout: const Duration(milliseconds: 200),
      ),
      throwsA(isA<TimeoutException>()),
    );
    stopwatch.stop();

    expect(stopwatch.elapsed, lessThan(const Duration(seconds: 3)));
    // The load-bearing half: the transport, not the caller, closes the socket it opened.
    await socketClosed.future.timeout(const Duration(seconds: 3));
  });

  test('frameMeshMessage appends the delimiter the home splits on', () {
    expect(frameMeshMessage('{"id":"1"}'), '{"id":"1"}\n');
    expect(kMeshFrameDelimiter, '\n');
  });

  test('every send reaches a newline-splitting home as a complete frame', () async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    // The home's view: one byte stream, split on the delimiter. A relay forwards the client's text
    // frames verbatim, so this is what the home's `splitFrames` sees.
    var pending = '';
    server.listen((request) async {
      if (!WebSocketTransformer.isUpgradeRequest(request)) return;
      final socket = await WebSocketTransformer.upgrade(request);
      var answeredHandshake = false;
      socket.listen((data) {
        final text = data is String ? data : String.fromCharCodes(data as List<int>);
        // The relay's own handshake answer. The relay->client direction is WebSocket messages whose
        // boundaries are preserved, so it needs no delimiter.
        if (!answeredHandshake) {
          answeredHandshake = true;
          socket.add(jsonEncode({'type': 'proxy-accept'}));
        }
        // The relay->home direction is a raw byte stream: concatenate, then split.
        pending += text;
        var at = pending.indexOf('\n');
        while (at >= 0) {
          final frame = pending.substring(0, at).trim();
          pending = pending.substring(at + 1);
          at = pending.indexOf('\n');
          if (frame.isEmpty) continue;
          final message = jsonDecode(frame) as Map<String, dynamic>;
          if (message['method'] == 'coder.hello') {
            socket.add('${jsonEncode({'id': message['id'], 'result': {'ok': true}})}\n');
          }
        }
      });
    });
    addTearDown(() => server.close(force: true));

    final transport = await ClientProxyTransport.connect(
      relayWsUrl: 'ws://127.0.0.1:${server.port}/ws',
      homePeerId: '12D3KooWhome',
      sessionToken: 'tok',
      handshakeTimeout: const Duration(seconds: 2),
    );
    addTearDown(transport.close);

    final got = Completer<Map<String, dynamic>>();
    transport.onMessage = (event) {
      final message = jsonDecode(event.data) as Map<String, dynamic>;
      if (message['id'] == '1' && !got.isCompleted) got.complete(message);
    };
    transport.send(jsonEncode({'id': '1', 'method': 'coder.hello', 'params': <String, dynamic>{}}));

    // Without the delimiter the home never extracts a frame, so this never completes.
    final answer = await got.future.timeout(const Duration(seconds: 2));
    expect(answer['result'], {'ok': true});
  });
}
