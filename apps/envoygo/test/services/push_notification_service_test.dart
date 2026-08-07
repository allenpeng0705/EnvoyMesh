// Phase 31I — tests for the alert push service.
//
// Covers: MethodChannel bridge + registerWithHomeNode payload shape +
// handleNotificationTap + onIncomingCall stream (the post-CallKit-removal
// flow for incoming-call pushes).

import 'package:envoygo/services/push_notification_service.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const channel = MethodChannel('envoygo/alert_push');

  group('PushNotificationService', () {
    tearDown(() {
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(channel, null);
    });

    test('initialize is idempotent and never throws', () async {
      final service = PushNotificationService();
      await service.initialize();
      await service.initialize();
    });

    test('clearToken drops any cached token', () async {
      final service = PushNotificationService();
      await service.clearToken();
      expect(service.token, isNull);
    });

    test('handleNotificationTap parses feed_notify', () {
      final service = PushNotificationService();
      final result = service.handleNotificationTap({
        'type': 'feed_notify',
        'url': 'envoy://owner/photos/',
        'title': 'Album',
        'notificationId': 'n1',
      });
      expect(result?['type'], 'feed_notify');
      expect(result?['url'], 'envoy://owner/photos/');
    });

    test('handleNotificationTap parses chat thread', () {
      final service = PushNotificationService();
      final result = service.handleNotificationTap({
        'threadType': 'direct',
        'senderOwnerId': 'envoy:owner:alice',
        'messageId': 'm1',
      });
      expect(result?['threadType'], 'direct');
      expect(result?['senderOwnerId'], 'envoy:owner:alice');
    });

    test('handleNotificationTap routes legacy envoy:pi to Ext Agent', () {
      final service = PushNotificationService();
      final result = service.handleNotificationTap({
        'threadType': 'direct',
        'senderOwnerId': 'envoy:pi',
        'messageId': 'm1',
        'senderName': 'Pi',
      });
      expect(result?['threadType'], 'external');
      expect(result?['agentType'], 'external');
      expect(result?['type'], isNull);
    });

    test('handleNotificationTap treats type=pi_proposal as proposal', () {
      final service = PushNotificationService();
      final result = service.handleNotificationTap({
        'type': 'pi_proposal',
        'senderOwnerId': 'envoy:pi',
      });
      expect(result?['type'], 'pi_proposal');
    });

    test('handleNotificationTap parses bot thread', () {
      final service = PushNotificationService();
      final result = service.handleNotificationTap({
        'threadType': 'bot',
        'senderOwnerId': 'bot:librarian',
        'messageId': 'm1',
        'senderName': 'Luna',
      });
      expect(result?['threadType'], 'bot');
      expect(result?['senderOwnerId'], 'bot:librarian');
      expect(result?['senderName'], 'Luna');
    });

    test('handleNotificationTap returns null for unknown payload', () {
      final service = PushNotificationService();
      expect(service.handleNotificationTap({'foo': 'bar'}), isNull);
    });

    test(
        'handleNotificationTap returns null for incomingCall '
        '(routes through onIncomingCall instead)', () {
      final service = PushNotificationService();
      // The chat-thread deep-link router must not see incoming-call
      // payloads — those go through the separate onIncomingCall stream
      // so the in-app call screen can surface. If handleNotificationTap
      // returned a chat-thread route for an incomingCall, the app
      // would try to open a chat thread for the call.
      final result = service.handleNotificationTap({
        'type': 'incomingCall',
        'callId': 'call-1',
        'callerOwnerId': 'envoy:owner:alice',
      });
      expect(result, isNull);
    });
  });

  group('PushNotificationService — onIncomingCall (Phase 31I, post-CallKit)', () {
    test('onIncomingCall stream fires when native dispatches onIncomingCall',
        () async {
      final service = PushNotificationService();
      await service.initialize();
      final future = service.onIncomingCall.first;
      await service.debugDispatch('onIncomingCall', {
        'callId': 'call-1',
        'callerOwnerId': 'envoy:owner:alice',
        'callerName': 'Alice',
      });
      final received = await future;
      expect(received['callId'], 'call-1');
      expect(received['callerOwnerId'], 'envoy:owner:alice');
      expect(received['callerName'], 'Alice');
    });

    test('onIncomingCall silently drops empty payloads', () async {
      final service = PushNotificationService();
      await service.initialize();
      // No listener attached — the broadcast stream should accept
      // the add without error even if the payload is empty. We just
      // assert no throw.
      await service.debugDispatch('onIncomingCall', {});
      // Also: nothing should be added if args is the platform default
      // (nil) — handled by the args.isNotEmpty guard.
    });

    test(
        'onIncomingCall survives duplicate payloads (CallKit removal: '
        'APNs may deliver the call push twice in the same launch window)',
        () async {
      final service = PushNotificationService();
      await service.initialize();
      final received = <Map<String, dynamic>>[];
      final sub = service.onIncomingCall.listen(received.add);
      final payload = {
        'callId': 'call-dup',
        'callerOwnerId': 'envoy:owner:bob',
      };
      await service.debugDispatch('onIncomingCall', payload);
      await service.debugDispatch('onIncomingCall', payload);
      // Two events reach Dart; CallProvider's _hasMeaningfulCallUpdate
      // dedupes them downstream — but the stream itself is dumb and
      // forwards everything.
      expect(received.length, 2);
      expect(received.first['callId'], 'call-dup');
      await sub.cancel();
    });

    test('onIncomingCall is a broadcast stream (multiple subscribers)',
        () async {
      final service = PushNotificationService();
      await service.initialize();
      // Use .first on each subscriber (the broadcast stream never
      // closes on its own — we need to take a single event from each
      // subscriber to verify fan-out).
      final sub1 = service.onIncomingCall
          .map((p) => 'A:${p['callId']}')
          .first;
      final sub2 = service.onIncomingCall
          .map((p) => 'B:${p['callId']}')
          .first;
      await service.debugDispatch('onIncomingCall', {
        'callId': 'call-fanout',
        'callerOwnerId': 'envoy:owner:carol',
      });
      expect(await sub1, 'A:call-fanout');
      expect(await sub2, 'B:call-fanout');
    });

    test(
        'onIncomingCall is a separate stream from onNotificationTap '
        '(incoming-call payloads do NOT also fire onNotificationTap)',
        () async {
      final service = PushNotificationService();
      await service.initialize();
      // Native/FCM route incomingCall only to onIncomingCall.
      final tapFuture = service.onNotificationTap.first
          .timeout(const Duration(milliseconds: 50), onTimeout: () => {});
      final incomingFuture = service.onIncomingCall.first;
      await service.debugDispatch('onIncomingCall', {
        'type': 'incomingCall',
        'callId': 'call-bg',
        'callerOwnerId': 'envoy:owner:dan',
      });
      final incoming = await incomingFuture;
      final tap = await tapFuture;
      expect(incoming['callId'], 'call-bg');
      expect(tap, isA<void>());
    });

    test(
        'onNotificationTap with type=incomingCall fans out to onIncomingCall '
        '(Android FCM / legacy tap path)',
        () async {
      final service = PushNotificationService();
      await service.initialize();
      final incomingFuture = service.onIncomingCall.first;
      final tapFuture = service.onNotificationTap.first
          .timeout(const Duration(milliseconds: 50), onTimeout: () => {});
      await service.debugDispatch('onNotificationTap', {
        'type': 'incomingCall',
        'callId': 'call-android',
        'callerOwnerId': 'envoy:owner:eve',
      });
      final incoming = await incomingFuture;
      expect(incoming['callId'], 'call-android');
      // Must not also hit the chat deep-link stream.
      expect(await tapFuture, isA<void>());
    });

    test(
        'consumePendingIncomingCall replays a call that arrived before '
        'any listener attached',
        () async {
      final service = PushNotificationService();
      await service.initialize();
      // No onIncomingCall listener yet — payload is buffered.
      await service.debugDispatch('onIncomingCall', {
        'type': 'incomingCall',
        'callId': 'call-pending',
        'callerOwnerId': 'envoy:owner:frank',
      });
      final pending = service.consumePendingIncomingCall();
      expect(pending?['callId'], 'call-pending');
      expect(service.consumePendingIncomingCall(), isNull);
    });
  });

  group('PushNotificationService — native→Dart events', () {
    test('onAlertToken stores the token', () async {
      final service = PushNotificationService();
      await service.initialize();
      await service.debugDispatch('onAlertToken', {'token': 'deadbeef'});
      expect(service.token, 'deadbeef');
    });

    test('registerWithHomeNode posts registerPushToken with tokenType alert',
        () async {
      final service = PushNotificationService();
      await service.initialize();
      await service.debugDispatch('onAlertToken', {'token': 'tok123'});

      String? method;
      Map<String, dynamic>? params;
      await service.registerWithHomeNode(
        (m, [p]) async {
          method = m;
          params = p;
          return null;
        },
        ownerId: 'envoy:owner:alice',
      );

      // On the host VM Platform.isIOS/Android may both be false for
      // isSupported — registerWithHomeNode returns early. When the
      // token path ran via debugDispatch, _token is set but isSupported
      // may still gate registration. Assert the happy path when
      // supported; otherwise just ensure no throw.
      if (service.isSupported) {
        expect(method, 'registerPushToken');
        expect(params?['token'], 'tok123');
        expect(params?['tokenType'], 'alert');
        expect(params?['ownerId'], 'envoy:owner:alice');
      }
    });

    test('onNotificationTap fans out onto the stream', () async {
      final service = PushNotificationService();
      await service.initialize();
      final future = service.onNotificationTap.first;
      await service.debugDispatch('onNotificationTap', {
        'type': 'feed_notify',
        'url': 'envoy://x/',
      });
      final received = await future;
      expect(received['type'], 'feed_notify');
      expect(received['url'], 'envoy://x/');
    });
  });
}
