import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:dart_libp2p/core/interfaces.dart';
import 'package:test/test.dart';
import 'package:dart_libp2p/p2p/protocol/multistream/multistream.dart';
import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/protocol/protocol.dart'; // ProtocolID, HandlerFunc
import 'package:dart_libp2p/p2p/multiaddr/codec.dart'; // For varint encoding in tests if needed
import 'package:dart_libp2p/core/network/conn.dart'; // Conn, ConnStats, Stats, ConnState
import 'package:dart_libp2p/core/network/common.dart'; // Direction
import 'package:dart_libp2p/core/network/rcmgr.dart' show StreamScope, ConnScope, NullScope; // Using NullScope for mocks
import 'package:dart_libp2p/core/peer/peer_id.dart'; // PeerId, PeerId
import 'package:dart_libp2p/core/multiaddr.dart'; // Multiaddr
import 'package:dart_libp2p/core/crypto/keys.dart'; // PublicKey
import 'package:dart_libp2p/core/network/context.dart'; // Context

// --- Mock Dependencies ---

// Using NullScope from rcmgr.dart for StreamScope and ConnScope mocks.
// No need for MockScopeStat, MockResourceScopeSpan, MockStreamScope.

class MockConnStats implements ConnStats {
  @override
  final Stats stats;
  @override
  final int numStreams;

  MockConnStats({Stats? stats, this.numStreams = 0})
      : stats = stats ?? Stats(direction: Direction.inbound, opened: DateTime.now()); // Removed const
}

class MockConn implements Conn {
  final String _id = 'mock-conn-${Random().nextInt(1<<32)}';

  @override
  String get id => _id;

  // Conn interface expects synchronous PeerId. PeerId.random() is async.
  // Use a placeholder PeerId for the mock. PeerId implements PeerId.
  @override
  PeerId get localPeer => PeerId.fromString("QmSoLnSGccFuZQJzRadHn95W2CrSFmGLwDsTU6gEdKnHv2"); // Example valid PeerID

  @override
  MultiAddr get localMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/0');

  @override
  PeerId get remotePeer => PeerId.fromString("QmSoLSgciZgHiZ8isU3g2mQ3z5dSg2YV6x2v2tTjK2Yx8a"); // Example valid PeerID

  @override
  MultiAddr get remoteMultiaddr => MultiAddr('/ip4/127.0.0.1/tcp/0');

  @override
  Future<P2PStream<dynamic>> newStream(Context context) async {
    // For simplicity, this mock doesn't actually create a new stream based on context/id.
    // It could be enhanced if tests need to verify stream creation logic.
    throw UnimplementedError('MockConn.newStream not implemented for actual stream creation');
  }

  @override
  Future<List<P2PStream<dynamic>>> get streams async => [];

  @override
  ConnStats get stat => MockConnStats();

  @override
  Future<void> close() async {}

  @override
  bool get isClosed => false;

  @override
  ConnScope get scope => NullScope(); // Use NullScope from rcmgr

  // Transport? get transport => null; // This was in the old mock, Transport is not defined in conn.dart
  // Let's assume for now it's not strictly needed for these tests or defined elsewhere.
  // If Transport is a concrete type from another import, it can be added.

  @override
  Future<PublicKey?> get remotePublicKey async => null;

  @override
  ConnState get state => const ConnState(
        streamMultiplexer: '', // Placeholder
        security: '', // Placeholder
        transport: 'mock', // Placeholder
        usedEarlyMuxerNegotiation: false,
      );
}

class MockStreamStats implements StreamStats {
  @override
  Direction get direction => Direction.inbound; // Changed from .unknown
  @override
  DateTime get opened => DateTime.now();
  @override
  bool get limited => false;
  @override
  Map get extra => {};
}


// --- Mock P2PStream Implementation ---

class MockP2PStream implements P2PStream<Uint8List> {
  final String _id_internal = 'mock-stream-${Random().nextInt(1<<32)}';
  final StreamController<Uint8List> _incomingDataController = StreamController<Uint8List>.broadcast();
  final StreamController<Uint8List> _outgoingDataController;

