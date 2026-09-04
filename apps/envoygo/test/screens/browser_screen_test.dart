import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:envoygo/models/library_read.dart';
import 'package:envoygo/providers/contact_provider.dart';
import 'package:envoygo/screens/browser/browser_screen.dart';
import 'package:envoygo/services/home_remote_client.dart';
import 'package:envoygo/services/node_service_client.dart';
import 'package:envoygo/services/web_socket_like.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

/// Controllable mock WebSocket for BrowserScreen widget tests.
class _MockWs implements WebSocketLike {
  @override
  int readyState = wsConnecting;

  @override
  void Function()? onOpen;

  @override
  void Function(WsMessageEvent event)? onMessage;

  @override
  void Function()? onClose;

  @override
  void Function()? onError;

  final List<String> sentMessages = [];

  void simulateOpen() {
    readyState = wsOpen;
    onOpen?.call();
  }

  void simulateMessage(Map<String, dynamic> msg) {
    onMessage?.call(WsMessageEvent(jsonEncode(msg)));
  }

  @override
  void send(String data) {
    sentMessages.add(data);
  }

  @override
  void close() {
    readyState = wsClosed;
  }
}

Future<NodeServiceClient> _connectClient(_MockWs tracked) async {
  final client = HomeRemoteClient(
    HomeRemoteClientOptions(
      resolveCandidates: () async => const [
        HomeRemoteCandidate(name: 'relay', url: 'wss://relay.example.com'),
      ],
      createTransport: (_) => tracked,
      onHomeOnlineChange: (_) {},
      onActiveTransportChange: (_) {},
      perCandidateTimeoutMs: 1000,
      initialReconnectDelayMs: 1000,
      upgradeSweepMs: 0,
    ),
  );
  final future = client.ensureConnected();
  await Future.delayed(Duration.zero);
  tracked.simulateOpen();
  tracked.simulateMessage({'event': 'connected'});
  await future;
  return NodeServiceClient(client);
}

void main() {
  testWidgets('BrowserScreen loads markdown via libraryRead', (tester) async {
    final mock = _MockWs();
    late NodeServiceClient nodeClient;
    await tester.runAsync(() async {
      nodeClient = await _connectClient(mock);
    });

    const body = '# Hello from Alice';
    final hash = sha256.convert(utf8.encode(body)).toString();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          nodeServiceProvider.overrideWith((ref) => nodeClient),
        ],
        child: const MaterialApp(home: BrowserScreen()),
      ),
    );
    await tester.pump();

    expect(find.textContaining('Enter an envoy:// URL'), findsOneWidget);

    await tester.enterText(
      find.byType(TextField),
      'envoy://envoy:owner:alice/hello.md',
    );
    await tester.pump();

    await tester.tap(find.text('Go'));
    await tester.pump();

    // HomeRemoteClient RPC uses real async; drive it off the fake clock.
    await tester.runAsync(() async {
      await Future<void>.delayed(Duration.zero);
      expect(mock.sentMessages, isNotEmpty);
      final sent = jsonDecode(mock.sentMessages.last) as Map<String, dynamic>;
      expect(sent['method'], 'libraryRead');
      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'peerOwnerId': 'envoy:owner:alice',
          'libp2pPeerId': '12D3',
          'status': 'ok',
          'body': body,
          'contentType': 'text/markdown',
          'contentHash': hash,
          'byteLength': body.length,
          'etag': hash.substring(0, 16),
          'latencyMs': 5,
        },
      });
      await Future<void>.delayed(Duration.zero);
    });

    // Rebuild after setState — avoid pumpAndSettle (progress indicator).
    await tester.pump();

    expect(find.textContaining('Hello from Alice'), findsWidgets);
    expect(find.textContaining('Loaded — text/markdown'), findsOneWidget);
  });

  testWidgets('BrowserScreen shows parse error for bad URL', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          nodeServiceProvider.overrideWith((ref) => null),
        ],
        child: const MaterialApp(home: BrowserScreen()),
      ),
    );
    await tester.enterText(find.byType(TextField), 'envoy:///no-owner');
    await tester.pump();
    expect(find.textContaining('Malformed'), findsOneWidget);
    expect(
      tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Go')).onPressed,
      isNull,
    );
  });

  testWidgets('BrowserScreen refuses render when contentHash mismatches',
      (tester) async {
    final mock = _MockWs();
    late NodeServiceClient nodeClient;
    await tester.runAsync(() async {
      nodeClient = await _connectClient(mock);
    });
    const body = '# Tampered';

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          nodeServiceProvider.overrideWith((ref) => nodeClient),
        ],
        child: const MaterialApp(home: BrowserScreen()),
      ),
    );
    await tester.enterText(
      find.byType(TextField),
      'envoy://envoy:owner:alice/hello.md',
    );
    await tester.pump();
    await tester.tap(find.text('Go'));
    await tester.pump();

    await tester.runAsync(() async {
      await Future<void>.delayed(Duration.zero);
      final sent = jsonDecode(mock.sentMessages.last) as Map<String, dynamic>;
      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'peerOwnerId': 'envoy:owner:alice',
          'libp2pPeerId': '12D3',
          'status': 'ok',
          'body': body,
          'contentType': 'text/markdown',
          'contentHash': '0' * 64,
          'byteLength': body.length,
          'etag': 'bad',
          'latencyMs': 1,
        },
      });
      await Future<void>.delayed(Duration.zero);
    });
    await tester.pump();

    expect(find.textContaining('integrity check failed'), findsOneWidget);
    expect(find.textContaining('Tampered'), findsNothing);
  });

  testWidgets('BrowserScreen shows placeholder when remote blog is missing',
      (tester) async {
    final mock = _MockWs();
    late NodeServiceClient nodeClient;
    await tester.runAsync(() async {
      nodeClient = await _connectClient(mock);
    });

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          nodeServiceProvider.overrideWith((ref) => nodeClient),
        ],
        child: const MaterialApp(home: BrowserScreen()),
      ),
    );
    await tester.pump();

    await tester.enterText(
      find.byType(TextField),
      'envoy://envoy:owner:bob/blog/',
    );
    await tester.pump();
    await tester.tap(find.text('Go'));
    await tester.pump();

    await tester.runAsync(() async {
      await Future<void>.delayed(Duration.zero);
      final sent = jsonDecode(mock.sentMessages.last) as Map<String, dynamic>;
      mock.simulateMessage({
        'id': sent['id'],
        'result': {
          'peerOwnerId': 'envoy:owner:bob',
          'libp2pPeerId': '12D3',
          'status': 'not_found',
          'error': 'not found',
          'latencyMs': 5,
        },
      });
      await Future<void>.delayed(Duration.zero);
    });
    await tester.pump();

    expect(find.textContaining('hasn’t published any blog posts'), findsWidgets);
    expect(find.textContaining('placeholder page'), findsOneWidget);
  });

  test('LibraryReadResult.fromJson rejects missing status', () {
    expect(
      () => LibraryReadResult.fromJson({'peerOwnerId': 'x'}),
      throwsA(isA<FormatException>()),
    );
  });
}
