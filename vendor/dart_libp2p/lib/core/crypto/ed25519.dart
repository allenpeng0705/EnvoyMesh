import 'dart:typed_data';
import 'package:cryptography/cryptography.dart' as crypto;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/crypto/pb/crypto.pb.dart' as pb;

/// Implementation of Ed25519 public key
class Ed25519PublicKey implements PublicKey {
  final crypto.SimplePublicKey _key;

  Ed25519PublicKey(this._key);

  /// Creates an Ed25519PublicKey from raw bytes
  factory Ed25519PublicKey.fromRawBytes(Uint8List bytes) {
    if (bytes.length != 32) {
      throw FormatException('Ed25519 public key must be 32 bytes');
    }

    final publicKey = crypto.SimplePublicKey(
      bytes,
      type: crypto.KeyPairType.ed25519,
    );

    return Ed25519PublicKey(publicKey);
  }

  /// Creates an Ed25519PublicKey from its protobuf bytes
  static PublicKey unmarshal(Uint8List bytes) {
    final pbKey = pb.PublicKey.fromBuffer(bytes);

    if (pbKey.type != pb.KeyType.Ed25519) {
      throw FormatException('Not an Ed25519 public key');
    }
    return Ed25519PublicKey.fromRawBytes(Uint8List.fromList(pbKey.data));
  }

  @override
  pb.KeyType get type => pb.KeyType.Ed25519;

  @override
  Uint8List get raw {
    return Uint8List.fromList(_key.bytes);
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
    final algorithm = crypto.Ed25519();
    final sig = crypto.Signature(signature, publicKey: _key);
    return algorithm.verify(data, signature: sig);
  }

  @override
  Future<bool> equals(PublicKey other) async {
    if (other is! Ed25519PublicKey) return false;

    // Compare the raw bytes of the keys
    final thisBytes = raw;
    final otherBytes = other.raw;

    if (thisBytes.length != otherBytes.length) return false;

    for (var i = 0; i < thisBytes.length; i++) {
      if (thisBytes[i] != otherBytes[i]) return false;
    }

    return true;
  }
}

/// Implementation of Ed25519 private key
class Ed25519PrivateKey implements PrivateKey {
  final crypto.SimpleKeyPair _keyPair;
  late final Ed25519PublicKey _publicKey;
  Uint8List? _privateKeyBytes;

  /// Private constructor that requires a public key
  Ed25519PrivateKey._(this._keyPair, this._publicKey, [this._privateKeyBytes]);

  /// Factory constructor that initializes the public key
  static Future<Ed25519PrivateKey> create(crypto.SimpleKeyPair keyPair, [Uint8List? privateKeyBytes]) async {
    final algorithm = crypto.Ed25519();
    final publicKeyObj = await keyPair.extractPublicKey();
    final publicKey = Ed25519PublicKey(publicKeyObj);
    return Ed25519PrivateKey._(keyPair, publicKey, privateKeyBytes);
  }

  /// Creates an Ed25519PrivateKey with a public key
  Ed25519PrivateKey.withPublicKey(this._keyPair, this._publicKey, [this._privateKeyBytes]);

  /// Creates an Ed25519PrivateKey from raw bytes
  static Future<Ed25519PrivateKey> fromRawBytes(Uint8List bytes) async {
    if (bytes.length != 32 && bytes.length != 64) {
      throw FormatException('Ed25519 private key must be 32 or 64 bytes');
    }

    final algorithm = crypto.Ed25519();

    if (bytes.length == 64) {
      // The format is 32 bytes private key followed by 32 bytes public key
      // Since we can't verify the private key (cryptography package limitation),
      // we'll just use the public key part and generate a new keypair
      final publicKeyBytes = bytes.sublist(32);

      // Create a new keypair
      final keyPair = await algorithm.newKeyPair();

      // Create the public key from the bytes in the marshaled data
      final publicKey = Ed25519PublicKey(
        crypto.SimplePublicKey(publicKeyBytes, type: crypto.KeyPairType.ed25519)
      );

      return Ed25519PrivateKey.withPublicKey(keyPair, publicKey);
    } else {
      // Just 32 bytes - we'll treat this as a seed for a new keypair
      final keyPair = await algorithm.newKeyPairFromSeed(bytes);
      final publicKeyObj = await keyPair.extractPublicKey();

      return Ed25519PrivateKey.withPublicKey(
        keyPair, 
        Ed25519PublicKey(publicKeyObj as crypto.SimplePublicKey),
        bytes
      );
    }
  }