  final BytesBuilder _readBuffer = BytesBuilder();
  final Completer<void> _localCloseCompleter = Completer<void>();
  final Completer<void> _remoteCloseCompleter = Completer<void>(); // When the other side closes its write end
  StreamSubscription? _incomingSubscription;
  String _protocol_internal = '';
  Completer<void>? _pendingReadCompleter;
  final Conn _mockConn = MockConn(); // Each stream is associated with a mock connection

  MockP2PStream(this._outgoingDataController, Stream<Uint8List> incomingStream) {
    _incomingSubscription = incomingStream.listen(
      (data) {
        _readBuffer.add(data);
        if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
          _pendingReadCompleter!.complete();
          _pendingReadCompleter = null;
        }
      },
      onDone: () {
        if (!_remoteCloseCompleter.isCompleted) {
          _remoteCloseCompleter.complete();
        }
        if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
          if (_readBuffer.isEmpty) {
            _pendingReadCompleter!.completeError(StateError("Stream closed by remote while awaiting read"));
          } else {
            _pendingReadCompleter!.complete(); // Allow reading remaining buffer
          }
          _pendingReadCompleter = null;
        }
      },
      onError: (e, s) {

        // Prioritize failing the pending read operation with the actual error.
        if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
          _pendingReadCompleter!.completeError(e, s);
          _pendingReadCompleter = null;
        }
        // Now, mark the remote side as "done sending" from our perspective.
        // Complete successfully because our read capability has simply reached its end.
        // The error 'e' has already been (or will be) surfaced by the read() attempt.
        if (!_remoteCloseCompleter.isCompleted) {
          _remoteCloseCompleter.complete(); // Complete successfully
        }
      },
    );
  }

  @override
  Future<Uint8List> read([int? count]) async {
    if (_readBuffer.isNotEmpty) {
      final available = _readBuffer.length;
      final bytesToRead = (count != null && count < available && count > 0) ? count : available;
      if (bytesToRead == 0 && count != null && count > 0) { // Requesting specific non-zero bytes but buffer is empty or smaller
         // Fall through to wait for more data if not closed
      } else if (bytesToRead > 0) {
        final result = Uint8List.fromList(_readBuffer.toBytes().sublist(0, bytesToRead));
        final remainingBytes = Uint8List.fromList(_readBuffer.toBytes().sublist(bytesToRead));
        _readBuffer.clear();
        _readBuffer.add(remainingBytes);
        return result;
      }
    }

    if (_remoteCloseCompleter.isCompleted || _localCloseCompleter.isCompleted && _readBuffer.isEmpty) {
      return Uint8List(0); // EOF
    }

    _pendingReadCompleter ??= Completer<void>();
    await _pendingReadCompleter!.future;
    return read(count); // Recurse
  }

  @override
  Future<void> write(Uint8List data) async {
    if (_localCloseCompleter.isCompleted) { // Check local completer first
      throw StateError('Cannot write to locally closed stream');
    }
    if (_outgoingDataController.isClosed) {
      throw StateError('Cannot write to closed outgoing controller');
    }
    _outgoingDataController.add(data);
  }

  @override
  Future<void> close() async {
    if (!_localCloseCompleter.isCompleted) {
      _localCloseCompleter.complete();
    }
    // Also ensure remote is completed, as close() is a full close.
    if (!_remoteCloseCompleter.isCompleted) {
        _remoteCloseCompleter.complete();
    }
    await _incomingSubscription?.cancel();
    _incomingSubscription = null;
    if (!_outgoingDataController.isClosed) {
      await _outgoingDataController.close();
    }
    // If there's a pending read, and buffer is empty, error it out or complete with empty.
    if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
        if (_readBuffer.isEmpty) {
             _pendingReadCompleter!.completeError(StateError("Stream closed"));
        } else {
            _pendingReadCompleter!.complete();
        }
        _pendingReadCompleter = null;
    }
  }

  @override
  Future<void> closeWrite() async {
    // This signals that this side won't send more data.
    // It doesn't affect the local reading side immediately, nor the remote writing side.
    if (!_outgoingDataController.isClosed) {
      await _outgoingDataController.close();
    }
    // From a "done" perspective, local writing is finished.
    // If not already completed by a full close(), complete it.
    // This is subtle: closeWrite means *our* write side is done.
    // The _localCloseCompleter often signals the *entire* stream object is done locally.
    // For simplicity here, we'll assume closeWrite contributes to _localCloseCompleter.
    // A more nuanced mock might have separate completers for read/write sides.
    // if (!_localCloseCompleter.isCompleted) {
    //   _localCloseCompleter.complete(); // Or a specific writeCloseCompleter
    // }
  }
  
  @override
  Future<void> closeRead() async {
    if (!_remoteCloseCompleter.isCompleted) {
      // This means we are no longer interested in data from the remote.
      // It's like the remote's write side is closed from our perspective.
      _remoteCloseCompleter.complete();
    }
    await _incomingSubscription?.cancel();
    _incomingSubscription = null;
    if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted && _readBuffer.isEmpty) {
      _pendingReadCompleter!.completeError(StateError("Stream closed for reading"));
      _pendingReadCompleter = null;
    }
  }

  @override
  Future<void> reset() async {
    final err = StateError("Stream reset"); // This error is for the other side of the pipe.
    if (!_localCloseCompleter.isCompleted) {
      _localCloseCompleter.complete();
    }
    if (!_remoteCloseCompleter.isCompleted) {
      _remoteCloseCompleter.complete();
    }
    await _incomingSubscription?.cancel();
    _incomingSubscription = null; // Added this line
    _readBuffer.clear();

    // Handle pending read completer
    if (_pendingReadCompleter != null && !_pendingReadCompleter!.isCompleted) {
      _pendingReadCompleter!.completeError(StateError("Stream reset")); // Or a more specific "Stream reset during read"
      _pendingReadCompleter = null;
    }

    if (!_outgoingDataController.isClosed) {
      _outgoingDataController.addError(err); // Notify the other side
      await _outgoingDataController.close();
    }
  }


  @override
  String id() => _id_internal;

  @override
  String protocol() => _protocol_internal;

  @override
  Future<void> setProtocol(String protocol) async {
    _protocol_internal = protocol;
  }

  @override
  StreamStats stat() => MockStreamStats();


  @override
  StreamManagementScope scope() => NullScope(); // Use NullScope from rcmgr
  
  @override
  P2PStream<Uint8List> get incoming => this; // Simplistic: stream is its own incoming representation

  // Sink is not part of P2PStream, but was used by old mock. Keeping wrapper for now if tests use it.
  // For P2PStream, direct `write` is used.
  // Sink<Uint8List> get sink => _StreamSinkWrapper(_outgoingDataController, _localCloseCompleter);
  
  @override
  Future<void> get done async {
    await Future.wait([
      _localCloseCompleter.future.catchError((_){ /* ignore errors for done check */ }), 
      _remoteCloseCompleter.future.catchError((_){ /* ignore errors for done check */ })
    ]);
  }

  @override
  Future<void> setDeadline(DateTime? time) async { /* no-op in mock */ }
  @override
  Future<void> setReadDeadline(DateTime time) async { /* no-op in mock */ }
  @override
  Future<void> setWriteDeadline(DateTime time) async { /* no-op in mock */ }

  @override
  bool get isClosed => _localCloseCompleter.isCompleted && _remoteCloseCompleter.isCompleted;

  @override
  bool get isWritable => !_localCloseCompleter.isCompleted;

  @override
  Conn get conn => _mockConn;
}

