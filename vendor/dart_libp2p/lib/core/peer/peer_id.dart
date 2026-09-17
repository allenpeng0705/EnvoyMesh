import 'dart:typed_data';
import 'package:bs58/bs58.dart';
import 'package:dcid/dcid.dart' as cid_lib; // Added alias
import 'package:dart_libp2p/core/routing/routing.dart';
import 'package:dart_multihash/dart_multihash.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart' as key_generator;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/crypto/ed25519.dart';
import 'package:collection/collection.dart';

/// Implementation of PeerId that follows the libp2p specification
class PeerId {

  static const int _maxInlineKeyLength = 42;

  Uint8List? _multihash;

  PeerId(this._multihash);

  /// Creates a PeerId from a public key
  PeerId.fromPublicKey(PublicKey publicKey) {
    final keyBytes = publicKey.marshal();

    // If key is small enough, use identity multihash
    if (keyBytes.length <= _maxInlineKeyLength) {
      final identityMultihash = Multihash.encode('identity', keyBytes);
      _multihash = identityMultihash.toBytes();
      return;
    }

    // Otherwise use SHA2-256
    final sha256Multihash = Multihash.encode('sha2-256', keyBytes);
    _multihash = sha256Multihash.toBytes();
  }

  /// Decode accepts an encoded peer ID and returns the decoded ID if the input is
  /// valid.
  ///
  /// The encoded peer ID can either be a CID of a key or a raw multihash (identity
  /// or sha256-256).
  static Uint8List _parseStringToMultihash(String s) {
    try {
      // Use CID.fromString to parse, which returns a CID object directly.
      final actualCid = cid_lib.CID.fromString(s);

      // Use constants CID.V1, CID.V0 and properties from the actualCid object.
      // Access codec from cid_lib.codecs map.
      if (actualCid.version == cid_lib.CID.V1 && actualCid.codec == cid_lib.codecNameToCode['libp2p-key']!) {
        return actualCid.multihash;
      }
      if (actualCid.version == cid_lib.CID.V0) {
        // CIDv0's multihash is what a legacy PeerID (Qm...) contains.
        return actualCid.multihash;
      }
      // It's a CID, but not one we recognize for PeerIDs
      throw FormatException('CID "$s" is not a valid libp2p PeerID format (version ${actualCid.version}/codec ${actualCid.codec} mismatch)');
    } catch (e) {
      // CID.fromString failed or threw the FormatException above.
      // Try parsing as a legacy raw base58 multihash if 's' starts with '1' (identity).
      // 'Qm...' (CIDv0) should have been handled by CID.decodeCid.
      if (s.startsWith('1')) { // Legacy base58 encoded identity multihash
        try {
          final bytes = base58.decode(s);
          Multihash.decode(bytes); // Validates if it's a proper multihash
          return Uint8List.fromList(bytes);
        } catch (err) {
          throw FormatException('Failed to parse legacy base58 peer ID "$s": $err');
        }
      }
      // If it wasn't a valid PeerID CID and not a legacy '1...' identity multihash.
      if (e is FormatException && e.message.contains('libp2p PeerID format')) {
        rethrow; // Our specific error from above
      }
      throw FormatException('Invalid peer ID format for "$s": $e');
    }
  }

  static PeerId decode(String s) => PeerId(_parseStringToMultihash(s));

  /// FromCid converts a CID to a peer ID, if possible.
  static PeerId fromCid(cid_lib.CID cid) { // Parameter type updated to aliased CID
    // Note: The input 'cid' here is already a CID object.
    // Use constants CID.V1, CID.V0 and properties from the cid object.
    // Access codec from cid_lib.codecs map.
    if (cid.version == cid_lib.CID.V1 && cid.codec == cid_lib.codecNameToCode['libp2p-key']!) {
      return PeerId(cid.multihash);
    }
    if (cid.version == cid_lib.CID.V0) {
      // CIDv0 is also acceptable, its multihash is used directly.
      return PeerId(cid.multihash);
    }
    throw FormatException('Invalid CID: not a libp2p-key CID (v1 with codec 0x${cid_lib.codecNameToCode['libp2p-key']!}) or a CIDv0. Got v${cid.version} codec 0x${cid.codec.toRadixString(16)}');
  }

  /// ToCid encodes a peer ID as a CID of the public key.
  cid_lib.CID toCid() { // Return type updated to aliased CID
    if (_multihash == null || _multihash!.isEmpty) {
      throw StateError('Cannot convert invalid PeerId to CID: multihash is empty or null.');
    }
    // Create a CIDv1 with libp2p-key codec and the peer's multihash.
    // Use constant CID.V1 for version.
    // Use cid_lib.codecs map for codec constant.
    return cid_lib.CID(cid_lib.CID.V1, cid_lib.codecNameToCode['libp2p-key']!, _multihash!);
  }

