import 'dart:typed_data';
import 'package:pointycastle/pointycastle.dart' as pc;
import 'package:pointycastle/api.dart';
import 'package:pointycastle/asymmetric/api.dart';
import 'package:pointycastle/signers/rsa_signer.dart';
import 'package:pointycastle/digests/sha256.dart';
import 'package:dart_libp2p/p2p/crypto/key_generator.dart';
import 'package:dart_libp2p/core/crypto/pb/crypto.pb.dart' as pb;
import 'package:dart_libp2p/core/crypto/keys.dart' as p2pkeys;

/// Minimum RSA key size in bits
const int minRsaKeyBits = 2048;

/// Maximum RSA key size in bits
const int maxRsaKeyBits = 8192;

/// Exception thrown when an RSA key is too small
class RsaKeyTooSmallException implements Exception {
  final String message;
  RsaKeyTooSmallException() : message = 'RSA keys must be >= $minRsaKeyBits bits to be useful';
  @override
  String toString() => message;
}

/// Exception thrown when an RSA key is too big
class RsaKeyTooBigException implements Exception {
  final String message;
  RsaKeyTooBigException() : message = 'RSA keys must be <= $maxRsaKeyBits bits';
  @override
  String toString() => message;
}

/// Implementation of RSA public key
class RsaPublicKey implements p2pkeys.PublicKey {
  final RSAPublicKey _key;

  RsaPublicKey(this._key) {
    // Validate key size
    if (_key.modulus!.bitLength < minRsaKeyBits) {
      throw RsaKeyTooSmallException();
    }
    if (_key.modulus!.bitLength > maxRsaKeyBits) {
      throw RsaKeyTooBigException();
    }
  }

  /// Creates an RsaPublicKey from raw bytes (DER encoded)
  factory RsaPublicKey.fromRawBytes(Uint8List bytes) {
    final parser = pc.ASN1Parser(bytes);
    final asn1Sequence = parser.nextObject() as pc.ASN1Sequence;
    final publicKey = RSAPublicKey(
      (asn1Sequence.elements?[0] as pc.ASN1Integer).integer!,
      (asn1Sequence.elements?[1] as pc.ASN1Integer).integer!,
    );
    
    return RsaPublicKey(publicKey);
  }

  factory RsaPublicKey.unmarshal(Uint8List bytes){
    final pbKey = pb.PublicKey.fromBuffer(bytes);

    if (pbKey.type != pb.KeyType.RSA) {
      throw FormatException('Not an RSA public key');
    }
    return RsaPublicKey.fromRawBytes(Uint8List.fromList(pbKey.data));

  }


  @override
  pb.KeyType get type => pb.KeyType.RSA;

  @override
  Uint8List get raw {
    final asn1Sequence = pc.ASN1Sequence();
    asn1Sequence.add(pc.ASN1Integer(_key.modulus));
    asn1Sequence.add(pc.ASN1Integer(_key.exponent));
    return Uint8List.fromList(asn1Sequence.encode());
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
      final signer = RSASigner(SHA256Digest(), '0609608648016503040201'); // SHA-256 with PKCS1v15 padding
      signer.init(false, PublicKeyParameter<RSAPublicKey>(_key));
      return signer.verifySignature(data, RSASignature(signature));
    } catch (e) {
      return false;
    }
  }

  @override
  Future<bool> equals(p2pkeys.PublicKey other) async {
    if (other is! RsaPublicKey) return false;

    // Compare modulus and exponent
    return _key.modulus == other._key.modulus && 
           _key.exponent == other._key.exponent;
  }
}

/// Implementation of RSA private key
class RsaPrivateKey implements p2pkeys.PrivateKey {
  final RSAPrivateKey _key;
  late final RsaPublicKey _publicKey;

  RsaPrivateKey(this._key, this._publicKey) {
    // Validate key size
    if (_key.modulus!.bitLength < minRsaKeyBits) {
      throw RsaKeyTooSmallException();
    }
    if (_key.modulus!.bitLength > maxRsaKeyBits) {
      throw RsaKeyTooBigException();
    }
  }

