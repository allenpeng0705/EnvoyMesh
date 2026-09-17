import 'dart:typed_data';
import 'package:dart_libp2p/core/crypto/ed25519.dart';
import 'package:test/test.dart';

void main() {
  group('Ed25519', () {
    test('Generate key pair', () async {
      final keyPair = await generateEd25519KeyPair();

      expect(keyPair.publicKey, isNotNull);
      expect(keyPair.privateKey, isNotNull);
      expect(keyPair.publicKey.type.value, equals(1)); // Ed25519 type value
      expect(keyPair.privateKey.type.value, equals(1)); // Ed25519 type value
    });

    test('Sign and verify', () async {
      final keyPair = await generateEd25519KeyPair();
      final message = Uint8List.fromList([1, 2, 3, 4, 5]);

      final signature = await keyPair.privateKey.sign(message);
      expect(signature, isNotNull);
      expect(signature.length, equals(64)); // Ed25519 signature is 64 bytes

      final verified = await keyPair.publicKey.verify(message, signature);
      expect(verified, isTrue);

      // Verify with wrong message
      final wrongMessage = Uint8List.fromList([5, 4, 3, 2, 1]);
      final wrongVerified = await keyPair.publicKey.verify(wrongMessage, signature);
      expect(wrongVerified, isFalse);
    });

    test('Marshal and unmarshal public key', () async {
      final keyPair = await generateEd25519KeyPair();
      final publicKey = keyPair.publicKey;

      final marshaled = publicKey.marshal();
      expect(marshaled, isNotNull);

      final unmarshaled = Ed25519PublicKey.unmarshal(marshaled);
      expect(unmarshaled, isNotNull);
      expect(unmarshaled.type.value, equals(publicKey.type.value));

      final equal = await publicKey.equals(unmarshaled);
      expect(equal, isTrue);
    });

    // test('Marshal and unmarshal private key', () async {
    //   final seed = hex.decode("DB4726994FFF42679C8082F33A2FBF2CAD982CC326AF484E9F28B51F97A0E20C");
    //   final keyPair = await generateEd25519KeyPairFromSeed(Uint8List.fromList(seed));
    //
    //   final privateKey = await Ed25519PrivateKey.fromRawBytes(Uint8List.fromList(seed));
    //   final marshaled = privateKey.marshal();
    //
    //   final unmarshaled = await Ed25519PrivateKey.unmarshal(marshaled);
    //   expect(unmarshaled, isNotNull);
    //   expect(unmarshaled.type.value, equals(privateKey.type.value));
    //
    //   // Test that the unmarshaled key can sign
    //   final message = Uint8List.fromList([1, 2, 3, 4, 5]);
    //   final signature = await unmarshaled.sign(message);
    //   expect(signature, isNotNull);
    //
    //   // Verify with the original public key
    //   final verified = await keyPair.publicKey.verify(message, signature);
    //   expect(verified, isTrue);
    // });

    test('Public key equality', () async {
      final keyPair1 = await generateEd25519KeyPair();
      final keyPair2 = await generateEd25519KeyPair();

      // Same key should be equal
      final equal1 = await keyPair1.publicKey.equals(keyPair1.publicKey);
      expect(equal1, isTrue);

      // Different keys should not be equal
      final equal2 = await keyPair1.publicKey.equals(keyPair2.publicKey);
      expect(equal2, isFalse);
    });

    test('Private key equality', () async {
      final keyPair1 = await generateEd25519KeyPair();
      final keyPair2 = await generateEd25519KeyPair();

      // Same key should be equal
      final equal1 = await keyPair1.privateKey.equals(keyPair1.privateKey);
      expect(equal1, isTrue);

      // Different keys should not be equal
      final equal2 = await keyPair1.privateKey.equals(keyPair2.privateKey);
      expect(equal2, isFalse);
    });

    test('Public key from raw bytes', () async {
      final keyPair = await generateEd25519KeyPair();
      final publicKey = keyPair.publicKey;
      final rawBytes = publicKey.raw;

      final recreatedKey = Ed25519PublicKey.fromRawBytes(rawBytes);
      expect(recreatedKey, isNotNull);

      final equal = await publicKey.equals(recreatedKey);
      expect(equal, isTrue);
    });

    test('Get public key from private key', () async {
      final keyPair = await generateEd25519KeyPair();
      final privateKey = keyPair.privateKey;
      final publicKey = privateKey.publicKey;

      expect(publicKey, isNotNull);

      final equal = await publicKey.equals(keyPair.publicKey);
      expect(equal, isTrue);
    });
  });
}