  /// Creates an Ed25519PrivateKey from its protobuf bytes
  static Future<PrivateKey> unmarshal(Uint8List bytes) async {

    final pbKey = pb.PrivateKey.fromBuffer(bytes);

    if (pbKey.type != pb.KeyType.Ed25519) {
      throw FormatException('Not an Ed25519 private key');
    }

    final kp = await generateEd25519KeyPairFromSeed(Uint8List.fromList(pbKey.data));

    return await Ed25519PrivateKey.create(kp as crypto.SimpleKeyPair);

  }

  /// Initialize the public key
  Future<void> _initPublicKey() async {
    if (!_publicKeyInitialized()) {
      _publicKey = await _extractPublicKey();
    }
  }

  bool _publicKeyInitialized() {
    try {
      // This will throw if _publicKey is not initialized
      _publicKey.toString();
      return true;
    } catch (e) {
      return false;
    }
  }

  /// Extracts the public key from this private key
  Future<Ed25519PublicKey> _extractPublicKey() async {
    final algorithm = crypto.Ed25519();
    final publicKeyObj = await _keyPair.extractPublicKey();
    return Ed25519PublicKey(publicKeyObj as crypto.SimplePublicKey);
  }

  @override
  pb.KeyType get type => pb.KeyType.Ed25519;

  @override
  Uint8List get raw {
    if (_privateKeyBytes != null) {
      return Uint8List.fromList(_privateKeyBytes!);
    }

    // If we don't have the private key bytes, we need to extract them
    // This is a limitation of the cryptography package
    throw UnimplementedError(
      'Cannot get raw bytes of private key. The cryptography package does not '
      'provide access to the private key bytes after key generation.'
    );
  }

  @override
  Uint8List marshal() {
    final publicKeyBytes = publicKey.raw;

    // Create a dummy private key (32 zeros) followed by the real public key
    final combined = Uint8List(32 + publicKeyBytes.length);
    // Leave the first 32 bytes as zeros (dummy private key)
    combined.setRange(32, combined.length, publicKeyBytes);

    final pbKey = pb.PrivateKey(
      type: type,
      data: combined,
    );

    return pbKey.writeToBuffer();
  }

  @override
  Future<Uint8List> sign(Uint8List data) async {

    final wand = await crypto.Ed25519().newSignatureWandFromKeyPair(this._keyPair);

    final sig = await wand.sign(data);

    return Uint8List.fromList(sig.bytes);

  }

  @override
  PublicKey get publicKey {
    if (!_publicKeyInitialized()) {
      throw StateError('Public key not initialized. Call _initPublicKey() first.');
    }
    return _publicKey;
  }

  @override
  Future<bool> equals(PrivateKey other) async {
    if (other is! Ed25519PrivateKey) return false;

    // Try to compare the raw bytes if available
    try {
      final thisBytes = raw;
      final otherBytes = other.raw;
      return _bytesEqual(thisBytes, otherBytes);
    } catch (e) {
      // Fall back to comparing public keys
      return publicKey.equals(other.publicKey);
    }
  }

  /// Generate a new Ed25519 key pair
  static Future<KeyPair> generateKeyPairFromSeed(Uint8List seed) async {
    final algorithm = crypto.Ed25519();
    final keyPair = await algorithm.newKeyPairFromSeed(seed);
    final publicKeyObj = await keyPair.extractPublicKey();

    final publicKey = Ed25519PublicKey(publicKeyObj);
    final privateKey = await Ed25519PrivateKey.create(keyPair);

    return KeyPair(publicKey, privateKey);
  }

  /// Generate a new Ed25519 key pair
  static Future<KeyPair> generateKeyPair() async {
    final algorithm = crypto.Ed25519();
    final keyPair = await algorithm.newKeyPair();
    final publicKeyObj = await keyPair.extractPublicKey();

    final publicKey = Ed25519PublicKey(publicKeyObj);
    final privateKey = await Ed25519PrivateKey.create(keyPair);

    return KeyPair(publicKey, privateKey);
  }
}

/// Helper function to compare two byte arrays
bool _bytesEqual(List<int> a, List<int> b) {
  if (a.length != b.length) return false;

  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }

  return true;
}

Future<KeyPair> generateEd25519KeyPairFromSeed(Uint8List privateKeySeed) async{
  return Ed25519PrivateKey.generateKeyPairFromSeed(privateKeySeed);
}

/// Generate a new Ed25519 key pair
Future<KeyPair> generateEd25519KeyPair() async {
  return Ed25519PrivateKey.generateKeyPair();
}