  static Future<p2pkeys.PrivateKey> fromRawBytes(Uint8List bytes) async {
    if (bytes.isEmpty) {
      throw FormatException('Empty byte array provided');
    }

    try {

      // Debug information

      final parser = pc.ASN1Parser(bytes);
      final asn1Object = parser.nextObject();

      if (asn1Object == null) {
        throw FormatException('Failed to parse ASN.1 object from bytes');
      }

      if (asn1Object is! pc.ASN1Sequence) {
        throw FormatException('Expected ASN.1 SEQUENCE but got: ${asn1Object.runtimeType}');
      }

      final asn1Sequence = asn1Object;

      // Parse the ASN.1 structure according to PKCS#1
      // RSAPrivateKey ::= SEQUENCE {
      //   version           Version,
      //   modulus           INTEGER,  -- n
      //   publicExponent    INTEGER,  -- e
      //   privateExponent   INTEGER,  -- d
      //   prime1            INTEGER,  -- p
      //   prime2            INTEGER,  -- q
      //   exponent1         INTEGER,  -- d mod (p-1)
      //   exponent2         INTEGER,  -- d mod (q-1)
      //   coefficient       INTEGER,  -- (inverse of q) mod p
      //   otherPrimeInfos   OtherPrimeInfos OPTIONAL
      // }

      if (asn1Sequence.elements == null || asn1Sequence.elements!.length < 9) {
        throw FormatException('RSA private key sequence does not contain required elements. Found: ${asn1Sequence.elements?.length ?? 0}');
      }

      // Validate and extract each element with proper type checking
      if (asn1Sequence.elements![0] is! pc.ASN1Integer) {
        throw FormatException('Expected version to be ASN1Integer');
      }
      final version = (asn1Sequence.elements![0] as pc.ASN1Integer).integer;
      if (version != BigInt.from(0)) {
        throw FormatException('Unsupported RSA private key version: $version');
      }

      // Extract and check all the required integers
      final elements = <BigInt?>[];
      for (int i = 0; i < 9; i++) {
        if (asn1Sequence.elements![i] is! pc.ASN1Integer) {
          throw FormatException('Expected ASN1Integer at position $i but got ${asn1Sequence.elements![i].runtimeType}');
        }
        elements.add((asn1Sequence.elements![i] as pc.ASN1Integer).integer);
      }

      final modulus = elements[1];
      final publicExponent = elements[2];
      final privateExponent = elements[3];
      final p = elements[4];
      final q = elements[5];
      final dP = elements[6];
      final dQ = elements[7];
      final qInv = elements[8];

      // Validate that no required values are null
      if (modulus == null || publicExponent == null || privateExponent == null ||
          p == null || q == null || dP == null || dQ == null || qInv == null) {
        throw FormatException('One or more required RSA parameters are null');
      }

      final privateKey = pc.RSAPrivateKey(
        modulus,
        privateExponent,
        p,
        q
      );

      final publicKey = pc.RSAPublicKey(
        modulus,
        publicExponent,
      );

      return RsaPrivateKey(privateKey, RsaPublicKey(publicKey));
    } catch (e) {
      if (e is FormatException) {
        rethrow;
      }
      throw FormatException('Failed to parse RSA private key: $e');
    }
  }

  // /// Creates an RsaPrivateKey from raw bytes (DER encoded PKCS#1)
  // static Future<p2pkeys.PrivateKey> fromRawBytes(Uint8List bytes) async {
  //   final parser = pc.ASN1Parser(bytes);
  //   final asn1Sequence = parser.nextObject() as pc.ASN1Sequence;
  //
  //   // Parse the ASN.1 structure according to PKCS#1
  //   // RSAPrivateKey ::= SEQUENCE {
  //   //   version           Version,
  //   //   modulus           INTEGER,  -- n
  //   //   publicExponent    INTEGER,  -- e
  //   //   privateExponent   INTEGER,  -- d
  //   //   prime1            INTEGER,  -- p
  //   //   prime2            INTEGER,  -- q
  //   //   exponent1         INTEGER,  -- d mod (p-1)
  //   //   exponent2         INTEGER,  -- d mod (q-1)
  //   //   coefficient       INTEGER,  -- (inverse of q) mod p
  //   //   otherPrimeInfos   OtherPrimeInfos OPTIONAL
  //   // }
  //
  //   final version = (asn1Sequence.elements?[0] as pc.ASN1Integer).integer;
  //   if (version != BigInt.from(0)) {
  //     throw FormatException('Unsupported RSA private key version');
  //   }
  //
  //   final modulus = (asn1Sequence.elements?[1] as pc.ASN1Integer).integer;
  //   final publicExponent = (asn1Sequence.elements?[2] as pc.ASN1Integer).integer;
  //   final privateExponent = (asn1Sequence.elements?[3] as pc.ASN1Integer).integer;
  //   final p = (asn1Sequence.elements?[4] as pc.ASN1Integer).integer;
  //   final q = (asn1Sequence.elements?[5] as pc.ASN1Integer).integer;
  //
  //   final privateKey = RSAPrivateKey(
  //     modulus!,
  //     privateExponent!,
  //     p,
  //     q,
  //   );
  //
  //   final publicKey = RSAPublicKey(
  //     modulus,
  //     publicExponent!,
  //   );
  //
  //   return RsaPrivateKey(privateKey, RsaPublicKey(publicKey));
  // }

