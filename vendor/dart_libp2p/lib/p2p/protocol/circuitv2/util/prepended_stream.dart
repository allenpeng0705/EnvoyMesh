// Copyright (c) 2024 The dart-libp2p Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

import 'dart:typed_data';

import 'package:dart_libp2p/core/network/stream.dart';
import 'package:dart_libp2p/core/network/conn.dart';
import 'package:dart_libp2p/core/network/rcmgr.dart';

/// A wrapper around P2PStream that prepends buffered data to the stream.
/// 
/// This is critical for circuit relay to prevent data loss when handshake
/// messages and application data arrive together. The buffered reader may
/// consume both, and this wrapper ensures the application data is still
/// accessible to the RelayedConn.
class PrependedStream implements P2PStream<Uint8List> {
  final P2PStream _underlying;
  final Uint8List _prependedData;
  int _prependedOffset = 0;
  bool _prependedConsumed = false;
  
  PrependedStream(this._underlying, this._prependedData);
  
  @override
  Future<Uint8List> read([int? maxLength]) async {
    // First, serve the prepended data
    if (!_prependedConsumed) {
      final remaining = _prependedData.length - _prependedOffset;
      if (remaining > 0) {
        final toRead = maxLength != null ? (maxLength < remaining ? maxLength : remaining) : remaining;
        final result = Uint8List.view(
          _prependedData.buffer,
          _prependedData.offsetInBytes + _prependedOffset,
          toRead,
        );
        _prependedOffset += toRead;
        
        if (_prependedOffset >= _prependedData.length) {
          _prependedConsumed = true;
        }
        
        return result;
      }
      _prependedConsumed = true;
    }
    
    // Then read from underlying stream
    return _underlying.read(maxLength);
  }
  
  @override
  Future<void> write(Uint8List data) => _underlying.write(data);
  
  @override
  Future<void> close() => _underlying.close();
  
  @override
  Future<void> closeWrite() => _underlying.closeWrite();
  
  @override
  Future<void> closeRead() => _underlying.closeRead();
  
  @override
  Future<void> reset() => _underlying.reset();
  
  @override
  String id() => _underlying.id();
  
  @override
  Conn get conn => _underlying.conn;
  
  @override
  bool get isClosed => _underlying.isClosed;
  
  @override
  bool get isWritable => _underlying.isWritable;
  
  @override
  String protocol() => _underlying.protocol();
  
  @override
  Future<void> setProtocol(String protocol) => _underlying.setProtocol(protocol);
  
  @override
  StreamStats stat() => _underlying.stat();
  
  @override
  StreamManagementScope scope() => _underlying.scope();
  
  @override
  P2PStream<Uint8List> get incoming => _underlying.incoming;
  
  @override
  Future<void> setDeadline(DateTime? deadline) => _underlying.setDeadline(deadline);
  
  @override
  Future<void> setReadDeadline(DateTime deadline) => _underlying.setReadDeadline(deadline);
  
  @override
  Future<void> setWriteDeadline(DateTime deadline) => _underlying.setWriteDeadline(deadline);
}

