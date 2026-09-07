import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:envoy_mesh/envoy_mesh.dart';
import 'package:test/test.dart';

Map<String, dynamic> _loadFixture(String name) {
  final file = File('test/fixtures/$name');
  return jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
}

void main() {
  group('companion identity golden (TS parity)', () {
    test('derivePeerId and deriveOwnerId match committed vectors', () {
      final golden = _loadFixture('companion_identity_golden.json');
      final pem = golden['publicKeyPem'] as String;
      expect(derivePeerId(pem), golden['peerId']);
      expect(deriveOwnerId(pem), golden['ownerId']);
      expect(deriveDeviceId(pem), 'envoy:device:${golden['peerId'].toString().substring('envoy_'.length)}');
    });
  });

  group('companion envelope golden (TS parity)', () {
    late Map<String, dynamic> golden;

    setUp(() {
      golden = _loadFixture('companion_envelope_interop_golden.json');
    });

    test('canonicalJson of unsigned matches signing input stability', () {
      final unsigned = Map<String, Object?>.from(
        golden['unsignedEnvelopeJson'] as Map,
      );
      // Round-trip through encode/decode must be stable for signing.
      final once = canonicalJson(unsigned);
      final twice = canonicalJson(jsonDecode(once));
      expect(twice, once);
    });

    test('signCanonicalPayload matches fixture signatureBase64Url', () {
      final unsigned = Map<String, Object?>.from(
        golden['unsignedEnvelopeJson'] as Map,
      );
      final sig = signCanonicalPayload(
        unsigned,
        golden['privateKeyPem'] as String,
      );
      expect(sig, golden['signatureBase64Url']);
    });

    test('verifyCanonicalPayload accepts fixture signature', () {
      final unsigned = Map<String, Object?>.from(
        golden['unsignedEnvelopeJson'] as Map,
      );
      expect(
        verifyCanonicalPayload(
          unsigned,
          golden['signatureBase64Url'] as String,
          golden['publicKeyPem'] as String,
        ),
        isTrue,
      );
    });

    test('verifyEnvoyEnvelope accepts signed fixture', () {
      final signed = Map<String, Object?>.from(
        golden['signedEnvelopeJson'] as Map,
      );
      expect(verifyEnvoyEnvelope(signed), isTrue);
    });

    test('verifyEnvoyEnvelope rejects tampered payload', () {
      final signed = Map<String, Object?>.from(
        golden['signedEnvelopeJson'] as Map,
      );
      final payload = Map<String, Object?>.from(signed['payload'] as Map);
      payload['message'] = 'tampered';
      signed['payload'] = payload;
      expect(verifyEnvoyEnvelope(signed), isFalse);
    });

    test('verifyEnvoyEnvelope rejects wrong senderPeerId', () {
      final signed = Map<String, Object?>.from(
        golden['signedEnvelopeJson'] as Map,
      );
      signed['senderPeerId'] = 'envoy_wrong';
      expect(verifyEnvoyEnvelope(signed), isFalse);
    });

    test('signEnvoyEnvelope round-trips with verifyEnvoyEnvelope', () {
      final unsigned = Map<String, Object?>.from(
        golden['unsignedEnvelopeJson'] as Map,
      );
      final signed = signEnvoyEnvelope(
        unsigned,
        golden['privateKeyPem'] as String,
      );
      expect(signed['signature'], golden['signatureBase64Url']);
      expect(verifyEnvoyEnvelope(signed), isTrue);
    });
  });

  group('canonicalJson', () {
    test('sorts object keys lexicographically', () {
      expect(
        canonicalJson({'b': 1, 'a': 2}),
        '{"a":2,"b":1}',
      );
    });

    test('recurses into nested objects and arrays', () {
      expect(
        canonicalJson({
          'z': [
            {'b': 1, 'a': 2},
          ],
          'a': null,
        }),
        '{"a":null,"z":[{"a":2,"b":1}]}',
      );
    });

    test('preserves null (TS keeps null, drops undefined only)', () {
      expect(canonicalJson({'x': null}), '{"x":null}');
    });
  });

  group('PEM round-trip', () {
    test('generate → PEM → raw → PEM is stable', () {
      final keys = generateEd25519KeyPair();
      final rawPub = pemToRawPublicKey(keys.publicKeyPem);
      final rawSeed = pemToRawPrivateSeed(keys.privateKeyPem);
      expect(rawPublicKeyToPem(rawPub), keys.publicKeyPem);
      expect(rawPrivateKeyToPem(rawSeed), keys.privateKeyPem);
    });

    test('fixture public PEM decodes to 32-byte raw key', () {
      final golden = _loadFixture('companion_envelope_interop_golden.json');
      final raw = pemToRawPublicKey(golden['publicKeyPem'] as String);
      expect(raw.length, 32);
      expect(derivePeerId(golden['publicKeyPem'] as String), golden['peerId']);
    });
  });

  group('keygen identities', () {
    test('owner and device ids are stable for a fixed seed', () {
      final seed = Uint8List.fromList(List<int>.filled(32, 7));
      final owner1 = generateOwnerIdentity(seed);
      final owner2 = generateOwnerIdentity(seed);
      expect(owner1.ownerId, owner2.ownerId);
      expect(owner1.ownerId.startsWith('envoy:owner:'), isTrue);

      final device1 = generateDeviceIdentity(seed);
      final device2 = generateDeviceIdentity(seed);
      expect(device1.peerId, device2.peerId);
      expect(device1.peerId, derivePeerId(device1.publicKeyPem));
      expect(device1.deviceId, deriveDeviceId(device1.publicKeyPem));
    });

    test('fresh identities can sign and verify envelopes', () {
      final device = generateDeviceIdentity();
      final unsigned = <String, Object?>{
        'version': '0.1',
        'messageId': 'msg-local-1',
        'createdAt': '2026-09-07T00:00:00.000Z',
        'senderPeerId': device.peerId,
        'senderPublicKey': device.publicKeyPem,
        'senderRole': 'human',
        'recipientRole': 'human',
        'intent': 'chat.message',
        'payload': {
          'senderOwnerId': 'envoy:owner:test',
          'text': 'hello from phone',
        },
      };
      final signed = signEnvoyEnvelope(unsigned, device.privateKeyPem);
      expect(verifyEnvoyEnvelope(signed), isTrue);
    });
  });

  group('mesh protocols (TS network package parity)', () {
    test('protocol ID strings match packages/network', () {
      expect(envoyMessageProtocol, '/envoymesh/message/0.1.0');
      expect(envoyChatProtocol, '/envoymesh/chat/0.1.0');
      expect(envoyDataProtocol, '/envoymesh/data/0.1.0');
      expect(clientProxyProtocol, '/envoymesh/client-proxy/0.1.0');
    });

    test('outboundProtocolForIntent matches desktop dispatch', () {
      expect(outboundProtocolForIntent('bond.request'), envoyMessageProtocol);
      expect(outboundProtocolForIntent('bond.accept'), envoyMessageProtocol);
      expect(outboundProtocolForIntent('chat.message'), envoyChatProtocol);
      expect(outboundProtocolForIntent('chat.delivered'), envoyChatProtocol);
    });

    test('isIntentAllowedOnProtocol mirrors validateEnvelopeProtocol', () {
      expect(isIntentAllowedOnProtocol(envoyChatProtocol, 'chat.message'), isTrue);
      expect(isIntentAllowedOnProtocol(envoyChatProtocol, 'bond.request'), isTrue);
      expect(isIntentAllowedOnProtocol(envoyMessageProtocol, 'bond.request'), isTrue);
      expect(isIntentAllowedOnProtocol(envoyMessageProtocol, 'chat.message'), isFalse);
    });
  });
}
