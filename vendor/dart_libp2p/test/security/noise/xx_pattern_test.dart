import 'dart:convert';
import 'dart:typed_data';
import 'package:test/test.dart';
import 'package:cryptography/cryptography.dart';
import 'package:dart_libp2p/p2p/security/noise/xx_pattern.dart';
import 'package:dart_libp2p/p2p/security/noise/handshake_state.dart';

void main() {
  group('NoiseXXPattern', () {
    late SimpleKeyPair initiatorStatic;
    late SimpleKeyPair responderStatic;
    late SimpleKeyPair initiatorEphemeral;
    late SimpleKeyPair responderEphemeral;
    late NoiseXXPattern initiator;
    late NoiseXXPattern responder;

    setUp(() async {
      // Generate static and ephemeral keys for both parties
      final algorithm = X25519();
      initiatorStatic = await algorithm.newKeyPair();
      responderStatic = await algorithm.newKeyPair();
      initiatorEphemeral = await algorithm.newKeyPair();
      responderEphemeral = await algorithm.newKeyPair();

      // Create pattern instances
      initiator = await NoiseXXPattern.create(true, initiatorStatic);
      responder = await NoiseXXPattern.create(false, responderStatic);
    });

    test('validates protocol name', () {
      // The protocol name must be exactly Noise_XX_25519_ChaChaPoly_SHA256
      // This is required by the Noise Protocol Framework specification
      expect(
        NoiseXXPattern.PROTOCOL_NAME,
        equals('Noise_XX_25519_ChaChaPoly_SHA256'),
        reason: 'Protocol name must match Noise specification exactly',
      );
      
      // Verify it contains only printable ASCII characters
      final protocolBytes = utf8.encode(NoiseXXPattern.PROTOCOL_NAME);
      expect(
        protocolBytes.every((b) => b >= 32 && b <= 126),
        isTrue,
        reason: 'Protocol name must contain only printable ASCII characters',
      );
      
      // Verify length matches specification
      expect(
        protocolBytes.length,
        equals(utf8.encode('Noise_XX_25519_ChaChaPoly_SHA256').length),
        reason: 'Protocol name must have correct length',
      );
    });

    // test('validates protocol name during initialization', () async {
    //   final algorithm = X25519();
    //   final staticKey = await algorithm.newKeyPair();
    //
    //   // Try to create a pattern with wrong protocol name
    //   // This should fail during initialization
    //   expect(
    //     () async {
    //       final pattern = await NoiseXXPattern.create(false, staticKey);
    //       // Force reinitialization to trigger validation
    //       await pattern.debugInitSymmetricState();
    //     },
    //     throwsA(
    //       predicate((e) => e is StateError &&
    //         e.toString().contains('Invalid protocol name'))
    //     ),
    //   );
    // });

    test('initial state is correct', () {
      expect(initiator.state, equals(XXHandshakeState.initial));
      expect(responder.state, equals(XXHandshakeState.initial));
      expect(initiator.isComplete, isFalse);
      expect(responder.isComplete, isFalse);
    });

    test('handshake follows XX pattern sequence', () async {
      // -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      expect(initiator.state, equals(XXHandshakeState.sentE));
      await responder.readMessage(message1);
      expect(responder.state, equals(XXHandshakeState.sentE));

      // <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      expect(responder.state, equals(XXHandshakeState.sentEES));
      await initiator.readMessage(message2);
      expect(initiator.state, equals(XXHandshakeState.sentEES));

      // -> s, se
      final message3 = await initiator.writeMessage(Uint8List(0));
      expect(initiator.state, equals(XXHandshakeState.complete));
      await responder.readMessage(message3);
      expect(responder.state, equals(XXHandshakeState.complete));

      // Verify both sides completed
      expect(initiator.isComplete, isTrue);
      expect(responder.isComplete, isTrue);
    });

    test('derived keys allow bidirectional communication', () async {
      // Complete handshake
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // Verify keys were derived
      expect(initiator.sendKey, isNotNull);
      expect(initiator.recvKey, isNotNull);
      expect(responder.sendKey, isNotNull);
      expect(responder.recvKey, isNotNull);

      // Verify initiator's send key matches responder's receive key
      final initiatorSendKey = await initiator.sendKey.extractBytes();
      final responderRecvKey = await responder.recvKey.extractBytes();
      expect(initiatorSendKey, equals(responderRecvKey));

      // Verify responder's send key matches initiator's receive key
      final responderSendKey = await responder.sendKey.extractBytes();
      final initiatorRecvKey = await initiator.recvKey.extractBytes();
      expect(responderSendKey, equals(initiatorRecvKey));
    });

    test('exchanges static public keys correctly', () async {
      // Complete handshake
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // Verify exchanged static keys
      final initiatorStaticPub = await initiator.getStaticPublicKey();
      final responderStaticPub = await responder.getStaticPublicKey();
      
      expect(initiator.remoteStaticKey, equals(responderStaticPub));
      expect(responder.remoteStaticKey, equals(initiatorStaticPub));
    });

    test('fails if messages sent in wrong order', () async {
      // Try to send responder's message first
      expect(
        () => responder.writeMessage(Uint8List(0)),
        throwsA(isA<StateError>()),
      );

      // Try to send initiator's second message before first
      final message1 = await initiator.writeMessage(Uint8List(0));
      expect(
        () => initiator.writeMessage(Uint8List(0)),
        throwsA(isA<StateError>()),
      );
    });

    test('fails if messages received in wrong order', () async {
      // According to Noise spec, XX pattern is:
      // -> e
      // <- e, ee, s, es
      // -> s, se

      // Initiator cannot read first (must send e first)
      expect(
        () => initiator.readMessage(Uint8List(0)),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Initiator cannot read first message'
        )),
      );

      // Responder cannot write first (must receive e first)
      expect(
        () => responder.writeMessage(Uint8List(0)),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Responder cannot write first message'
        )),
      );

      // Complete first message exchange
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);

      // Initiator cannot write again before reading responder's message
      expect(
        () => initiator.writeMessage(Uint8List(0)),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Initiator cannot write second message'
        )),
      );

      // Responder cannot read before sending its message
      expect(
        () => responder.readMessage(Uint8List(0)),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Responder cannot receive second message'
        )),
      );
    });

    test('completes handshake with payload', () async {
      // Complete handshake with payload
      final payload = Uint8List.fromList([1, 2, 3, 4, 5]);
      
      // -> e
      final message1 = await initiator.writeMessage(payload);
      await responder.readMessage(message1);
      
      // <- e, ee, s, es
      final message2 = await responder.writeMessage(payload);
      await initiator.readMessage(message2);
      
      // -> s, se
      final message3 = await initiator.writeMessage(payload);
      await responder.readMessage(message3);
      
      // Verify handshake completed
      expect(initiator.isComplete, isTrue);
      expect(responder.isComplete, isTrue);
      
      // Verify keys were derived
      expect(initiator.sendKey, isNotNull);
      expect(initiator.recvKey, isNotNull);
      expect(responder.sendKey, isNotNull);
      expect(responder.recvKey, isNotNull);
    });

    test('fails if message is too short for ephemeral key', () async {
      // Complete first message exchange to get into a state where we can decrypt
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));

      // Try to process a message that's too short to contain ephemeral key
      final shortMessage = Uint8List(8); // Need 32 bytes for ephemeral key
      expect(
        () => initiator.readMessage(shortMessage),
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Message too short to contain ephemeral key'))
        ),
      );
    });

    test('fails if message is too short for static key', () async {
      // Complete first message exchange to get into a state where we can decrypt
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));

      // Create a message that's long enough for ephemeral key but not static key
      final shortMessage = Uint8List(40); // Has 32 bytes for ephemeral key
      shortMessage.fillRange(0, 32, 0x42); // Fill with dummy ephemeral key
      
      expect(
        () => initiator.readMessage(shortMessage),
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Message too short to contain encrypted static key'))
        ),
      );
    });

    test('fails if message is too short for MAC', () async {
      // Complete first two messages to get into sentEES state
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);

      // Create a message that's long enough for static key but not MAC
      final shortMessage = Uint8List(32); // Just enough for static key
      shortMessage.fillRange(0, 32, 0x42); // Fill with dummy static key
      
      expect(
        () => responder.readMessage(shortMessage),
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Final message too short: 32 < 48 (needs 32 bytes encrypted static key + 16 bytes MAC)'))
        ),
      );
    });

    test('fails if keys are accessed before initialization', () async {
      // Create a new pattern instance
      final algorithm = X25519();
      final staticKey = await algorithm.newKeyPair();
      final pattern = await NoiseXXPattern.create(true, staticKey);

      // Reset the keys to null to simulate uninitialized state
      pattern.sendKey; // This should succeed
      pattern.recvKey; // This should succeed

      // Verify that the keys are temporary and not the final handshake keys
      final sendKey1 = await pattern.sendKey.extractBytes();
      final sendKey2 = await pattern.sendKey.extractBytes();
      expect(sendKey1, equals(sendKey2), reason: 'Keys should be stable before handshake');

      // Complete handshake
      final message1 = await pattern.writeMessage(Uint8List(0));
      final responder = await NoiseXXPattern.create(false, staticKey);
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await pattern.readMessage(message2);
      final message3 = await pattern.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // Verify that the keys have changed
      final sendKey3 = await pattern.sendKey.extractBytes();
      expect(sendKey1, isNot(equals(sendKey3)), reason: 'Keys should change after handshake');
    });

    test('fails if remote static key is accessed before handshake completion', () {
      expect(
        () => initiator.remoteStaticKey,
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Remote static key not available'))
        ),
      );
    });

    test('verifies message integrity', () async {
      // Complete first message exchange
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);

      // Send message with additional authenticated data
      final message2 = await responder.writeMessage(Uint8List(0));

      // Corrupt the message
      final corruptedMessage = Uint8List.fromList(message2);
      corruptedMessage[corruptedMessage.length - 1] ^= 0xFF; // Flip last byte

      expect(
        () => initiator.readMessage(corruptedMessage),
        throwsA(isA<SecretBoxAuthenticationError>()),
      );
    });

    test('handles large payloads correctly', () async {
      // Create a large payload
      final largePayload = Uint8List(1024)..fillRange(0, 1024, 42);
      
      // Complete handshake with large payload
      final message1 = await initiator.writeMessage(largePayload);
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(largePayload);
      await initiator.readMessage(message2);
      final message3 = await initiator.writeMessage(largePayload);
      await responder.readMessage(message3);

      expect(initiator.isComplete, isTrue);
      expect(responder.isComplete, isTrue);
    });

    test('maintains protocol name constant', () {
      // The protocol name must be exactly Noise_XX_25519_ChaChaPoly_SHA256
      // This is required by the Noise Protocol Framework specification
      expect(
        NoiseXXPattern.PROTOCOL_NAME,
        equals('Noise_XX_25519_ChaChaPoly_SHA256'),
        reason: 'Protocol name must match Noise specification exactly',
      );
      
      // Verify it contains only printable ASCII characters
      final protocolBytes = utf8.encode(NoiseXXPattern.PROTOCOL_NAME);
      expect(
        protocolBytes.every((b) => b >= 32 && b <= 126),
        isTrue,
        reason: 'Protocol name must contain only printable ASCII characters',
      );
    });

    test('fails if trying to write message after handshake completion', () async {
      // Complete handshake
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // Try to write another message
      expect(
        () => initiator.writeMessage(Uint8List(0)),
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Handshake already complete'))
        ),
      );
    });

    test('handles empty payloads correctly', () async {
      // Complete handshake with empty payloads
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      expect(initiator.isComplete, isTrue);
      expect(responder.isComplete, isTrue);
    });

    test('verifies different static keys produce different shared secrets', () async {
      final algorithm = X25519();
      final staticKey1 = await algorithm.newKeyPair();
      final staticKey2 = await algorithm.newKeyPair();
      
      // Create two pairs of initiator/responder with different static keys
      final initiator1 = await NoiseXXPattern.create(true, staticKey1);
      final responder1 = await NoiseXXPattern.create(false, staticKey1);
      final initiator2 = await NoiseXXPattern.create(true, staticKey2);
      final responder2 = await NoiseXXPattern.create(false, staticKey2);

      // Start both handshakes
      final msg1a = await initiator1.writeMessage(Uint8List(0));
      final msg1b = await initiator2.writeMessage(Uint8List(0));

      // First messages should work
      await responder1.readMessage(msg1a);
      await responder2.readMessage(msg1b);

      // Generate second messages
      final msg2a = await responder1.writeMessage(Uint8List(0));
      final msg2b = await responder2.writeMessage(Uint8List(0));

      // Try to mix second messages - should fail due to different static keys
      expect(
        () => initiator1.readMessage(msg2b),
        throwsA(isA<SecretBoxAuthenticationError>().having(
          (e) => e.toString(),
          'toString()',
          contains('wrong message authentication code'),
        )),
      );
    });

    test('verifies message encryption during handshake', () async {
      final algorithm = X25519();
      final staticKey = await algorithm.newKeyPair();
      
      final initiator = await NoiseXXPattern.create(true, staticKey);
      final responder = await NoiseXXPattern.create(false, staticKey);

      // First message with payload
      final payload1 = Uint8List.fromList([1, 2, 3]);
      final msg1 = await initiator.writeMessage(payload1);
      await responder.readMessage(msg1);

      // Second message with payload
      final payload2 = Uint8List.fromList([4, 5, 6]);
      final msg2 = await responder.writeMessage(payload2);
      await initiator.readMessage(msg2);

      // Third message with payload
      final payload3 = Uint8List.fromList([7, 8, 9]);
      final msg3 = await initiator.writeMessage(payload3);
      await responder.readMessage(msg3);
    });

    test('handles concurrent handshakes independently', () async {
      // Create two independent handshakes
      final initiator2 = await NoiseXXPattern.create(true, initiatorStatic);
      final responder2 = await NoiseXXPattern.create(false, responderStatic);

      // Complete both handshakes concurrently
      final message1 = await initiator.writeMessage(Uint8List(0));
      final message1_2 = await initiator2.writeMessage(Uint8List(0));
      
      await responder.readMessage(message1);
      await responder2.readMessage(message1_2);
      
      final message2 = await responder.writeMessage(Uint8List(0));
      final message2_2 = await responder2.writeMessage(Uint8List(0));
      
      await initiator.readMessage(message2);
      await initiator2.readMessage(message2_2);
      
      final message3 = await initiator.writeMessage(Uint8List(0));
      final message3_2 = await initiator2.writeMessage(Uint8List(0));
      
      await responder.readMessage(message3);
      await responder2.readMessage(message3_2);

      // Verify both handshakes completed successfully
      expect(initiator.isComplete, isTrue);
      expect(responder.isComplete, isTrue);
      expect(initiator2.isComplete, isTrue);
      expect(responder2.isComplete, isTrue);

      // Verify they produced different keys
      final key1 = await initiator.sendKey.extractBytes();
      final key2 = await initiator2.sendKey.extractBytes();
      expect(key1, isNot(equals(key2)));
    });

    test('verifies ephemeral keys are unique per handshake', () async {
      // Complete first handshake
      final message1 = await initiator.writeMessage(Uint8List(0));
      final ephemeral1 = message1.sublist(0, 32); // First 32 bytes are ephemeral key

      // Create new initiator and complete second handshake
      final initiator2 = await NoiseXXPattern.create(true, initiatorStatic);
      final message1_2 = await initiator2.writeMessage(Uint8List(0));
      final ephemeral2 = message1_2.sublist(0, 32);

      // Verify ephemeral keys are different
      expect(ephemeral1, isNot(equals(ephemeral2)));
    });

    test('handles error state transitions correctly', () async {
      final algorithm = X25519();
      final staticKey = await algorithm.newKeyPair();
      final pattern = await NoiseXXPattern.create(true, staticKey);

      // Write first message
      final msg1 = await pattern.writeMessage(Uint8List(0));

      // Attempt to read an invalid message - should set error state
      expect(
        () => pattern.readMessage(Uint8List(10)), // Too short for MAC
        throwsA(isA<StateError>()),
      );

      // After error, all operations should fail
      expect(
        () => pattern.writeMessage(Uint8List(0)),
        throwsA(isA<StateError>()),
      );
      expect(
        () => pattern.readMessage(msg1),
        throwsA(isA<StateError>()),
      );
      expect(
        () => pattern.writeMessage(Uint8List(0)),
        throwsA(isA<StateError>()),
      );
      expect(
        () => pattern.readMessage(Uint8List(0)),
        throwsA(isA<StateError>()),
      );
    });

    test('key derivation hmac inputs follow noise specification', () async {
      // Complete handshake
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // Extract keys multiple times to verify stability
      final initiatorSendKey1 = await initiator.sendKey.extractBytes();
      final initiatorSendKey2 = await initiator.sendKey.extractBytes();
      final initiatorRecvKey1 = await initiator.recvKey.extractBytes();
      final initiatorRecvKey2 = await initiator.recvKey.extractBytes();

      // Keys should be stable when extracted multiple times
      expect(initiatorSendKey1, equals(initiatorSendKey2),
          reason: 'Send key should be stable');
      expect(initiatorRecvKey1, equals(initiatorRecvKey2),
          reason: 'Receive key should be stable');

      // Keys should be different from each other
      expect(initiatorSendKey1, isNot(equals(initiatorRecvKey1)),
          reason: 'Send and receive keys should be different');
    });

    test('key derivation order matches noise specification roles', () async {
      // Complete handshake
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // Extract keys
      final initiatorSendKey = await initiator.sendKey.extractBytes();
      final initiatorRecvKey = await initiator.recvKey.extractBytes();
      final responderSendKey = await responder.sendKey.extractBytes();
      final responderRecvKey = await responder.recvKey.extractBytes();

      // According to Noise spec section 5.2:
      // For initiator: k1 -> send key, k2 -> recv key
      // For responder: k1 -> recv key, k2 -> send key
      expect(initiatorSendKey, equals(responderRecvKey),
          reason: 'k1 should be initiator send and responder recv');
      expect(initiatorRecvKey, equals(responderSendKey),
          reason: 'k2 should be initiator recv and responder send');
    });

    test('key derivation produces stable keys', () async {
      // Complete handshake
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // Extract keys multiple times to verify stability
      final initiatorSendKey1 = await initiator.sendKey.extractBytes();
      final initiatorSendKey2 = await initiator.sendKey.extractBytes();
      final responderRecvKey1 = await responder.recvKey.extractBytes();
      final responderRecvKey2 = await responder.recvKey.extractBytes();

      // Keys should be stable (same key extracted twice)
      expect(initiatorSendKey1, equals(initiatorSendKey2),
          reason: 'Initiator send key should be stable');
      expect(responderRecvKey1, equals(responderRecvKey2),
          reason: 'Responder receive key should be stable');
    });

    test('key derivation follows noise specification', () async {
      // Complete handshake
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // Extract all keys
      final initiatorSendKey = await initiator.sendKey.extractBytes();
      final initiatorRecvKey = await initiator.recvKey.extractBytes();
      final responderSendKey = await responder.sendKey.extractBytes();
      final responderRecvKey = await responder.recvKey.extractBytes();

      // According to Noise spec:
      // 1. Initiator's send key should be derived from k1
      // 2. Responder's send key should be derived from k2
      // 3. Keys should be 32 bytes (for ChaCha20)
      expect(initiatorSendKey.length, equals(32),
          reason: 'Keys should be 32 bytes for ChaCha20');
      expect(responderSendKey.length, equals(32),
          reason: 'Keys should be 32 bytes for ChaCha20');

      // Keys should be different
      expect(initiatorSendKey, isNot(equals(responderSendKey)),
          reason: 'Send keys should be different');
    });

    test('minimal key derivation test', () async {
      // Complete just enough of handshake to get to key derivation
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // Just verify k1 flows correctly - initiator send to responder recv
      final initiatorSend = await initiator.sendKey.extractBytes();
      final responderRecv = await responder.recvKey.extractBytes();
      expect(initiatorSend, equals(responderRecv),
          reason: 'k1 should flow from initiator->send to responder->recv');
    });

    test('minimal hmac test', () async {
      // Complete handshake to get to a known chain key state
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      
      // Verify both sides have same chain key
      final hmac = Hmac.sha256();
      final k1_init = await hmac.calculateMac([0x01], secretKey: initiator.sendKey);
      final k1_resp = await hmac.calculateMac([0x01], secretKey: responder.recvKey);
      expect(k1_init.bytes, equals(k1_resp.bytes),
          reason: 'Same HMAC operation should produce same result');
    });

    test('minimal handshake test', () async {
      // -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      
      // <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      
      // At this point both sides should have performed the same DH operations
      // and should have the same chain key
      final hmac = Hmac.sha256();
      final k1_init = await hmac.calculateMac([0x01], secretKey: initiator.sendKey);
      final k1_resp = await hmac.calculateMac([0x01], secretKey: responder.recvKey);
      expect(k1_init.bytes, equals(k1_resp.bytes),
          reason: 'Chain key should be identical after ee+es');
    });

    test('minimal dh test', () async {
      // -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      
      // <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      
      // -> s, se
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // The issue is in the se operation - verify the DH operation is correct
      final remoteStatic = responder.debugRemoteStaticKey;
      if (remoteStatic == null) {
        fail('Remote static key should not be null after handshake');
      }

      final algorithm = X25519();
      final shared = await algorithm.sharedSecretKey(
        keyPair: initiator.debugEphemeralKeys,
        remotePublicKey: SimplePublicKey(remoteStatic, type: KeyPairType.x25519),
      );
      final sharedBytes = await shared.extractBytes();

      // Verify chain key state after se operation
      expect(initiator.debugChainKey, equals(responder.debugChainKey),
          reason: 'Chain keys should match after se operation');
    });

    test('minimal key test', () async {
      // -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      
      // <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      
      // -> s, se
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // Get final keys
      final initiatorSend = await initiator.sendKey.extractBytes();
      final responderRecv = await responder.recvKey.extractBytes();
      // print('Initiator send key: ${initiatorSend}');
      // print('Responder recv key: ${responderRecv}');
    });

    test('proves hash mixing order issue', () async {
      // print('\nInitial handshake hashes:');
      // print('Initiator: ${initiator.debugHandshakeHash}');
      // print('Responder: ${responder.debugHandshakeHash}');
      
      // -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      
      // print('\nAfter first message:');
      // print('Initiator: ${initiator.debugHandshakeHash}');
      // print('Responder: ${responder.debugHandshakeHash}');
      
      // <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      
      // print('\nAfter second message:');
      // print('Initiator: ${initiator.debugHandshakeHash}');
      // print('Responder: ${responder.debugHandshakeHash}');
      
      // -> s, se
      final message3 = await initiator.writeMessage(Uint8List(0));
      
      // print('\nAfter initiator writes final message:');
      // print('Initiator: ${initiator.debugHandshakeHash}');
      // print('Responder: ${responder.debugHandshakeHash}');
      
      await responder.readMessage(message3);
      
      // print('\nAfter responder reads final message:');
      // print('Initiator: ${initiator.debugHandshakeHash}');
      // print('Responder: ${responder.debugHandshakeHash}');
      
      // Verify final handshake hashes match
      expect(initiator.debugHandshakeHash, equals(responder.debugHandshakeHash),
          reason: 'Final handshake hashes should match');
    });

    test('proves encryption issue in final message', () async {
      // Complete first two messages
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      
      // Get the static public key that will be encrypted
      final staticPubKey = await initiator.getStaticPublicKey();
      // print('\nStatic public key to encrypt: ${staticPubKey}');
      
      // Write final message
      final message3 = await initiator.writeMessage(Uint8List(0));
      // print('Final message (encrypted): ${message3}');
      
      // Try to decrypt it
      try {
        await responder.readMessage(message3);
        // print('Decryption succeeded');
      } catch (e) {
        // print('Decryption failed: $e');
        rethrow;
      }
    });

    test('proves payload handling issue', () async {
      // Create a test payload
      final payload = Uint8List.fromList([1, 2, 3]);
      // print('\nTest payload: $payload');
      
      // Complete handshake with payload in each message
      final message1 = await initiator.writeMessage(payload);
      // print('Message 1 length: ${message1.length}');
      await responder.readMessage(message1);
      
      final message2 = await responder.writeMessage(payload);
      // print('Message 2 length: ${message2.length}');
      await initiator.readMessage(message2);
      
      final message3 = await initiator.writeMessage(payload);
      // print('Message 3 length: ${message3.length}');
      
      // Try to decrypt the final message
      try {
        await responder.readMessage(message3);
        // print('Final message decryption succeeded');
      } catch (e) {
        // print('Final message decryption failed: $e');
        rethrow;
      }
    });

    test('proves protocol framing issue', () async {
      // Create a test payload
      final payload = Uint8List.fromList([1, 2, 3]);
      
      // Complete first two messages
      final message1 = await initiator.writeMessage(payload);
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(payload);
      await initiator.readMessage(message2);
      
      // Write final message with payload
      final message3 = await initiator.writeMessage(payload);
      
      // The message should be:
      // - encrypted static key (32 bytes)
      // - MAC for static key (16 bytes)
      // - MAC for payload (16 bytes)
      // Total: 64 bytes
      
      // This message will be framed by NoiseXXProtocol with:
      // [2 bytes length prefix][encrypted payload][16 bytes MAC]
      // But the payload is already encrypted and has a MAC!
      // print('\nIf framed by protocol:');
      // print('Length prefix: 2 bytes');
      // print('Encrypted message: ${message3.length} bytes');
      // print('Additional MAC: 16 bytes');
      // print('Total framed length: ${2 + message3.length + 16} bytes');
      
      // The protocol is adding an extra layer of encryption and MAC
      // when it should just be framing the message
      await responder.readMessage(message3);
    });

    test('traces handshake byte sequences', () async {
      // print('\nTracing complete handshake sequence:');
      
      // -> e
      // print('\nStep 1: -> e');
      final message1 = await initiator.writeMessage(Uint8List(0));
      // print('Message 1 length: ${message1.length}');
      // print('Message 1 bytes: ${message1.toList()}');
      
      await responder.readMessage(message1);
      // print('Responder state after reading e: ${responder.state}');
      
      // <- e, ee, s, es
      // print('\nStep 2: <- e, ee, s, es');
      final message2 = await responder.writeMessage(Uint8List(0));
      // print('Message 2 length: ${message2.length}');
      // print('Message 2 bytes: ${message2.toList()}');
      
      await initiator.readMessage(message2);
      // print('Initiator state after reading e,ee,s,es: ${initiator.state}');
      
      // -> s, se
      // print('\nStep 3: -> s, se');
      final message3 = await initiator.writeMessage(Uint8List(0));
      // print('Message 3 length: ${message3.length}');
      // print('Message 3 bytes: ${message3.toList()}');
      
      // print('\nBefore responder reads final message:');
      // print('Responder state: ${responder.state}');
      // print('Responder handshake hash: ${responder.debugHandshakeHash}');
      
      await responder.readMessage(message3);
      
      // print('\nAfter responder reads final message:');
      // print('Responder state: ${responder.state}');
      // print('Responder handshake hash: ${responder.debugHandshakeHash}');
      
      // Verify both sides completed
      expect(initiator.isComplete, isTrue);
      expect(responder.isComplete, isTrue);
    });

    test('proves payload is encrypted in final message', () async {
      // Complete first two messages
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      
      // Create a test payload with recognizable pattern
      final payload = Uint8List.fromList(List.filled(32, 0x42));  // 32 bytes of 0x42
      // print('\nPayload: ${payload.toList()}');
      
      // Write final message with payload
      final message3 = await initiator.writeMessage(payload);
      // print('Final message length: ${message3.length}');
      // print('Final message: ${message3.toList()}');
      
      // Message should be:
      // - 32 bytes encrypted static key
      // - 16 bytes MAC for static key
      // - 32 bytes encrypted payload
      // - 16 bytes MAC for payload
      // Total: 96 bytes
      
      expect(message3.length, equals(96), 
        reason: 'Final message should contain encrypted static key (32) + MAC (16) + encrypted payload (32) + MAC (16)');
        
      // Check for absence of payload pattern (consecutive 0x42 bytes)
      bool hasPayloadPattern = false;
      for (int i = 0; i < message3.length - 3; i++) {
        if (message3[i] == 0x42 && message3[i + 1] == 0x42 && message3[i + 2] == 0x42) {
          hasPayloadPattern = true;
          break;
        }
      }
      expect(hasPayloadPattern, isFalse,
        reason: 'Message should not contain consecutive payload bytes (0x42)');
    });

    test('proves payload is encrypted in final message with large payload', () async {
      // Complete first two messages
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      
      // Create a large test payload with recognizable pattern
      final payload = Uint8List.fromList(List.filled(1024, 0x42));  // 1KB of 0x42
      // print('\nPayload: ${payload.length} bytes of 0x42');
      
      // Write final message with payload
      final message3 = await initiator.writeMessage(payload);
      // print('Final message length: ${message3.length}');
      // print('Final message: ${message3.toList()}');
      
      // Message should be:
      // - 32 bytes encrypted static key
      // - 16 bytes MAC for static key
      // - 1024 bytes encrypted payload
      // - 16 bytes MAC for payload
      // Total: 1088 bytes
      
      expect(message3.length, equals(1088), 
        reason: 'Final message should contain encrypted static key (32) + MAC (16) + encrypted payload (1024) + MAC (16)');
        
      // Check for absence of payload pattern (consecutive 0x42 bytes)
      bool hasPayloadPattern = false;
      for (int i = 0; i < message3.length - 3; i++) {
        if (message3[i] == 0x42 && message3[i + 1] == 0x42 && message3[i + 2] == 0x42) {
          hasPayloadPattern = true;
          break;
        }
      }
      expect(hasPayloadPattern, isFalse,
        reason: 'Message should not contain consecutive payload bytes (0x42)');
    });

    test('readMessage correctly parses final message with static key and MAC', () async {
      // Create pattern instances for both sides
      final algorithm = X25519();
      final initiatorStatic = await algorithm.newKeyPair();
      final responderStatic = await algorithm.newKeyPair();
      final initiator = await NoiseXXPattern.create(true, initiatorStatic);
      final responder = await NoiseXXPattern.create(false, responderStatic);

      // Complete first two messages of handshake
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);

      // Get the final message from initiator
      final message3 = await initiator.writeMessage(Uint8List(0));
      expect(message3.length, equals(48), reason: 'Final message should be 48 bytes (32 encrypted key + 16 MAC)');

      // This should succeed in reading the message
      await responder.readMessage(message3);

      // Verify both sides completed handshake
      expect(initiator.state, equals(XXHandshakeState.complete));
      expect(responder.state, equals(XXHandshakeState.complete));

      // Verify they exchanged static keys correctly
      final initiatorStaticPub = await initiator.getStaticPublicKey();
      final responderStaticPub = await responder.getStaticPublicKey();
      expect(initiator.remoteStaticKey, equals(responderStaticPub));
      expect(responder.remoteStaticKey, equals(initiatorStaticPub));
    });

    test('rejects messages with insufficient data', () async {
      // Complete first message exchange
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);

      // Create a message that's too short to contain required data
      final shortMessage = Uint8List(34); // Just enough for length prefix + ephemeral key
      shortMessage[0] = 0x00;
      shortMessage[1] = 0x20; // Indicate 32 bytes of data

      expect(
        () => initiator.readMessage(shortMessage),
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Message too short to contain encrypted static key'))
        ),
      );
    });

    test('rejects corrupted handshake messages', () async {
      // Complete first message exchange
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);

      // Create a valid second message
      final message2 = await responder.writeMessage(Uint8List(0));
      
      // Corrupt the encrypted static key portion
      final corruptedMessage = Uint8List(message2.length);
      corruptedMessage.setAll(0, message2);
      // Corrupt a byte in the encrypted static key portion (after ephemeral key)
      corruptedMessage[40] ^= 0xFF;

      expect(
        () => initiator.readMessage(corruptedMessage),
        throwsA(isA<SecretBoxAuthenticationError>().having(
          (e) => e.toString(),
          'toString()',
          contains('wrong message authentication code'),
        )),
      );
    });

    test('rejects messages with invalid protocol name', () async {
      // Create a responder since it can receive first messages
      final algorithm = X25519();
      final staticKey = await algorithm.newKeyPair();
      final responder = await NoiseXXPattern.create(false, staticKey);

      // Create a message that's too short to be valid
      final shortMessage = Uint8List(16); // Too short for ephemeral key
      shortMessage.fillRange(0, 16, 0x42); // Fill with dummy data
      
      expect(
        () => responder.readMessage(shortMessage),
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Message too short to contain ephemeral key'))
        ),
      );
    });


    test('proves message length checks should be in order', () async {
      // Complete first message exchange to get into a state where we can decrypt
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);

      // Create a message that's too short for the static key (but has ephemeral key)
      final shortMessage = Uint8List(34); // Just enough for ephemeral key
      shortMessage.fillRange(0, 32, 0x42); // Fill with dummy ephemeral key
      
      expect(
        () => initiator.readMessage(shortMessage),
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Message too short to contain encrypted static key'))
        ),
      );
    });

    test('proves state check should come before length check', () async {
      // Complete first message exchange to get into a state where we can decrypt
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);

      // Create a message that's too short for the static key (but has ephemeral key)
      final shortMessage = Uint8List(34); // Just enough for ephemeral key
      shortMessage.fillRange(0, 32, 0x42); // Fill with dummy ephemeral key
      
      // The initiator should be in sentE state, so it should expect a message with:
      // - ephemeral key (32 bytes)
      // - encrypted static key (32 bytes)
      // - MAC (16 bytes)
      // Total: 80 bytes
      
      expect(initiator.state, equals(XXHandshakeState.sentE),
        reason: 'Initiator should be in sentE state before receiving second message');
      
      expect(
        () => initiator.readMessage(shortMessage),
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Message too short to contain encrypted static key'))
        ),
      );
    });



    test('rejects invalid handshake messages', () async {
      // Create a responder since it can receive first messages
      final algorithm = X25519();
      final staticKey = await algorithm.newKeyPair();
      final responder = await NoiseXXPattern.create(false, staticKey);

      // Create a message that's too short to be valid
      final shortMessage = Uint8List(16); // Too short for ephemeral key
      shortMessage.fillRange(0, 16, 0x42); // Fill with dummy data
      
      expect(
        () => responder.readMessage(shortMessage),
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Message too short to contain ephemeral key'))
        ),
      );
    });

    // Helper function to encrypt data with a key
    Future<Uint8List> _encryptWithKey(Uint8List data, SecretKey key) async {
      final algorithm = Chacha20.poly1305Aead();
      final nonce = List<int>.filled(algorithm.nonceLength, 0);
      final secretBox = await algorithm.encrypt(
        data,
        secretKey: key,
        nonce: nonce,
        aad: Uint8List(0),
      );
      return Uint8List.fromList([...secretBox.cipherText, ...secretBox.mac.bytes]);
    }

    // Helper function to decrypt data with a key
    Future<Uint8List> _decryptWithKey(Uint8List data, SecretKey key) async {
      final algorithm = Chacha20.poly1305Aead();
      final nonce = List<int>.filled(algorithm.nonceLength, 0);
      final macSize = 16;
      final cipherText = data.sublist(0, data.length - macSize);
      final mac = data.sublist(data.length - macSize);
      final decrypted = await algorithm.decrypt(
        SecretBox(cipherText, nonce: nonce, mac: Mac(mac)),
        secretKey: key,
        aad: Uint8List(0),
      );
      return Uint8List.fromList(decrypted);
    }

    test('proves handshake payload handling issue', () async {
      // Complete first two messages
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      
      // Create a recognizable payload for the final message
      final payload = Uint8List.fromList(List.filled(32, 0x42)); // 32 bytes of 0x42
      
      // Write final message with payload
      final message3 = await initiator.writeMessage(payload);
      
      // The message should contain:
      // - encrypted static key (32 bytes)
      // - MAC for static key (16 bytes)
      // - encrypted payload (32 bytes)
      // - MAC for payload (16 bytes)
      // Total: 96 bytes
      expect(message3.length, equals(96),
        reason: 'Final message should be 96 bytes (32 static + 16 MAC + 32 payload + 16 MAC)');
        
      // Process the message - this should decrypt both the static key and payload
      await responder.readMessage(message3);
      
      // Verify the pattern completed
      expect(responder.state, equals(XXHandshakeState.complete),
        reason: 'Responder should be in complete state');
      
      // The handshake hashes should match, proving the payload was processed
      final initiatorHash = initiator.debugHandshakeHash;
      final responderHash = responder.debugHandshakeHash;
      expect(initiatorHash, equals(responderHash),
        reason: 'Handshake hashes should match if payload was properly processed');
        
      // Now let's try to send a message after the handshake
      final testData = Uint8List.fromList([1, 2, 3]);
      final encryptedTestData = await _encryptWithKey(testData, initiator.sendKey);
      final decryptedTestData = await _decryptWithKey(encryptedTestData, responder.recvKey);
      
      // The decryption succeeds, which means:
      // 1. The keys are properly derived and working
      // 2. There's no buffering issue
      // 3. The payload in the final handshake message is properly processed
      expect(decryptedTestData, equals(testData),
        reason: 'Post-handshake encryption/decryption should work');
        
      // The real issue is that we decrypt the payload in the final message
      // but we don't have any way to return it to the caller
      // This means the identity key and signature in the payload are lost
      // We need to modify readMessage() to return the decrypted payload
    });

    test('updates state after writing message', () async {
      final staticKeys = await X25519().newKeyPair();
      final pattern = await NoiseXXPattern.create(true, staticKeys);
      
      expect(pattern.state, equals(XXHandshakeState.initial));
      
      // Write first message
      await pattern.writeMessage(Uint8List(0));
      
      expect(pattern.state, equals(XXHandshakeState.sentE));
    });

    test('follows correct message sequence for initiator', () async {
      final staticKeys = await X25519().newKeyPair();
      final pattern = await NoiseXXPattern.create(true, staticKeys);
      
      // First write should succeed (-> e)
      final firstMessage = await pattern.writeMessage(Uint8List(0));
      expect(firstMessage, isNotEmpty);
      
      // Attempting to write again before reading should fail
      expect(() => pattern.writeMessage(Uint8List(0)), 
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Initiator cannot write second message'
        )),
      );
    });

    test('transitions state after writing message', () async {
      final staticKeys = await X25519().newKeyPair();
      final pattern = await NoiseXXPattern.create(true, staticKeys);
      
      // First write should succeed (-> e)
      await pattern.writeMessage(Uint8List(0));
      
      // Second write should fail because we haven't read yet
      expect(() => pattern.writeMessage(Uint8List(0)), throwsStateError);
    });

    test('follows Noise XX pattern specification exactly', () async {
      // Create pattern instances with known keys for deterministic testing
      final algorithm = X25519();
      final initiatorStatic = await algorithm.newKeyPair();
      final responderStatic = await algorithm.newKeyPair();
      final initiatorEphemeral = await algorithm.newKeyPair();
      final responderEphemeral = await algorithm.newKeyPair();

      // Create patterns with test keys
      final initiator = await NoiseXXPattern.createForTesting(
        true,
        initiatorStatic,
        initiatorEphemeral,
      );
      final responder = await NoiseXXPattern.createForTesting(
        false,
        responderStatic,
        responderEphemeral,
      );

      // -> e
      // First message should contain only the initiator's ephemeral public key
      final message1 = await initiator.writeMessage(Uint8List(0));
      final initiatorEphemeralPub = await initiatorEphemeral.extractPublicKey();
      final initiatorEphemeralBytes = await initiatorEphemeralPub.bytes;
      expect(message1, equals(initiatorEphemeralBytes), 
        reason: 'First message should contain exactly the ephemeral public key');
      
      // Record chain key before processing
      final chainKeyBeforeE = initiator.debugChainKey;
      await responder.readMessage(message1);
      expect(responder.debugChainKey, equals(chainKeyBeforeE),
        reason: 'Chain key should not change after receiving e');

      // <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      // Message should contain:
      // - responder's ephemeral key (32 bytes)
      // - encrypted static key (32 bytes)
      // - MAC for static key (16 bytes)
      expect(message2.length, equals(80),
        reason: 'Second message should be 80 bytes (e[32] + encrypted_s[32] + MAC[16])');
      
      // First 32 bytes should be responder's ephemeral key
      final responderEphemeralPub = await responderEphemeral.extractPublicKey();
      final responderEphemeralBytes = await responderEphemeralPub.bytes;
      expect(message2.sublist(0, 32), equals(responderEphemeralBytes),
        reason: 'First 32 bytes of second message should be responder ephemeral key');

      await initiator.readMessage(message2);

      // -> s, se
      final message3 = await initiator.writeMessage(Uint8List(0));
      // Message should contain:
      // - encrypted static key (32 bytes)
      // - MAC for static key (16 bytes)
      expect(message3.length, equals(48),
        reason: 'Third message should be 48 bytes (encrypted_s[32] + MAC[16])');

      await responder.readMessage(message3);

      // Verify both sides completed
      expect(initiator.isComplete, isTrue);
      expect(responder.isComplete, isTrue);

      // Final chain keys should match
      expect(initiator.debugChainKey, equals(responder.debugChainKey),
        reason: 'Chain keys should match after handshake completion');
    });

    test('proves chain key mismatch issue', () async {
      // Create pattern instances with known keys for deterministic testing
      final algorithm = X25519();
      final initiatorStatic = await algorithm.newKeyPair();
      final responderStatic = await algorithm.newKeyPair();
      final initiatorEphemeral = await algorithm.newKeyPair();
      final responderEphemeral = await algorithm.newKeyPair();

      final initiator = await NoiseXXPattern.createForTesting(
        true,
        initiatorStatic,
        initiatorEphemeral,
      );
      final responder = await NoiseXXPattern.createForTesting(
        false,
        responderStatic,
        responderEphemeral,
      );

      // Print initial chain keys
      print('\nInitial chain keys:');
      print('Initiator: ${initiator.debugChainKey}');
      print('Responder: ${responder.debugChainKey}');

      // -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      
      print('\nAfter first message (e):');
      print('Initiator: ${initiator.debugChainKey}');
      print('Responder: ${responder.debugChainKey}');

      // <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);
      
      print('\nAfter second message (e, ee, s, es):');
      print('Initiator: ${initiator.debugChainKey}');
      print('Responder: ${responder.debugChainKey}');

      // -> s, se
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);
      
      print('\nAfter final message (s, se):');
      print('Initiator: ${initiator.debugChainKey}');
      print('Responder: ${responder.debugChainKey}');

      // Verify chain keys match at each step
      expect(initiator.debugChainKey, equals(responder.debugChainKey),
          reason: 'Chain keys should match after handshake completion');
    });

    test('proves dh operation order issue', () async {
      // Create pattern instances with known keys for deterministic testing
      final algorithm = X25519();
      final initiatorStatic = await algorithm.newKeyPair();
      final responderStatic = await algorithm.newKeyPair();
      final initiatorEphemeral = await algorithm.newKeyPair();
      final responderEphemeral = await algorithm.newKeyPair();

      final initiator = await NoiseXXPattern.createForTesting(
        true,
        initiatorStatic,
        initiatorEphemeral,
      );
      final responder = await NoiseXXPattern.createForTesting(
        false,
        responderStatic,
        responderEphemeral,
      );

      // -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);
      
      print('\nAfter initiator e:');
      print('Initiator: ${initiator.debugChainKey}');
      print('Responder: ${responder.debugChainKey}');

      // <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      
      print('\nAfter responder writes message2:');
      print('Initiator: ${initiator.debugChainKey}');
      print('Responder: ${responder.debugChainKey}');

      await initiator.readMessage(message2);
      
      print('\nAfter initiator reads message2:');
      print('Initiator: ${initiator.debugChainKey}');
      print('Responder: ${responder.debugChainKey}');
      
      // -> s, se
      final message3 = await initiator.writeMessage(Uint8List(0));
      
      print('\nAfter initiator writes message3:');
      print('Initiator: ${initiator.debugChainKey}');
      print('Responder: ${responder.debugChainKey}');

      await responder.readMessage(message3);
      
      print('\nAfter responder reads message3:');
      print('Initiator: ${initiator.debugChainKey}');
      print('Responder: ${responder.debugChainKey}');
      expect(initiator.debugChainKey, equals(responder.debugChainKey),
          reason: 'Chain keys should match after handshake completion');
    });

    test('proves correct dh operation order', () async {
      // Create pattern instances with known keys for deterministic testing
      final algorithm = X25519();
      final initiatorStatic = await algorithm.newKeyPair();
      final responderStatic = await algorithm.newKeyPair();
      final initiatorEphemeral = await algorithm.newKeyPair();
      final responderEphemeral = await algorithm.newKeyPair();

      final initiator = await NoiseXXPattern.createForTesting(
        true,
        initiatorStatic,
        initiatorEphemeral,
      );
      final responder = await NoiseXXPattern.createForTesting(
        false,
        responderStatic,
        responderEphemeral,
      );

      // Record initial states
      final initialHash = initiator.debugHandshakeHash;
      expect(responder.debugHandshakeHash, equals(initialHash),
        reason: 'Initial handshake hashes should match');

      // Step 1: -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      // Verify first message contains exactly the ephemeral key
      final initiatorEphemeralPub = await initiatorEphemeral.extractPublicKey();
      final initiatorEphemeralBytes = await initiatorEphemeralPub.bytes;
      expect(message1, equals(initiatorEphemeralBytes),
        reason: 'First message should contain exactly the ephemeral public key');
      await responder.readMessage(message1);
      // Verify states after first message
      expect(initiator.state, equals(XXHandshakeState.sentE));
      expect(responder.state, equals(XXHandshakeState.sentE));
      expect(initiator.debugHandshakeHash, equals(responder.debugHandshakeHash),
        reason: 'Handshake hashes should match after first message');

      // Step 2: <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      // Verify second message structure
      expect(message2.length, equals(80),
        reason: 'Second message should be 80 bytes (e[32] + encrypted_s[32] + MAC[16])');
      // Verify responder's ephemeral key
      final responderEphemeralPub = await responderEphemeral.extractPublicKey();
      final responderEphemeralBytes = await responderEphemeralPub.bytes;
      expect(message2.sublist(0, 32), equals(responderEphemeralBytes),
        reason: 'First 32 bytes should be responder ephemeral key');
      await initiator.readMessage(message2);
      // Verify states after second message
      expect(initiator.state, equals(XXHandshakeState.sentEES));
      expect(responder.state, equals(XXHandshakeState.sentEES));
      expect(initiator.debugHandshakeHash, equals(responder.debugHandshakeHash),
        reason: 'Handshake hashes should match after second message');

      // Record chain key before final message
      final chainKeyBeforeFinalMsg = initiator.debugChainKey;

      // Step 3: -> s, se
      final message3 = await initiator.writeMessage(Uint8List(0));

      // Message should contain:
      // - encrypted static key (32 bytes)
      // - MAC for static key (16 bytes)
      expect(message3.length, equals(48),
        reason: 'Final message should be 48 bytes (encrypted_s[32] + MAC[16])');

      // Process message
      await responder.readMessage(message3);

      // Verify states after final message
      expect(initiator.state, equals(XXHandshakeState.complete),
        reason: 'Initiator should be in complete state');
      expect(responder.state, equals(XXHandshakeState.complete),
        reason: 'Responder should be in complete state');

      // Verify chain key has changed after se operation
      expect(initiator.debugChainKey, equals(responder.debugChainKey),
        reason: 'Chain keys should match after final message');
      expect(initiator.debugChainKey, isNot(equals(chainKeyBeforeFinalMsg)),
        reason: 'Chain key should change after se operation');

      // Verify responder received initiator's static key
      final initiatorStaticPub = await initiatorStatic.extractPublicKey();
      final initiatorStaticBytes = await initiatorStaticPub.bytes;
      expect(responder.debugRemoteStaticKey, equals(initiatorStaticBytes),
        reason: 'Responder should have initiator static key');

      // Verify both sides have derived the same final keys
      final initiatorSendKey = await initiator.sendKey.extractBytes();
      final responderRecvKey = await responder.recvKey.extractBytes();
      expect(initiatorSendKey, equals(responderRecvKey),
        reason: 'Initiator send key should match responder receive key');

      final initiatorRecvKey = await initiator.recvKey.extractBytes();
      final responderSendKey = await responder.sendKey.extractBytes();
      expect(initiatorRecvKey, equals(responderSendKey),
        reason: 'Initiator receive key should match responder send key');
    });

    test('Initiator and responder derive same chain keys', () async {
      final initiator = await NoiseXXPattern.createForTesting(true, initiatorStatic, initiatorEphemeral);
      final responder = await NoiseXXPattern.createForTesting(false, responderStatic, responderEphemeral);

      // First message: -> e
      final message1 = await initiator.writeMessage([]);
      await responder.readMessage(message1);

      // Second message: <- e, ee, s, es
      final message2 = await responder.writeMessage([]);
      await initiator.readMessage(message2);

      // Third message: -> s, se
      final message3 = await initiator.writeMessage([]);
      await responder.readMessage(message3);

      // Verify remote static keys
      final remoteStatic = responder.debugRemoteStaticKey;
      if (remoteStatic == null) {
        fail('Remote static key should not be null after handshake');
      }

      final algorithm = X25519();
      final shared = await algorithm.sharedSecretKey(
        keyPair: responderStatic,
        remotePublicKey: SimplePublicKey(remoteStatic, type: KeyPairType.x25519),
      );
      final sharedBytes = await shared.extractBytes();

      // Verify chain keys match
      expect(initiator.debugChainKey, equals(responder.debugChainKey));
    });

    test('Step 1: -> e - initiator sends ephemeral key', () async {
      // Create pattern instances with known keys for deterministic testing
      final algorithm = X25519();
      final initiatorStatic = await algorithm.newKeyPair();
      final responderStatic = await algorithm.newKeyPair();
      final initiatorEphemeral = await algorithm.newKeyPair();
      final responderEphemeral = await algorithm.newKeyPair();

      final initiator = await NoiseXXPattern.createForTesting(
        true,
        initiatorStatic,
        initiatorEphemeral,
      );
      final responder = await NoiseXXPattern.createForTesting(
        false,
        responderStatic,
        responderEphemeral,
      );

      // Record initial states
      final initiatorInitialHash = initiator.debugHandshakeHash;
      final responderInitialHash = responder.debugHandshakeHash;
      expect(initiatorInitialHash, equals(responderInitialHash), 
        reason: 'Initial handshake hashes should match');

      // -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      
      // Verify message contains exactly the ephemeral public key
      final initiatorEphemeralPub = await initiatorEphemeral.extractPublicKey();
      final initiatorEphemeralBytes = await initiatorEphemeralPub.bytes;
      expect(message1, equals(initiatorEphemeralBytes),
        reason: 'First message should contain exactly the ephemeral public key');
      expect(message1.length, equals(32),
        reason: 'Ephemeral key should be 32 bytes');

      // Process message
      await responder.readMessage(message1);

      // Verify states after first message
      expect(initiator.state, equals(XXHandshakeState.sentE),
        reason: 'Initiator should be in sentE state');
      expect(responder.state, equals(XXHandshakeState.sentE),
        reason: 'Responder should be in sentE state');

      // Verify handshake hashes match
      expect(initiator.debugHandshakeHash, equals(responder.debugHandshakeHash),
        reason: 'Handshake hashes should match after first message');

      // Verify chain keys match and haven't changed
      expect(initiator.debugChainKey, equals(responder.debugChainKey),
        reason: 'Chain keys should match');
      expect(initiator.debugChainKey, equals(initiatorInitialHash),
        reason: 'Chain key should not change after first message');
    });

    test('Step 2: <- e, ee, s, es - responder sends ephemeral key and static key', () async {
      // Create pattern instances with known keys for deterministic testing
      final algorithm = X25519();
      final initiatorStatic = await algorithm.newKeyPair();
      final responderStatic = await algorithm.newKeyPair();
      final initiatorEphemeral = await algorithm.newKeyPair();
      final responderEphemeral = await algorithm.newKeyPair();

      final initiator = await NoiseXXPattern.createForTesting(
        true,
        initiatorStatic,
        initiatorEphemeral,
      );
      final responder = await NoiseXXPattern.createForTesting(
        false,
        responderStatic,
        responderEphemeral,
      );

      // Complete first message
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);

      // Record chain key before second message
      final chainKeyBeforeSecondMsg = responder.debugChainKey;

      // <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));

      // Message should contain:
      // - responder's ephemeral key (32 bytes)
      // - encrypted static key (32 bytes)
      // - MAC for static key (16 bytes)
      expect(message2.length, equals(80),
        reason: 'Second message should be 80 bytes (e[32] + encrypted_s[32] + MAC[16])');

      // First 32 bytes should be responder's ephemeral key
      final responderEphemeralPub = await responderEphemeral.extractPublicKey();
      final responderEphemeralBytes = await responderEphemeralPub.bytes;
      expect(message2.sublist(0, 32), equals(responderEphemeralBytes),
        reason: 'First 32 bytes should be responder ephemeral key');

      // Process message
      await initiator.readMessage(message2);

      // Verify states after second message
      expect(initiator.state, equals(XXHandshakeState.sentEES),
        reason: 'Initiator should be in sentEES state');
      expect(responder.state, equals(XXHandshakeState.sentEES),
        reason: 'Responder should be in sentEES state');

      // Verify chain key has changed after ee operation
      expect(initiator.debugChainKey, equals(responder.debugChainKey),
        reason: 'Chain keys should match after second message');
      expect(initiator.debugChainKey, isNot(equals(chainKeyBeforeSecondMsg)),
        reason: 'Chain key should change after ee operation');

      // Verify initiator received responder's static key
      final responderStaticPub = await responderStatic.extractPublicKey();
      final responderStaticBytes = await responderStaticPub.bytes;
      expect(initiator.debugRemoteStaticKey, equals(responderStaticBytes),
        reason: 'Initiator should have responder static key');
    });

    test('Step 3: -> s, se - initiator sends static key and performs se', () async {
      // Create pattern instances with known keys for deterministic testing
      final algorithm = X25519();
      final initiatorStatic = await algorithm.newKeyPair();
      final responderStatic = await algorithm.newKeyPair();
      final initiatorEphemeral = await algorithm.newKeyPair();
      final responderEphemeral = await algorithm.newKeyPair();

      final initiator = await NoiseXXPattern.createForTesting(
        true,
        initiatorStatic,
        initiatorEphemeral,
      );
      final responder = await NoiseXXPattern.createForTesting(
        false,
        responderStatic,
        responderEphemeral,
      );

      // Record initial states
      final initialHash = initiator.debugHandshakeHash;
      expect(responder.debugHandshakeHash, equals(initialHash),
        reason: 'Initial handshake hashes should match');

      // Step 1: -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      // Verify first message contains exactly the ephemeral key
      final initiatorEphemeralPub = await initiatorEphemeral.extractPublicKey();
      final initiatorEphemeralBytes = await initiatorEphemeralPub.bytes;
      expect(message1, equals(initiatorEphemeralBytes),
        reason: 'First message should contain exactly the ephemeral public key');
      await responder.readMessage(message1);
      // Verify states after first message
      expect(initiator.state, equals(XXHandshakeState.sentE));
      expect(responder.state, equals(XXHandshakeState.sentE));
      expect(initiator.debugHandshakeHash, equals(responder.debugHandshakeHash),
        reason: 'Handshake hashes should match after first message');

      // Step 2: <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      // Verify second message structure
      expect(message2.length, equals(80),
        reason: 'Second message should be 80 bytes (e[32] + encrypted_s[32] + MAC[16])');
      // Verify responder's ephemeral key
      final responderEphemeralPub = await responderEphemeral.extractPublicKey();
      final responderEphemeralBytes = await responderEphemeralPub.bytes;
      expect(message2.sublist(0, 32), equals(responderEphemeralBytes),
        reason: 'First 32 bytes should be responder ephemeral key');
      await initiator.readMessage(message2);
      // Verify states after second message
      expect(initiator.state, equals(XXHandshakeState.sentEES));
      expect(responder.state, equals(XXHandshakeState.sentEES));
      expect(initiator.debugHandshakeHash, equals(responder.debugHandshakeHash),
        reason: 'Handshake hashes should match after second message');

      // Record chain key before final message
      final chainKeyBeforeFinalMsg = initiator.debugChainKey;

      // Step 3: -> s, se
      final message3 = await initiator.writeMessage(Uint8List(0));

      // Message should contain:
      // - encrypted static key (32 bytes)
      // - MAC for static key (16 bytes)
      expect(message3.length, equals(48),
        reason: 'Final message should be 48 bytes (encrypted_s[32] + MAC[16])');

      // Process message
      await responder.readMessage(message3);

      // Verify states after final message
      expect(initiator.state, equals(XXHandshakeState.complete));
      expect(responder.state, equals(XXHandshakeState.complete));

      // Verify chain key has changed after se operation
      expect(initiator.debugChainKey, equals(responder.debugChainKey));
      expect(initiator.debugChainKey, isNot(equals(chainKeyBeforeFinalMsg)));

      // Verify responder received initiator's static key
      final initiatorStaticPub = await initiatorStatic.extractPublicKey();
      final initiatorStaticBytes = await initiatorStaticPub.bytes;
      expect(responder.debugRemoteStaticKey, equals(initiatorStaticBytes));

      // Verify both sides have derived the same final keys
      final initiatorSendKey = await initiator.sendKey.extractBytes();
      final responderRecvKey = await responder.recvKey.extractBytes();
      expect(initiatorSendKey, equals(responderRecvKey));
    });

    test('validates message lengths according to Noise XX pattern', () async {
      // According to Noise spec, message lengths should be:
      // -> e:              32 bytes (ephemeral key)
      // <- e, ee, s, es:   80 bytes (ephemeral[32] + encrypted_static[32] + MAC[16])
      // -> s, se:          48 bytes (encrypted_static[32] + MAC[16])

      // Test first message (e) length validation
      final shortFirstMessage = Uint8List(16);
      expect(
        () => responder.readMessage(shortFirstMessage),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Message too short to contain ephemeral key: 16 < 32'
        )),
      );

      // Complete first message
      final message1 = await initiator.writeMessage(Uint8List(0));
      expect(message1.length, equals(32), reason: 'First message should be exactly 32 bytes');
      await responder.readMessage(message1);

      // Test second message (e, ee, s, es) length validation
      final shortSecondMessage = Uint8List(40);
      expect(
        () => initiator.readMessage(shortSecondMessage),
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Message too short to contain encrypted static key: 40 < 64'
        )),
      );

      // Complete second message
      final message2 = await responder.writeMessage(Uint8List(0));
      expect(message2.length, equals(80), reason: 'Second message should be exactly 80 bytes');
      await initiator.readMessage(message2);

      // Test third message (s, se) length validation
      final shortThirdMessage = Uint8List(40);
      expect(
        () => responder.readMessage(shortThirdMessage),
        throwsA(
          predicate((e) => e is StateError && 
            e.toString().contains('Final message too short: 40 < 48 (needs 32 bytes encrypted static key + 16 bytes MAC)'))
        ),
      );

      // Complete third message
      final message3 = await initiator.writeMessage(Uint8List(0));
      expect(message3.length, equals(48), reason: 'Third message should be exactly 48 bytes');
      await responder.readMessage(message3);
    });

    test('validates static key access according to Noise XX pattern', () async {
      // According to Noise spec:
      // - Initiator receives responder's static key in second message (e, ee, s, es)
      // - Responder receives initiator's static key in third message (s, se)

      // Initially neither side should have remote static key
      expect(
        () => initiator.remoteStaticKey,
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Remote static key not available'
        )),
      );
      expect(
        () => responder.remoteStaticKey,
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Remote static key not available'
        )),
      );

      // -> e
      final message1 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message1);

      // After first message, still no static keys exchanged
      expect(
        () => initiator.remoteStaticKey,
        throwsA(isA<StateError>()),
      );
      expect(
        () => responder.remoteStaticKey,
        throwsA(isA<StateError>()),
      );

      // <- e, ee, s, es
      final message2 = await responder.writeMessage(Uint8List(0));
      await initiator.readMessage(message2);

      // After second message:
      // - Initiator should have responder's static key
      // - Responder should not yet have initiator's static key
      expect(() => initiator.remoteStaticKey, returnsNormally);
      expect(
        () => responder.remoteStaticKey,
        throwsA(isA<StateError>()),
      );

      // -> s, se
      final message3 = await initiator.writeMessage(Uint8List(0));
      await responder.readMessage(message3);

      // After third message, both sides should have remote static keys
      expect(() => initiator.remoteStaticKey, returnsNormally);
      expect(() => responder.remoteStaticKey, returnsNormally);

      // Verify static keys match
      final initiatorStaticPub = await initiator.getStaticPublicKey();
      final responderStaticPub = await responder.getStaticPublicKey();
      expect(initiator.remoteStaticKey, equals(responderStaticPub));
      expect(responder.remoteStaticKey, equals(initiatorStaticPub));
    });

    test('follows correct message sequence for responder', () async {
      final staticKeys = await X25519().newKeyPair();
      final pattern = await NoiseXXPattern.create(false, staticKeys);
      
      // Attempting to write first should fail
      expect(() => pattern.writeMessage(Uint8List(0)), 
        throwsA(isA<StateError>().having(
          (e) => e.message,
          'message',
          'Responder cannot write first message'
        )),
      );
    });
  });
} 