// _StreamSinkWrapper might not be needed if tests adapt to use P2PStream.write directly
// Keeping it for now to minimize test changes initially.
class _StreamSinkWrapper<S> implements Sink<S> {
  final StreamController<S> _controller;
  final Completer<void> _closeCompleter; 

  _StreamSinkWrapper(this._controller, this._closeCompleter);

  @override
  void add(S data) {
    if (_closeCompleter.isCompleted) { // Check if the stream itself is locally closed
        throw StateError('Cannot add to sink of a closed stream');
    }
    if (_controller.isClosed) {
      throw StateError('Cannot add to closed sink controller');
    }
    _controller.add(data);
  }

  @override
  void close() {
    // Closing the sink means we are done writing from this end.
    // This is effectively like P2PStream.closeWrite()
    if (!_controller.isClosed) {
      _controller.close();
    }
  }
}

(MockP2PStream, MockP2PStream) newPipe() {
  final controllerAtoB = StreamController<Uint8List>();
  final controllerBtoA = StreamController<Uint8List>();

  final streamA = MockP2PStream(controllerAtoB, controllerBtoA.stream);
  final streamB = MockP2PStream(controllerBtoA, controllerAtoB.stream);

  return (streamA, streamB);
}

// --- Helper Functions ---

Future<void> readFull(P2PStream stream, Uint8List buffer) async {
  int offset = 0;
  while (offset < buffer.length) {
    final chunk = await stream.read(buffer.length - offset);
    if (chunk.isEmpty) {
      throw Exception('Stream closed prematurely while reading full buffer (got ${offset} of ${buffer.length})');
    }
    buffer.setRange(offset, offset + chunk.length, chunk);
    offset += chunk.length;
  }
}

