import 'dart:typed_data';

import 'package:dart_libp2p/core/peer/pb/peer_record.pb.dart';


abstract class RecordBase {

  // Domain is the "signature domain" used when signing and verifying a particular
  // Record type. The Domain string should be unique to your Record type, and all
  // instances of the Record type must have the same Domain string.
  String domain();

  // Codec is a binary identifier for this type of record, ideally a registered multicodec
  // (see https://github.com/multiformats/multicodec).
  // When a Record is put into an Envelope (see record.Seal), the Codec value will be used
  // as the Envelope's PayloadType. When the Envelope is later unsealed, the PayloadType
  // will be used to look up the correct Record type to unmarshal the Envelope payload into.
  Uint8List codec();

  // MarshalRecord converts a Record instance to a []byte, so that it can be used as an
  // Envelope payload.
  Uint8List marshalRecord();

}

/* Example Useage

// Example usage
class MyRecord extends RecordBase {
.
.
  @override
  String domain() => 'my-domain';

  @override
  Uint8List codec() => Uint8List.fromList('my-codec'.codeUnits);

.
.
}

void main() {
  // Register the record type
  RecordRegistry.register<MyRecord>(
    'my-codec',
    (payload) {
      final record = MyRecord();
      record.unmarshalRecord(payload);
      return record;
    }
  );

  // Create and marshal a record
  final original = MyRecord.withContent('Hello, world!');
  final payload = original.marshalRecord();

  // Unmarshal record generically
  final genericRecord = RecordRegistry.unmarshal(
    Uint8List.fromList('my-codec'.codeUnits),
    payload
  );

  // Unmarshal with type safety
  final typedRecord = RecordRegistry.unmarshalAs<MyRecord>(payload);
}
 */

/// Type-safe registry for record types
class RecordRegistry {
  // Map binary codec keys to factories
  static final _factories = <String, PeerRecord Function(Uint8List)>{};

  // Map Type to codec strings for reverse lookup
  static final _typeToCodec = <Type, String>{};

  /// Register a record type with its factory function
  static void register<T extends PeerRecord>(
      String codecString,
      T Function(Uint8List) factory
      ) {
    _factories[codecString] = factory;
    _typeToCodec[T] = codecString;
  }

  /// Get codec string for a specific record type
  static String? getCodecForType<T extends RecordBase>() {
    return _typeToCodec[T];
  }

  /// Unmarshal a record payload into a concrete RecordBase instance
  static PeerRecord unmarshal(Uint8List payloadType, Uint8List payload) {
    final codecString = String.fromCharCodes(payloadType);
    final factory = _factories[codecString];

    if (factory == null) {
      throw Exception('No record type registered for codec: $codecString');
    }

    return factory(payload);
  }

  /// Create a specific record type from payload
  static T? unmarshalAs<T extends RecordBase>(Uint8List payload) {
    final codecString = _typeToCodec[T];
    if (codecString == null) {
      throw Exception('Type ${T.toString()} not registered');
    }

    final factory = _factories[codecString];
    if (factory == null) {
      throw Exception('No factory found for registered type ${T.toString()}');
    }

    final record = factory(payload);
    if (record is! T) {
      throw Exception('Factory produced ${record.runtimeType} instead of $T');
    }

    return record as T;
  }
}