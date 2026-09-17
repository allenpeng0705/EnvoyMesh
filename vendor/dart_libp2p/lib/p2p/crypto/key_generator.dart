import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:cryptography/cryptography.dart';
import 'package:pointycastle/ecc/curves/secp256k1.dart';
import 'package:pointycastle/key_generators/ec_key_generator.dart';
import 'package:pointycastle/key_generators/rsa_key_generator.dart';
import 'package:pointycastle/pointycastle.dart' as pc;
import 'package:pointycastle/random/fortuna_random.dart';
import 'package:dart_libp2p/core/crypto/rsa.dart' as rsa;
import 'package:dart_libp2p/core/crypto/ed25519.dart' as ed;

import '../../core/crypto/keys.dart' as p2pkeys;


class RsaKeyPair {
  final rsa.RsaPublicKey publicKey;
  final rsa.RsaPrivateKey privateKey;

  RsaKeyPair(this.publicKey, this.privateKey);
}

/// Generates an RSA key pair using the pointycastle package
// Future<pc.AsymmetricKeyPair<pc.PublicKey, pc.PrivateKey >> generateRSAKeyPair({int bits = 2048}) async {
Future<p2pkeys.KeyPair> generateRSAKeyPair({int bits = 2048}) async {
  var generator = RSAKeyGenerator();

  var params = pc.RSAKeyGeneratorParameters(BigInt.from(65537), bits, 64);
  generator.init(pc.ParametersWithRandom( params, fortunaRandom()));

  final rsaKeyPair = generator.generateKeyPair();

  // RsaKeyPair(RsaPublicKey(), RsaPrivateKey());
  final pubKey = rsa.RsaPublicKey(rsaKeyPair.publicKey as pc.RSAPublicKey);
  final privKey = rsa.RsaPrivateKey(rsaKeyPair.privateKey as pc.RSAPrivateKey, pubKey);

  return p2pkeys.KeyPair(pubKey, privKey);

}


pc.SecureRandom fortunaRandom() {
  final secureRandom = pc.SecureRandom('Fortuna')
    ..seed(pc.KeyParameter(generateSecureRandomBytes()));
  return secureRandom;
}

Uint8List generateSecureRandomBytes() {
  final random = Random.secure();
  final bytes = Uint8List(32);

  for (var i = 0; i < bytes.length; i++) {
    bytes[i] = random.nextInt(256);
  }

  return bytes;
}


// class Ed25519KeyPair {
//   final ed.Ed25519PublicKey publicKey;
//   final ed.Ed25519PrivateKey privateKey;
//
//   Ed25519KeyPair(this.publicKey, this.privateKey);
// }

/// Generates an Ed25519 key pair using the Cryptography package
Future<p2pkeys.KeyPair> generateEd25519KeyPair() async {
  final algorithm = Ed25519();
  final keyPair = await algorithm.newKeyPair();
  final cryptoPubkey= await keyPair.extractPublicKey();
  final cryptoPrivatekey = await keyPair.extractPrivateKeyBytes();


  final edPubkey = await ed.Ed25519PublicKey.fromRawBytes(Uint8List.fromList(cryptoPubkey.bytes));
  final edPrivkey = await ed.Ed25519PrivateKey.fromRawBytes(Uint8List.fromList(cryptoPrivatekey));

  // return Ed25519KeyPair(edPubkey, edPrivkey);
  return p2pkeys.KeyPair(edPubkey, edPrivkey);
}

/// Generates an ECDSA key pair using the pointycastle package
// Future<pc.AsymmetricKeyPair<pc.PublicKey, pc.PrivateKey>> generateECDSAKeyPair() async {
//   // Create an EC key generator
//   final keyGen = ECKeyGenerator();
//
//   // Initialize with the P-256 curve and a secure random
//   final curve = ECCurve_secp256r1();
//   final params = pc.ECKeyGeneratorParameters(curve);
//   keyGen.init(pc.ParametersWithRandom(params, fortunaRandom()));
//
//   // Generate the key pair
//   return keyGen.generateKeyPair();
// }
//
// final _secureRandom =  FortunaRandom();
//
// Uint8List _seed() {
//   var random = Random.secure();
//   var seed = List<int>.generate(32, (_) => random.nextInt(256));
//   return Uint8List.fromList(seed);
// }
//
// /// Generates a secp256k1 key pair using the elliptic package
// Future<AsymmetricKeyPair> generateSecp256k1KeyPair() async {
//
//   final curve = ECCurve_secp256k1();
//   var keyParams = pc.ECKeyGeneratorParameters(curve);
//   _secureRandom.seed(pc.KeyParameter(_seed()));
//
//   var generator = ECKeyGenerator();
//   generator.init(pc.ParametersWithRandom(keyParams, _secureRandom));
//
//   //FIXME: Check generated bitlength !
//   final keypair = generator.generateKeyPair();
//
//   final privateKey = keypair.privateKey;
//   final publicKey = keypair.publicKey;
//
//   return AsymmetricKeyPair(publicKey, privateKey );
// }

/// Represents an asymmetric key pair from the elliptic package
// class AsymmetricKeyPair {
//   final PublicKey publicKey;
//   final PrivateKey privateKey;
//
//   AsymmetricKeyPair(this.publicKey, this.privateKey);
// }
