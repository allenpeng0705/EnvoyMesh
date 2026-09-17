import 'dart:typed_data';
import 'package:dart_libp2p/core/record/record_registry.dart';

import 'package:dart_libp2p/core/crypto/pb/crypto.pb.dart' as pb;
import 'package:dart_libp2p/core/crypto/keys.dart';
import 'package:dart_libp2p/core/peer/pb/peer_record.pb.dart' as pb;
import 'package:dart_libp2p/core/peer/record.dart';
import 'package:dart_libp2p/core/record/pb/envelope.pb.dart' as pb;
import 'package:dart_libp2p/utils/varint.dart';

/// Envelope contains an arbitrary [Uint8List] payload, signed by a libp2p peer.
///
/// Envelopes are signed in the context of a particular "domain", which is a
/// string specified when creating and verifying the envelope. You must know the
/// domain string used to produce the envelope in order to verify the signature
/// and access the payload.
class Envelope {
  /// The public key that can be used to verify the signature and derive the peer id of the signer.
  final PublicKey publicKey;

  /// A binary identifier that indicates what kind of data is contained in the payload.
  final Uint8List payloadType;

  /// The envelope payload.
  final Uint8List rawPayload;

  /// The signature of the domain string :: type hint :: payload.
  final Uint8List _signature;

  /// The unmarshalled payload as a RecordBase, cached on first access via the RecordBase accessor method
  pb.PeerRecord? _cached;
  Exception? _unmarshalError;
  bool _unmarshalled = false;

  Envelope({
    required this.publicKey,
    required this.payloadType,
    required Uint8List rawPayload,
    required Uint8List signature,
  })  : _signature = signature,
        rawPayload = Uint8List.fromList(rawPayload);

  /// Creates a new envelope by marshaling the given [RecordBase], placing the marshaled bytes
  /// inside an [Envelope], and signing with the given private key.
  static Future<Envelope> seal(RecordBase rec, PrivateKey privateKey) async {
    final payload = await rec.marshalRecord();
    final domain = rec.domain();
    final payloadType = rec.codec();

    if (domain.isEmpty) {
      throw Exception('envelope domain must not be empty');
    }

    if (payloadType.isEmpty) {
      throw Exception('payloadType must not be empty');
    }

    final unsigned = _makeUnsigned(domain, Uint8List.fromList(payloadType), Uint8List.fromList(payload));
    final sig = await privateKey.sign(unsigned);

    return Envelope(
      publicKey: privateKey.publicKey,
      payloadType: Uint8List.fromList(payloadType),
      rawPayload: Uint8List.fromList(payload),
      signature: sig,
    );
  }

  /// Unmarshals a serialized [Envelope] and validates its signature using the provided 'domain' string.
  /// If validation fails, an error is returned.
  static Future<(Envelope, RecordBase)> consumeEnvelope( Uint8List data, String domain) async {
    final e = unmarshalEnvelopeFromProto(data);
    await e.validate(domain);
    final rec = PeerRecord.fromProtobufBytes((await e.record()).writeToBuffer());
    return (e, rec);
  }

  /// Unmarshals a serialized [Envelope] and validates its signature.
  /// Unlike [consumeEnvelope], this method does not try to automatically determine
  /// the type of RecordBase to unmarshal the Envelope's payload into.
  static Future<Envelope> consumeTypedEnvelope<T extends RecordBase>( Uint8List data, RecordBase destRecord) async {
    final e = unmarshalEnvelopeFromProto(data);
    try {
      await e.validate(destRecord.domain());

      RecordRegistry.unmarshalAs<T>(e.rawPayload);
      e._cached = pb.PeerRecord.fromBuffer(destRecord.marshalRecord());

      return e;
    }catch (e){

    }

    return e;
  }


  /// Returns a byte slice containing a serialized protobuf representation of an [Envelope].
  Future<Uint8List> marshal() async {
    final pk = publicKey.marshal();
    final msg = pb.Envelope(
      publicKey: pb.PublicKey.fromBuffer(pk),
      payloadType: payloadType,
      signature: _signature,
      payload: rawPayload,
    );
    return msg.writeToBuffer();
  }

  /// Returns true if the other [Envelope] has the same public key,
  /// payload, payload type, and signature.
  bool equal(Envelope? other) {
    if (other == null) return false;
    return _bytesEqual(payloadType, other.payloadType) &&
        _bytesEqual(_signature, other._signature) &&
        _bytesEqual(rawPayload, other.rawPayload);
  }

  /// Returns the [Envelope]'s payload unmarshalled as a [RecordBase].
  /// The concrete type of the returned [RecordBase] depends on which [RecordBase]
  /// type was registered for the [Envelope]'s [payloadType].
  Future<pb.PeerRecord> record() async {
    if (!_unmarshalled) {
      try {
        _cached = await RecordRegistry.unmarshal(payloadType, rawPayload);
      } catch (e) {
        _unmarshalError = e as Exception;
      }
      _unmarshalled = true;
    }
    if (_unmarshalError != null) {
      throw _unmarshalError!;
    }
    return _cached!;
  }

  /// Unmarshals the [Envelope]'s payload to the given [RecordBase] instance.
  Future<void> typedRecord(RecordBase destRecord) async {
    RecordRegistry.unmarshalAs(rawPayload);
  }

  /// Returns null if the envelope signature is valid for the given 'domain',
  /// or throws an error if signature validation fails.
  Future<void> validate(String domain) async {
    final unsigned = _makeUnsigned(domain, payloadType, rawPayload);
    final valid = await publicKey.verify(unsigned, _signature);
    if (!valid) {
      throw Exception('invalid signature or incorrect domain');
    }
  }

  /// Helper function that prepares a buffer to sign or verify.
  static Uint8List _makeUnsigned(
      String domain, Uint8List payloadType, Uint8List payload) {
    final fields = [
      Uint8List.fromList(domain.codeUnits),
      payloadType,
      payload
    ];

    // Calculate total size needed
    var size = 0;
    final lengths = <Uint8List>[];
    for (final field in fields) {
      final length = encodeVarint(field.length);
      lengths.add(length);
      size += field.length + length.length;
    }

    // Create buffer and write fields
    final buffer = Uint8List(size);
    var offset = 0;
    for (var i = 0; i < fields.length; i++) {
      buffer.setAll(offset, lengths[i]);
      offset += lengths[i].length;
      buffer.setAll(offset, fields[i]);
      offset += fields[i].length;
    }

    return buffer;
  }

  bool _bytesEqual(Uint8List a, Uint8List b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}


/// Unmarshals a serialized [Envelope] protobuf message,
/// without validating its contents.
Envelope unmarshalEnvelopeFromProto(Uint8List data) {
  final e = pb.Envelope.fromBuffer(data);
  final pubKey = publicKeyFromProto(e.publicKey);

  return Envelope(
    publicKey: pubKey,
    payloadType: Uint8List.fromList(e.payloadType),
    rawPayload: Uint8List.fromList(e.payload),
    signature: Uint8List.fromList(e.signature),
  );
}
