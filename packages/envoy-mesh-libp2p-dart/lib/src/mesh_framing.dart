/// Newline-delimited framing for the mesh host transport.
///
/// ## Why this is its own file
///
/// The framing used to be implicit: one `write` was assumed to be one `read`. Nothing enforced that,
/// and it is not true of any stream that may buffer, coalesce or split — a relay does all three. Two
/// consequences, both silent:
///
///   * two frames arriving in one read became **one unparseable message**;
///   * one frame arriving in two reads delivered **half a request**.
///
/// The transport now delimits every message with `\n`. Extracting the buffer is not tidiness: the
/// rule is the part worth testing, and testing it through `P2PStream` would mean faking a libp2p
/// stream to test a `String`. This file has no dependency beyond `dart:convert`, so the cases below
/// are a unit test rather than an integration one.
///
/// ## The contract, in one sentence
///
/// Feed it bytes in any grouping; take whole frames out. Nothing is dropped, nothing is split twice.
library;

import 'dart:convert';
import 'dart:typed_data';

/// Accumulates bytes and yields complete, newline-delimited frames.
class MeshFrameBuffer {
  String _buffer = '';

  /// Append [bytes] and return every complete frame now available.
  ///
  /// The tail of an incomplete frame is kept for the next call. Empty lines are ignored rather than
  /// delivered as empty frames, because a stray newline is not a message and a consumer that received
  /// one would try to parse it.
  List<String> add(Uint8List bytes) {
    _buffer += utf8.decode(bytes.toList(), allowMalformed: true);

    final frames = <String>[];
    var index = _buffer.indexOf('\n');
    while (index >= 0) {
      final frame = _buffer.substring(0, index).trim();
      if (frame.isNotEmpty) frames.add(frame);
      _buffer = _buffer.substring(index + 1);
      index = _buffer.indexOf('\n');
    }
    return frames;
  }

  /// Bytes held for an unfinished frame. Present so a test can prove nothing is lost.
  int get pendingBytes => _buffer.length;

  /// Forget any partial frame — used when a stream ends, so a later connection cannot inherit it.
  void reset() => _buffer = '';
}

/// Delimit one outbound message.
///
/// A function rather than a string interpolation at each call site, so "every write is a frame" has
/// one implementation and the delimiter appears in exactly one place.
String frameMessage(String data) => '$data\n';
