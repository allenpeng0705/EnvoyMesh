// Redaction helpers for secret material that can end up in transport
// URLs and the log / error strings built from them.
//
// Thin-client candidates are full WebSocket URLs that often embed the
// session token or pairing blob in the query string
// (`ws://192.168.1.50:3030/ws?token=…&target=…`). Exception text built
// from those URLs (e.g. `homeRemote.connectFailed — tried: […]`) and
// any debug logging of candidates must never leak the token into user
// copy, crash reports, or logs. Keep the redaction here so the
// transport layer and every app share one implementation.
library;

/// Query-style secret parameter names whose values get redacted.
///
/// Covers the pairing/session credentials the thin client embeds in
/// candidate URLs (`?token=`, `&sessionToken=`, the compressed
/// `pairing=` blob, …) plus generic key/secret names that sometimes
/// surface in node error text.
final RegExp _secretQueryParam = RegExp(
  r"((?:^|[?&;\s])[a-z0-9_.-]*(?:token|secret|password|key|credential|auth|pairing)[a-z0-9_.-]*=)[^&\s;<>\[\]\)]+",
  caseSensitive: false,
);

/// Replace the value of every query-style secret parameter in [text]
/// with `<redacted>`.
///
/// `?token=abc123&x=1` becomes `?token=<redacted>&x=1`; text without
/// secret parameters is returned unchanged. Safe to run over arbitrary
/// transport/error strings — it never throws.
String redactSecretQueryValues(String text) => text.replaceAllMapped(
      _secretQueryParam,
      (m) => '${m[1]}<redacted>',
    );

/// One candidate's label for logs / error text, with its URL redacted.
String redactedCandidateLabel(String name, String url) =>
    '$name=${redactSecretQueryValues(url)}';