Future<void> verifyPipe(P2PStream a, P2PStream b) async {
  final messageSize = 1024;
  final random = Random();
  final message = Uint8List.fromList(List<int>.generate(messageSize, (_) => random.nextInt(256)));

  var writeErrorA, writeErrorB;
  var readErrorA, readErrorB;

  final completerAWriteDone = Completer<void>();
  final completerBWriteDone = Completer<void>();

  // Write from B to A, then A to B
  (() async {
    try {
      await b.write(message);
    } catch (e) {
      writeErrorB = e;
    }
    completerBWriteDone.complete();
  })();
  
  (() async {
    try {
      await a.write(message);
    } catch (e) {
      writeErrorA = e;
    }
    completerAWriteDone.complete();
  })();


  final bufferA = Uint8List(messageSize);
  final bufferB = Uint8List(messageSize);

  try {
    await readFull(a, bufferA);
  } catch (e) {
    readErrorA = e;
  }
  
  try {
    await readFull(b, bufferB);
  } catch (e) {
    readErrorB = e;
  }

  await completerAWriteDone.future;
  await completerBWriteDone.future;

  if (writeErrorA != null) throw Exception('Failed to write on stream A: $writeErrorA');
  if (writeErrorB != null) throw Exception('Failed to write on stream B: $writeErrorB');
  if (readErrorA != null) throw Exception('Failed to read on stream A: $readErrorA');
  if (readErrorB != null) throw Exception('Failed to read on stream B: $readErrorB');
  
  expect(bufferA, equals(message), reason: 'Stream A did not receive correct message');
  expect(bufferB, equals(message), reason: 'Stream B did not receive correct message');
}

// Helper to write a delimited message (for testing error conditions like too large message)
// This mimics the internal _writeDelimited but is for test setup.
Future<void> writeTestDelimited(P2PStream stream, List<int> message) async {
  final lengthBytes = MultiAddrCodec.encodeVarint(message.length + 1); // +1 for newline
  final fullMessage = Uint8List(lengthBytes.length + message.length + 1);
  fullMessage.setRange(0, lengthBytes.length, lengthBytes);
  fullMessage.setRange(lengthBytes.length, lengthBytes.length + message.length, message);
  fullMessage[lengthBytes.length + message.length] = 10; // '\n'
  await stream.write(fullMessage);
}


// --- Test Suite ---

