import 'dart:typed_data';
import 'package:dart_libp2p/core/crypto/ecdsa.dart';
import 'package:dart_libp2p/core/crypto/rsa.dart';

import 'package:dart_libp2p/core/crypto/pb/crypto.pb.dart' as pb;
import 'package:dart_libp2p/core/crypto/ed25519.dart';

/// Represents a cryptographic key
abstract class Key {
  /// Returns the key's type
  pb.KeyType get type;

  /// Returns the key's raw bytes
  Uint8List get raw;

  /// Returns the protobuf bytes of the key
  Uint8List marshal();
}

/// Represents a public key
abstract class PublicKey extends Key {

  /// Verifies a signature against the given data
  Future<bool> verify(Uint8List data, Uint8List signature);

  /// Checks if this public key is equal to another
  Future<bool> equals(PublicKey other);

  Uint8List marshal();
}

/// Represents a private key
abstract class PrivateKey extends Key {
  /// Signs the given data
  Future<Uint8List> sign(Uint8List data);

  /// Gets the public key corresponding to this private key
  PublicKey get publicKey;

  /// Checks if this private key is equal to another
  Future<bool> equals(PrivateKey other);
}

/// Represents a key pair (public + private key)
class KeyPair {
  final PublicKey publicKey;
  final PrivateKey privateKey;

  KeyPair(this.publicKey, this.privateKey);
}

Map <pb.KeyType, PublicKey Function(Uint8List)> PubKeyUnmarshallers = {
  pb.KeyType.ECDSA : (data) => EcdsaPublicKey.unmarshal(data),
  pb.KeyType.Ed25519 : (data) => Ed25519PublicKey.unmarshal(data),
  pb.KeyType.RSA : (data) => RsaPublicKey.unmarshal(data),
  // pb.KeyType.Secp256k1: (data) => ,
};


PublicKey publicKeyFromProto(pb.PublicKey pmes) {

  final unmarshalFunc = PubKeyUnmarshallers[pmes.type];

  if (unmarshalFunc == null){
    throw Exception("Unsupported public key type : ${pmes.type}");
  }

  return unmarshalFunc(pmes.writeToBuffer());
}