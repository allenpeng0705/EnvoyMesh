import 'dart:typed_data';
import 'package:dart_libp2p/core/crypto/rsa.dart';
import 'package:test/test.dart';

void main() {
  group('RSA', () {
    test('Generate key pair', () async {
      final keyPair = await generateRsaKeyPair();

      expect(keyPair.publicKey, isNotNull);
      expect(keyPair.privateKey, isNotNull);
      expect(keyPair.publicKey.type.value, equals(0)); // RSA type value
      expect(keyPair.privateKey.type.value, equals(0)); // RSA type value
    });

    test('Sign and verify', () async {
      final keyPair = await generateRsaKeyPair();
      final message = Uint8List.fromList([1, 2, 3, 4, 5]);

      final signature = await keyPair.privateKey.sign(message);
      expect(signature, isNotNull);

      final verified = await keyPair.publicKey.verify(message, signature);
      expect(verified, isTrue);

      // Verify with wrong message
      final wrongMessage = Uint8List.fromList([5, 4, 3, 2, 1]);
      final wrongVerified = await keyPair.publicKey.verify(wrongMessage, signature);
      expect(wrongVerified, isFalse);
    });

    test('Marshal and unmarshal public key', () async {
      final keyPair = await generateRsaKeyPair();
      final publicKey = keyPair.publicKey;

      final marshaled = publicKey.marshal();
      expect(marshaled, isNotNull);

      final unmarshaled = RsaPublicKey.unmarshal(marshaled);
      expect(unmarshaled, isNotNull);
      expect(unmarshaled.type.value, equals(publicKey.type.value));

      final equal = await publicKey.equals(unmarshaled);
      expect(equal, isTrue);
    });

    test('Marshal and unmarshal private key', () async {
      final keyPair = await generateRsaKeyPair();
      final privateKey = keyPair.privateKey;

      final marshaled = privateKey.marshal();
      expect(marshaled, isNotNull);

      final unmarshaled = await RsaPrivateKey.unmarshal(marshaled);
      expect(unmarshaled, isNotNull);
      expect(unmarshaled.type.value, equals(privateKey.type.value));

      // Test that the unmarshaled key can sign
      final message = Uint8List.fromList([1, 2, 3, 4, 5]);
      final signature = await unmarshaled.sign(message);
      expect(signature, isNotNull);

      // Verify with the original public key
      final verified = await keyPair.publicKey.verify(message, signature);
      expect(verified, isTrue);
    });

    test('Public key equality', () async {
      final keyPair1 = await generateRsaKeyPair();
      final keyPair2 = await generateRsaKeyPair();

      // Same key should be equal
      final equal1 = await keyPair1.publicKey.equals(keyPair1.publicKey);
      expect(equal1, isTrue);

      // Different keys should not be equal
      final equal2 = await keyPair1.publicKey.equals(keyPair2.publicKey);
      expect(equal2, isFalse);
    });

    test('Private key equality', () async {
      final keyPair1 = await generateRsaKeyPair();
      final keyPair2 = await generateRsaKeyPair();

      // Same key should be equal
      final equal1 = await keyPair1.privateKey.equals(keyPair1.privateKey);
      expect(equal1, isTrue);

      // Different keys should not be equal
      final equal2 = await keyPair1.privateKey.equals(keyPair2.privateKey);
      expect(equal2, isFalse);
    });

    test('Public key from raw bytes', () async {
      final keyPair = await generateRsaKeyPair();
      final publicKey = keyPair.publicKey;
      final rawBytes = publicKey.raw;

      final recreatedKey = RsaPublicKey.fromRawBytes(rawBytes);
      expect(recreatedKey, isNotNull);

      final equal = await publicKey.equals(recreatedKey);
      expect(equal, isTrue);
    });

    test('Get public key from private key', () async {
      final keyPair = await generateRsaKeyPair();
      final privateKey = keyPair.privateKey;
      final publicKey = privateKey.publicKey;

      expect(publicKey, isNotNull);

      final equal = await publicKey.equals(keyPair.publicKey);
      expect(equal, isTrue);
    });

    test('Key size validation', () async {
      // Test minimum key size
      expect(() async => await generateRsaKeyPair(bits: minRsaKeyBits - 1), 
             throwsA(isA<RsaKeyTooSmallException>()));

      // Test maximum key size
      expect(() async => await generateRsaKeyPair(bits: maxRsaKeyBits + 1), 
             throwsA(isA<RsaKeyTooBigException>()));

      // Test valid key size
      final keyPair = await generateRsaKeyPair(bits: minRsaKeyBits);
      expect(keyPair, isNotNull);
    });
  });
}