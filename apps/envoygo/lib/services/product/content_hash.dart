/// Phase 45C — SHA-256 contentHash verification (mirrors Social BrowserView).
library content_hash;

import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'library_read_fetch.dart';

/// Returns true when [expectedHash] is absent, or matches SHA-256 of [body].
/// Text bodies are hashed as UTF-8; binary bodies are base64-decoded first.
bool verifyContentHash({
  required String body,
  required String contentType,
  String? expectedHash,
}) {
  if (expectedHash == null || expectedHash.isEmpty) return true;
  final List<int> bytes;
  if (isTextMime(contentType)) {
    bytes = utf8.encode(body);
  } else {
    try {
      bytes = base64Decode(body);
    } catch (_) {
      return false;
    }
  }
  final digest = sha256.convert(bytes).toString();
  return digest.toLowerCase() == expectedHash.toLowerCase();
}
