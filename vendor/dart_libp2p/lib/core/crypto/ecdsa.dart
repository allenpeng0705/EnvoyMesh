import 'dart:typed_data';
import 'package:pointycastle/pointycastle.dart' as pc;
import 'package:pointycastle/api.dart';
import 'package:pointycastle/ecc/api.dart';
import 'package:pointycastle/ecc/curves/secp256r1.dart';
import 'package:pointycastle/signers/ecdsa_signer.dart';
import 'package:pointycastle/digests/sha256.dart';
import '../../p2p/crypto/key_generator.dart';
import '../../core/crypto/pb/crypto.pb.dart' as pb;
import 'keys.dart' as p2pkeys;

/// The default ECDSA curve used (P-256)
final ECDomainParameters ECDSACurve = ECCurve_secp256r1();

/// Exception thrown when an ECDSA key is invalid
class ECDSAKeyException implements Exception {
  final String message;
  ECDSAKeyException(this.message);
  @override
  String toString() => message;
}

/// Implementation of ECDSA public key
class EcdsaPublicKey implements p2pkeys.PublicKey {
  final ECPublicKey _key;

  EcdsaPublicKey(this._key);

  /// Creates an EcdsaPublicKey from raw bytes (DER encoded)
  factory EcdsaPublicKey.fromRawBytes(Uint8List bytes) {
    try {
      final parser = pc.ASN1Parser(bytes);
      final asn1Sequence = parser.nextObject() as pc.ASN1Sequence;
      
      // Extract the x and y coordinates
      final x = (asn1Sequence.elements![0] as pc.ASN1Integer).integer!;
      final y = (asn1Sequence.elements![1] as pc.ASN1Integer).integer!;
      
      // Create the public key
      final curve = ECCurve_secp256r1();
      final point = curve.curve.createPoint(x, y);
      if (point == null) {
        throw ECDSAKeyException('Failed to create EC point from coordinates');
      }
      
      return EcdsaPublicKey(ECPublicKey(point, ECDSACurve));
    } catch (e) {
      throw ECDSAKeyException('Failed to parse ECDSA public key: ${e.toString()}');
    }
  }

  /// Creates an EcdsaPublicKey from its protobuf bytes
  static p2pkeys.PublicKey unmarshal(Uint8List bytes) {
    final pbKey = pb.PublicKey.fromBuffer(bytes);

    if (pbKey.type != pb.KeyType.ECDSA) {
      throw FormatException('Not an ECDSA public key');
    }
    return EcdsaPublicKey.fromRawBytes(Uint8List.fromList(pbKey.data));
  }

  @override
  pb.KeyType get type => pb.KeyType.ECDSA;

  @override
  Uint8List get raw {
    try {
      // Get the point Q from the public key
      final q = _key.Q!;
      
      // Get the x and y coordinates as bytes
      final x = q.x!.toBigInteger()!;
      final y = q.y!.toBigInteger()!;
      
      // Create a simple ASN.1 sequence with the x and y coordinates
      final asn1Sequence = pc.ASN1Sequence();
      asn1Sequence.add(pc.ASN1Integer(x));
      asn1Sequence.add(pc.ASN1Integer(y));
      
      return Uint8List.fromList(asn1Sequence.encode());
    } catch (e) {
      throw ECDSAKeyException('Failed to encode ECDSA public key: ${e.toString()}');
    }
  }

  @override
  Uint8List marshal() {
    final pbKey = pb.PublicKey(
      type: type,
      data: raw,
    );
    return pbKey.writeToBuffer();
  }

  @override
  Future<bool> verify(Uint8List data, Uint8List signature) async {
    try {
      // Parse the ASN.1 encoded signature
      final parser = pc.ASN1Parser(signature);
      final asn1Sequence = parser.nextObject() as pc.ASN1Sequence;
      
      final r = (asn1Sequence.elements![0] as pc.ASN1Integer).integer!;
      final s = (asn1Sequence.elements![1] as pc.ASN1Integer).integer!;
      
      // Create the signer
      final signer = ECDSASigner(SHA256Digest());
      signer.init(false, PublicKeyParameter<ECPublicKey>(_key));
      
      // Hash the data
      final digest = SHA256Digest();
      final hash = Uint8List(digest.digestSize);
      digest.update(data, 0, data.length);
      digest.doFinal(hash, 0);
      
      // Verify the signature
      return signer.verifySignature(hash, ECSignature(r, s));
    } catch (e) {
      return false;
    }
  }

  @override
  Future<bool> equals(p2pkeys.PublicKey other) async {
    if (other is! EcdsaPublicKey) return false;

    // Compare the Q points
    final q1 = _key.Q!;
    final q2 = other._key.Q!;
    
    return q1.x!.toBigInteger() == q2.x!.toBigInteger() && 
           q1.y!.toBigInteger() == q2.y!.toBigInteger();
  }
}