  /// Creates a PeerId from a private key
  PeerId.fromPrivateKey(PrivateKey privateKey) {
    final publicKey = privateKey.publicKey;
    final keyBytes = publicKey.marshal();

    // If key is small enough, use identity multihash
    if (keyBytes.length <= _maxInlineKeyLength) {
      final identityMultihash = Multihash.encode('identity', keyBytes);
      _multihash = identityMultihash.toBytes();
      return;
    }

    // Otherwise use SHA2-256
    final sha256Multihash = Multihash.encode('sha2-256', keyBytes);
    _multihash = sha256Multihash.toBytes();
  }

  /// Creates a PeerId from a multihash
  static PeerId fromMultihash(Uint8List bytes) {
    // Validate that the bytes are a valid multihash
    try {
      Multihash.decode(bytes);
      return PeerId(bytes);
    } catch (e) {
      throw FormatException('Invalid multihash: $e');
    }
  }

  /// Creates a PeerId from bytes
  static PeerId fromBytes(Uint8List bytes) {
    return fromMultihash(bytes);
  }

  /// Creates a PeerId from a string representation (either legacy or CIDv1)
  PeerId.fromString(String str) : _multihash = _parseStringToMultihash(str);

  /// Creates a PeerId from a JSON representation
  static Uint8List _parseJsonToMultihash(Map<String, dynamic> json) {
    if (json.containsKey('cid')) {
      final cidStr = json['cid'];
      if (cidStr is String) {
        try {
          return _parseStringToMultihash(cidStr);
        } catch (e) {
          throw FormatException('Invalid PeerId JSON: failed to decode CID string "$cidStr": $e');
        }
      } else {
        throw FormatException('Invalid PeerId JSON: "cid" field is not a string.');
      }
    } else if (json.containsKey('bytes')) { // Legacy: raw multihash bytes, base58 encoded
      final bytesStr = json['bytes'];
      if (bytesStr is String) {
        try {
          final bytes = base58.decode(bytesStr);
          Multihash.decode(bytes); // Validate it's a multihash
          return Uint8List.fromList(bytes);
        } catch (e) {
          throw FormatException('Invalid PeerId JSON: failed to decode "bytes" field "$bytesStr": $e');
        }
      } else {
        throw FormatException('Invalid PeerId JSON: "bytes" field is not a string.');
      }
    }
    throw FormatException('Invalid PeerId JSON format: missing "cid" or "bytes" key.');
  }

  PeerId.fromJson(Map<String, dynamic> json) : _multihash = _parseJsonToMultihash(json);

  static Future<PeerId> random() async {
    // Generate a random Ed25519 key and create PeerId from it
    final keyPair = await key_generator.generateEd25519KeyPair();
    final publicKey = keyPair.publicKey;

    // Convert to our PublicKey type
    final ourPublicKey = publicKey;

    // Create PeerId from our public key
    return PeerId.fromPublicKey(ourPublicKey);
  }

  @override
  Uint8List toBytes() {
    return Uint8List.fromList(_multihash ?? Uint8List.fromList([]));
  }

  /// Converts to the new CIDv1 format string (e.g., base32 encoded for v1)
  String toCIDString() {
    final cid = toCid(); // This can throw if _multihash is invalid
    // cid.toString() will produce the canonical string representation (base32 for CIDv1)
    return cid.toString();
  }

  @override
  String toString() {
    // For now, still use the legacy format by default
    return base58.encode(_multihash ?? Uint8List.fromList([]));
  }

  String toBase58() {
    // For now, still use the legacy format by default
    return toString();
  }

  @override
  String shortString() {
    final pid = toString();
    if (pid.length <= 10) {
      return '<peer.ID $pid>';
    }
    return '<peer.ID ${pid.substring(0, 2)}*${pid.substring(pid.length - 6)}>';
  }

  @override
  Map<String, dynamic> loggable() {
    return {
      'peerID': toString(),
    };
  }

  @override
  bool matchesPublicKey(PublicKey publicKey) {
    final derivedId = PeerId.fromPublicKey(publicKey);
    return this == derivedId;
  }

  @override
  bool matchesPrivateKey(PrivateKey privateKey) {
    final publicKey = privateKey.publicKey;
    return matchesPublicKey(publicKey);
  }

  @override
  Future<PublicKey?> extractPublicKey() async {
    try {
      final decoded = Multihash.decode(_multihash ?? Uint8List.fromList([]));
      // Only identity multihash contains the public key
      if (decoded.code != 0x00) { // 0x00 is the code for identity
        return null;
      }

      // Try to unmarshal the digest as a public key
      try {
        return await Ed25519PublicKey.unmarshal(Uint8List.fromList(decoded.digest));
      } catch (e) {
        return null;
      }
    } catch (e) {
      return null;
    }
  }

  @override
  bool isValid() {
    try {
      Multihash.decode(_multihash ?? Uint8List.fromList([00]));
      return _multihash?.isNotEmpty ?? false;
    } catch (e) {
      return false;
    }
  }

  @override
  Map<String, dynamic> toJson() {
    // Prioritize CID string representation for JSON.
    // toCIDString will throw if the PeerId is invalid, which is good.
    return {
      'cid': toCIDString(),
    };
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    if (other is! PeerId) return false;
    return const ListEquality().equals(_multihash, other._multihash);
  }

  @override
  int get hashCode => Object.hashAll(_multihash ?? []);

}
