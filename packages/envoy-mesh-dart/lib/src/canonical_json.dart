/// Canonical JSON for EnvoyMesh signing — must match
/// `@envoymesh/protocol` `canonicalJson`: sorted object keys, drop `undefined`.
///
/// Dart has no `undefined`; callers omit unset keys. Explicit JSON `null` is kept.
library;

import 'dart:convert';

/// Returns the canonical JSON string used as the Ed25519 signing payload.
String canonicalJson(Object? input) {
  return jsonEncode(_sortForCanonicalJson(input));
}

Object? _sortForCanonicalJson(Object? input) {
  if (input is List) {
    return input.map(_sortForCanonicalJson).toList(growable: false);
  }
  if (input is Map) {
    final sortedKeys = input.keys.map((k) => k.toString()).toList()..sort();
    return <String, Object?>{
      for (final key in sortedKeys) key: _sortForCanonicalJson(input[key]),
    };
  }
  return input;
}