/// Implementation of ECDSA private key
class EcdsaPrivateKey implements p2pkeys.PrivateKey {
  final ECPrivateKey _key;
  late final EcdsaPublicKey _publicKey;

  EcdsaPrivateKey(this._key, this._publicKey);

  /// Creates an EcdsaPrivateKey from raw bytes (DER encoded)
  static Future<p2pkeys.PrivateKey> fromRawBytes(Uint8List bytes) async {
    try {
      final parser = pc.ASN1Parser(bytes);
      final asn1Sequence = parser.nextObject() as pc.ASN1Sequence;
      
      // Extract the private value (d)
      final d = (asn1Sequence.elements![0] as pc.ASN1Integer).integer!;
      
      // Extract the public key coordinates (if present)
      final x = (asn1Sequence.elements![1] as pc.ASN1Integer).integer!;
      final y = (asn1Sequence.elements![2] as pc.ASN1Integer).integer!;
      
      // Create the public key
      final curve = ECCurve_secp256r1();
      final point = curve.curve.createPoint(x, y);
      if (point == null) {
        throw ECDSAKeyException('Failed to create EC point from coordinates');
      }
      
      final privateKey = ECPrivateKey(d, ECDSACurve);
      final publicKey = ECPublicKey(point, ECDSACurve);
      
      return EcdsaPrivateKey(privateKey, EcdsaPublicKey(publicKey));
    } catch (e) {
      throw ECDSAKeyException('Failed to parse ECDSA private key: ${e.toString()}');
    }
  }

  /// Creates an EcdsaPrivateKey from its protobuf bytes
  static Future<p2pkeys.PrivateKey> unmarshal(Uint8List bytes) async {
    final pbKey = pb.PrivateKey.fromBuffer(bytes);

    if (pbKey.type != pb.KeyType.ECDSA) {
      throw FormatException('Not an ECDSA private key');
    }
    
    return fromRawBytes(Uint8List.fromList(pbKey.data));
  }

  @override
  pb.KeyType get type => pb.KeyType.ECDSA;

  @override
  Uint8List get raw {
    try {
      // Get the private value
      final d = _key.d!;
      
      // Get the public key point
      final q = _publicKey._key.Q!;
      
      // Create a simple ASN.1 sequence with the private value and public key coordinates
      final asn1Sequence = pc.ASN1Sequence();
      asn1Sequence.add(pc.ASN1Integer(d));
      asn1Sequence.add(pc.ASN1Integer(q.x!.toBigInteger()!));
      asn1Sequence.add(pc.ASN1Integer(q.y!.toBigInteger()!));
      
      return Uint8List.fromList(asn1Sequence.encode());
    } catch (e) {
      throw ECDSAKeyException('Failed to encode ECDSA private key: ${e.toString()}');
    }
  }

  @override
  Uint8List marshal() {
    final pbKey = pb.PrivateKey(
      type: type,
      data: raw,
    );
    return pbKey.writeToBuffer();
  }

  @override
  Future<Uint8List> sign(Uint8List data) async {
    try {
      // Create the signer
      final signer = ECDSASigner(SHA256Digest());
      signer.init(true, PrivateKeyParameter<ECPrivateKey>(_key));
      
      // Hash the data
      final digest = SHA256Digest();
      final hash = Uint8List(digest.digestSize);
      digest.update(data, 0, data.length);
      digest.doFinal(hash, 0);
      
      // Sign the hash
      final signature = signer.generateSignature(hash) as ECSignature;
      
      // Encode the signature in ASN.1 DER format
      final asn1Sequence = pc.ASN1Sequence();
      asn1Sequence.add(pc.ASN1Integer(signature.r));
      asn1Sequence.add(pc.ASN1Integer(signature.s));
      
      return Uint8List.fromList(asn1Sequence.encode());
    } catch (e) {
      throw ECDSAKeyException('Failed to sign data: ${e.toString()}');
    }
  }

  @override
  p2pkeys.PublicKey get publicKey => _publicKey;

  @override
  Future<bool> equals(p2pkeys.PrivateKey other) async {
    if (other is! EcdsaPrivateKey) return false;
    
    // Compare public keys
    final publicKeyEquals = await _publicKey.equals(other.publicKey);
    if (!publicKeyEquals) return false;
    
    // Compare private values
    return _key.d == other._key.d;
  }
}

/// Generate a new ECDSA key pair
Future<p2pkeys.KeyPair> generateEcdsaKeyPair() async {
  // Use the key generator from core/crypto/key_generator.dart
  final keyPair = await generateEcdsaKeyPair();
  final publicKey = keyPair.publicKey as ECPublicKey;
  final privateKey = keyPair.privateKey as ECPrivateKey;
  
  final ecdsaPublicKey = EcdsaPublicKey(publicKey);
  final ecdsaPrivateKey = EcdsaPrivateKey(privateKey, ecdsaPublicKey);
  
  return p2pkeys.KeyPair(ecdsaPublicKey, ecdsaPrivateKey);
}