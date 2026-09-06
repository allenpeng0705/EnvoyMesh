// Typed exceptions raised by the thin-client network / RPC layer.
//
// Keeping these in a single file makes the contract between
// [HomeRemoteClient] and its callers explicit, and gives the
// persistence / reconnect logic a reliable signal to act on.

/// Thrown by [HomeRemoteClient.call] when the home node explicitly
/// rejects an auth-required RPC because the session token is
/// missing, expired, or revoked.
///
/// Triggered by one of these JSON-RPC error shapes from the home
/// node (`apps/node/src/ws-server.ts`):
///   - `{ code: "UNAUTHORIZED", ... }`           (current contract)
///   - `{ code: "ERROR", message: "Authentication required" }`
///     (legacy / Capacitor / Social UI clients — still accepted for
///     back-compat)
///
/// This is the **only** exception that should cause the session
/// token to be deleted from secure storage. All other RPC failures
/// are transient (network drops, timeouts, etc.) and the caller
/// should keep retrying.
class UnauthorizedException implements Exception {
  /// Human-readable reason from the home node, or a fallback if
  /// the response did not include a message.
  final String reason;

  const UnauthorizedException(this.reason);

  @override
  String toString() => 'UnauthorizedException: $reason';
}
