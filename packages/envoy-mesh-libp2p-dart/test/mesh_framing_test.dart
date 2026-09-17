// The framing rule, tested where it lives.
//
// The version this replaces assumed one write = one read. These are the three cases that assumption
// silently corrupts, and each is a real behaviour of a relay: split, coalesced, and split across a
// boundary that lands mid-frame.

import 'dart:convert';
import 'dart:typed_data';

import 'package:envoy_mesh_libp2p/src/mesh_framing.dart';
import 'package:test/test.dart';

Uint8List bytes(String text) => Uint8List.fromList(utf8.encode(text));

void main() {
  test('yields one frame from one write', () {
    final buffer = MeshFrameBuffer();
    expect(buffer.add(bytes('{"id":1}\n')), ['{"id":1}']);
  });

  test('keeps two frames that arrived in one read apart', () {
    // The old framing made this a single unparseable message — two RPCs lost in one line.
    final buffer = MeshFrameBuffer();
    expect(buffer.add(bytes('{"id":1}\n{"id":2}\n')), ['{"id":1}', '{"id":2}']);
  });

  test('holds a frame that arrived in pieces until it is whole', () {
    // The old framing delivered half a request and the peer failed to parse it.
    final buffer = MeshFrameBuffer();
    expect(buffer.add(bytes('{"id":1,"met')), isEmpty);
    expect(buffer.pendingBytes, greaterThan(0));
    expect(buffer.add(bytes('hod":"coder.hello"}\n')), ['{"id":1,"method":"coder.hello"}']);
    expect(buffer.pendingBytes, 0);
  });

  test('survives a boundary that lands between the newline and the next frame', () {
    final buffer = MeshFrameBuffer();
    expect(buffer.add(bytes('{"a":1}')), isEmpty);
    expect(buffer.add(bytes('\n')), ['{"a":1}']);
    expect(buffer.add(bytes('{"b":2}\n')), ['{"b":2}']);
  });

  test('ignores a stray newline rather than delivering an empty frame', () {
    // A consumer that received an empty frame would try to parse it and report a protocol error.
    final buffer = MeshFrameBuffer();
    expect(buffer.add(bytes('\n\n{"a":1}\n\n')), ['{"a":1}']);
  });

  test('delimits every outbound message through the one function', () {
    expect(frameMessage('{"id":1}'), '{"id":1}\n');
  });

  test('drops a partial frame on reset, so a new stream does not inherit it', () {
    final buffer = MeshFrameBuffer();
    buffer.add(bytes('{"half":'));
    buffer.reset();
    expect(buffer.pendingBytes, 0);
    expect(buffer.add(bytes('{"whole":1}\n')), ['{"whole":1}']);
  });
}