  /// Creates an RsaPrivateKey from its protobuf bytes
  static Future<p2pkeys.PrivateKey> unmarshal(Uint8List bytes) async {
    final pbKey = pb.PrivateKey.fromBuffer(bytes);

    if (pbKey.type != pb.KeyType.RSA) {
      throw FormatException('Not an RSA private key');
    }
    
    return fromRawBytes(Uint8List.fromList(pbKey.data));
  }

  @override
  pb.KeyType get type => pb.KeyType.RSA;

  @override
  Uint8List get raw {
    // Encode the private key in ASN.1 DER format according to PKCS#1
    final asn1Sequence = pc.ASN1Sequence();
    asn1Sequence.add(pc.ASN1Integer(BigInt.from(0))); // version
    asn1Sequence.add(pc.ASN1Integer(_key.modulus!));
    
    // For the public exponent, we need to extract it from the public key
    asn1Sequence.add(pc.ASN1Integer(_publicKey._key.exponent!));
    
    asn1Sequence.add(pc.ASN1Integer(_key.privateExponent!));
    asn1Sequence.add(pc.ASN1Integer(_key.p!));
    asn1Sequence.add(pc.ASN1Integer(_key.q!));
    
    // Calculate d mod (p-1)
    final dP = _key.privateExponent! % (_key.p! - BigInt.from(1));
    asn1Sequence.add(pc.ASN1Integer(dP));
    
    // Calculate d mod (q-1)
    final dQ = _key.privateExponent! % (_key.q! - BigInt.from(1));
    asn1Sequence.add(pc.ASN1Integer(dQ));
    
    // Calculate (inverse of q) mod p
    final qInv = _key.q!.modInverse(_key.p!);
    asn1Sequence.add(pc.ASN1Integer(qInv));
    
    return Uint8List.fromList(asn1Sequence.encode() ?? []);
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
    final signer = RSASigner(SHA256Digest(), '0609608648016503040201'); // SHA-256 with PKCS1v15 padding
    signer.init(true, PrivateKeyParameter<RSAPrivateKey>(_key));
    final signature = signer.generateSignature(data);
    return signature.bytes;
  }

  @override
  p2pkeys.PublicKey get publicKey => _publicKey;

  @override
  Future<bool> equals(p2pkeys.PrivateKey other) async {
    if (other is! RsaPrivateKey) return false;
    
    // Compare public keys (modulus and exponent)
    final publicKeyEquals = await _publicKey.equals(other.publicKey);
    if (!publicKeyEquals) return false;
    
    // Compare private exponent
    return _key.privateExponent == other._key.privateExponent;
  }
}

/// Generate a new RSA key pair with the specified number of bits
Future<p2pkeys.KeyPair> generateRsaKeyPair({int bits = 2048}) async {
  if (bits < minRsaKeyBits) {
    throw RsaKeyTooSmallException();
  }
  if (bits > maxRsaKeyBits) {
    throw RsaKeyTooBigException();
  }
  
  return await generateRSAKeyPair(bits: bits);
}


/// Creates an RsaPublicKey from its protobuf bytes
p2pkeys.PublicKey unmarshalRsaPublicKey(Uint8List bytes) {
  final pbKey = pb.PublicKey.fromBuffer(bytes);

  if (pbKey.type != pb.KeyType.RSA) {
    throw FormatException('Not an RSA public key');
  }
  return RsaPublicKey.fromRawBytes(Uint8List.fromList(pbKey.data));
}


