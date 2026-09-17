import 'dart:typed_data';
import 'base_mock_connection.dart';

/// Mock connection specialized for transport tests
/// Focuses on simple protocol negotiation without message framing
class TransportMockConnection extends BaseMockConnection {
  Uint8List? _nextReadResult;
  bool _shouldThrowOnRead = false;

  TransportMockConnection([String id = 'transport']) : super(id);

  /// Sets the next read result
  set nextReadResult(Uint8List value) {
    _nextReadResult = value;
  }

  /// Sets whether the next read should throw
  set shouldThrowOnRead(bool value) {
    _shouldThrowOnRead = value;
  }

  @override
  Future<void> close() async {
    markClosed();
  }

  @override
  Future<Uint8List> read([int? length]) async {
    validateNotClosed();
    
    if (_shouldThrowOnRead) {
      throw Exception('Mock read error');
    }
    
    if (_nextReadResult == null) {
      throw StateError('No mock data set for read');
    }
    
    return _nextReadResult!;
  }

  @override
  Future<void> write(Uint8List data) async {
    validateNotClosed();
    recordWrite(data);
  }
} 