void main() {
  group('MultistreamMuxer', () {
    late MultistreamMuxer muxerA;
    late MultistreamMuxer muxerB; // For tests involving two muxers
    late MockP2PStream streamA;
    late MockP2PStream streamB;

    setUp(() {
      muxerA = MultistreamMuxer();
      muxerB = MultistreamMuxer();
      final pipes = newPipe();
      streamA = pipes.$1;
      streamB = pipes.$2;
    });

    tearDown(() async {
      // Ensure streams are closed to prevent issues with pending operations in mock stream controllers
      await streamA.close().catchError((_){});
      await streamB.close().catchError((_){});
    });

    test('protocol negotiation succeeds', () async {
      muxerA.addHandler('/proto/a', (protocol, stream) async {
        // Simple handler, does nothing
      });
      muxerA.addHandler('/proto/b', (protocol, stream) async {});

      final serverNegotiation = Completer<(ProtocolID, HandlerFunc)>();
      (() async {
        try {
          serverNegotiation.complete(await muxerA.negotiate(streamA));
        } catch (e,s) {
          serverNegotiation.completeError(e,s);
        }
      })();

      final clientSelectedProto = await muxerB.selectOneOf(streamB, ['/proto/x', '/proto/a']);
      
      expect(clientSelectedProto, equals('/proto/a'));
      
      final (negotiatedProto, _) = await serverNegotiation.future.timeout(Duration(seconds: 2));
      expect(negotiatedProto, equals('/proto/a'));

      await verifyPipe(streamA, streamB);
    });

    test('selectOneOf selects the first common protocol', () async {
      muxerA.addHandler('/proto/c', (p, s) async {});
      muxerA.addHandler('/proto/d', (p, s) async {});

      final serverNegotiation = Completer<(ProtocolID, HandlerFunc)>();
       (() async {
        try {
          serverNegotiation.complete(await muxerA.negotiate(streamA));
        } catch (e,s) {
          serverNegotiation.completeError(e,s);
        }
      })();

      final clientSelectedProto = await muxerB.selectOneOf(streamB, ['/proto/x', '/proto/d', '/proto/c']);
      expect(clientSelectedProto, equals('/proto/d'));
      
      final (negotiatedProto, _) = await serverNegotiation.future.timeout(Duration(seconds: 2));
      expect(negotiatedProto, equals('/proto/d'));
      
      await verifyPipe(streamA, streamB);
    });

    test('selectOneOf returns null if no common protocol', () async {
      muxerA.addHandler('/proto/a', (p, s) async {});
      muxerA.addHandler('/proto/b', (p, s) async {});

      final serverNegotiation = Completer<void>();
      (() async {
        try {
          await muxerA.negotiate(streamA); // Server will negotiate, but client offers nothing it supports
        } catch (e) {
          // Expected to fail if client closes after not finding a protocol
          if (e is! IncorrectVersionException && !e.toString().contains('Stream closed')) {
             // serverNegotiation.completeError(e); // Avoid completing if it's a client-side close error
          }
        } finally {
            if(!serverNegotiation.isCompleted) serverNegotiation.complete();
        }
      })();


      final clientSelectedProto = await muxerB.selectOneOf(streamB, ['/proto/x', '/proto/y']);
      expect(clientSelectedProto, isNull);
      
      // Wait for server side to finish (it might error out if client closes stream)
      await serverNegotiation.future.timeout(Duration(seconds: 2)).catchError((_){});
    });
    
    test('removeHandler works', () async {
      muxerA.addHandler('/proto/a', (p, s) async {});
      muxerA.addHandler('/proto/b', (p, s) async {});
      
      var protocols = await muxerA.protocols();
      expect(protocols, containsAll(['/proto/a', '/proto/b']));
      expect(protocols.length, 2);

      muxerA.removeHandler('/proto/a');
      protocols = await muxerA.protocols();
      expect(protocols, equals(['/proto/b']));
      expect(protocols.length, 1);

      muxerA.removeHandler('/proto/nonexistent');
      protocols = await muxerA.protocols();
      expect(protocols, equals(['/proto/b']));
    });

    test('negotiate throws IncorrectVersionException for wrong protocol ID', () async {
      final serverNegotiation = muxerA.negotiate(streamA);
      
      // Client sends wrong multistream ID
      await writeTestDelimited(streamB, utf8.encode('/wrong/version/1.0.0'));
      
      await expectLater(serverNegotiation, throwsA(isA<IncorrectVersionException>()));
    });

    test('selectOneOf throws IncorrectVersionException if server sends wrong protocol ID', () async {
      final clientSelection = muxerB.selectOneOf(streamA, ['/proto/a']);

      // Server (streamB) sends its multistream ID correctly
      await writeTestDelimited(streamB, utf8.encode(protocolID));
      // Then server sends wrong multistream ID as acknowledgment
      await writeTestDelimited(streamB, utf8.encode('/wrong/version/1.0.0'));

      await expectLater(clientSelection, throwsA(isA<IncorrectVersionException>()));
    });
    
    // Max message size in dart-libp2p's multistream.dart is 1024 for the protocol name part.
    // Go's default is 64k. We test against Dart's limit.
    test('negotiate throws MessageTooLargeException for oversized protocol name', () async {
      final serverNegotiation = muxerA.negotiate(streamA);
      
      // Client sends correct multistream ID
      await writeTestDelimited(streamB, utf8.encode(protocolID));
      // Then client sends an oversized protocol name
      final oversizedProto = '/' + 'a' * 2048; // Well over 1024
      await writeTestDelimited(streamB, utf8.encode(oversizedProto));
      
      // The server's _readDelimited should throw.
      // This error might be wrapped or cause a generic stream error if not caught cleanly by negotiate.
      // Let's expect MessageTooLargeException directly if _readDelimited is robust.
      await expectLater(serverNegotiation, throwsA(isA<MessageTooLargeException>()));
    });

    test('selectOneOf handles MessageTooLargeException from server response', () async {
      final clientSelection = muxerB.selectOneOf(streamA, ['/proto/a']);

      // Server (streamB) sends its multistream ID correctly
      await writeTestDelimited(streamB, utf8.encode(protocolID));
      // Then server sends an oversized protocol name as its response (e.g. echoing client's offer)
      final oversizedProto = '/' + 'a' * 2048;
      await writeTestDelimited(streamB, utf8.encode(oversizedProto));
      
      await expectLater(clientSelection, throwsA(isA<MessageTooLargeException>()));
    });

    test('handle function selects protocol and calls handler', () async {
      bool handlerCalled = false;
      ProtocolID? handledProto;

      muxerA.addHandler('/proto/test', (protocol, stream) async {
        handlerCalled = true;
        handledProto = protocol;
        // Echo back to client
        var data = Uint8List(5);
        await readFull(stream, data);
        await stream.write(data);
      });

      final serverHandling = muxerA.handle(streamA); // Non-blocking

      // Client side
      final selected = await muxerB.selectOneOf(streamB, ['/proto/test']);
      expect(selected, equals('/proto/test'));
      
      final testMessage = utf8.encode('hello');
      await streamB.write(testMessage);
      
      final response = Uint8List(testMessage.length);
      await readFull(streamB, response);
      expect(utf8.decode(response), equals('hello'));

      // Ensure server handler completes or times out.
      // The timeout will throw if it occurs, failing the test as expected.
      await serverHandling.timeout(const Duration(seconds: 2)); 
      expect(handlerCalled, isTrue);
      expect(handledProto, equals('/proto/test'));
    });
    
    test('addHandler overrides existing handler for the same protocol name', () async {
      var callCount1 = 0;
      var callCount2 = 0;

      // Use addHandlerWithFunc and await it to ensure completion
      await muxerA.addHandlerWithFunc('/proto/override', (protocolId) => protocolId == '/proto/override', (p, s) async { callCount1++; });
      await muxerA.addHandlerWithFunc('/proto/override', (protocolId) => protocolId == '/proto/override', (p, s) async { callCount2++; });

      // muxerA.addHandler('/proto/override', (p, s) async { callCount1++; });
      // muxerA.addHandler('/proto/override', (p, s) async { callCount2++; }); // This should replace the first

      // Simulate negotiation for this protocol
      final serverNegotiation = Completer<void>();

      (() async {
        try {
          // Call negotiate and get the protocol and handler function
          final (negotiatedProto, handlerFunc) = await muxerA.negotiate(streamA);

          // IMPORTANT: Now, execute the returned handler function
          // This is what will increment callCount2 if the correct handler is selected.
          handlerFunc(negotiatedProto, streamA);
        } catch (e) {
          // Optional: log error for debugging, e.g., print('Test server negotiation error: $e');
          // The test might still pass if errors are expected due to client closing stream,
          // but the handler call is crucial.
        } finally {
          if(!serverNegotiation.isCompleted) serverNegotiation.complete();
        }
      })();


      await muxerB.selectOneOf(streamB, ['/proto/override']);
      await serverNegotiation.future.timeout(Duration(seconds:1));

      expect(callCount1, 0, reason: "Old handler should not be called");
      expect(callCount2, 1, reason: "New handler should be called");
    });

  });
}
