import 'dart:convert';
import 'package:envoy_thin_client/services/platform_web_socket.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PlatformWebSocket early-frame buffer', () {
    test('buffers frames until onMessage is assigned, then flushes', () {
      final ws = PlatformWebSocket.forTest();
      final received = <String>[];

      // Home can push `connected` before HomeRemoteClient installs handlers.
      ws.deliverForTest(jsonEncode({
        'event': 'connected',
        'data': {'peerId': '12D3KooWtest'},
      }));
      ws.deliverForTest(jsonEncode({
        'id': '1',
        'result': {'ok': true},
      }));
      expect(received, isEmpty);

      ws.onMessage = (event) => received.add(event.data);

      expect(received, hasLength(2));
      expect(jsonDecode(received[0]), containsPair('event', 'connected'));
      expect(jsonDecode(received[1]), containsPair('id', '1'));
    });

    test('delivers live frames after onMessage is set', () {
      final ws = PlatformWebSocket.forTest();
      final received = <String>[];
      ws.onMessage = (event) => received.add(event.data);

      ws.deliverForTest('{"event":"ping"}');
      expect(received, ['{"event":"ping"}']);
    });

    test('clearing onMessage stops delivery; reassignment does not replay cleared buffer',
        () {
      final ws = PlatformWebSocket.forTest();
      final received = <String>[];
      ws.onMessage = (event) => received.add(event.data);
      ws.onMessage = null;
      ws.deliverForTest('{"event":"connected"}');
      ws.onMessage = (event) => received.add(event.data);
      expect(received, ['{"event":"connected"}']);
    });
  });
}
