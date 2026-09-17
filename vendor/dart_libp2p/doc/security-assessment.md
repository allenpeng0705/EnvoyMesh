# Security Assessment (dart-libp2p)

Date: 2026-01-15
Scope: Static review of the current workspace codebase only (no dynamic testing,
fuzzing, or dependency vulnerability scanning).

## Summary

The package implements Noise XX with ChaCha20-Poly1305 and Ed25519 identities,
which is a strong baseline. However, several logging statements currently emit
secret key material and plaintext, and the encrypted framing layer accepts
unbounded message sizes. These issues can lead to confidentiality loss and
denial-of-service risks in real deployments.

## Findings (ordered by severity)

### Critical: Secret material and plaintext logging

Secret keys and plaintext are logged at `finer`/`fine` levels in the security
stack. If debug logs are enabled or accessible, this fully compromises
confidentiality.

- `lib/p2p/security/secured_connection.dart`
  - Logs encryption and decryption keys via `extractBytes()`.
  - Logs plaintext payloads in `write()`.
- `lib/p2p/security/noise/noise_protocol.dart`
  - Logs Noise session keys via `extractBytes()` during handshake.

Impact: Any attacker or operator with log access can recover session keys or
plaintext, defeating transport security.

Recommendation:
- Remove all logging that emits secret key bytes or plaintext.
- If troubleshooting is needed, gate diagnostics behind a secure, explicit
  opt-in flag and never log raw secrets.

### High: Unbounded encrypted frame length (DoS risk)

`SecuredConnection` reads a 4-byte length prefix and then attempts to read the
entire frame without enforcing a maximum size. A peer can request an extremely
large message to trigger excessive memory usage or blocking reads.

Impact: Remote peers can cause memory pressure or stall connections.

Recommendation:
- Enforce a configurable max frame size and close the connection when exceeded.
- Consider streaming large payloads with bounded buffers.

### Medium: Insecure mode is available and easy to toggle

`Config.insecure` disables security entirely. While useful for tests, a
misconfiguration can silently disable encryption in production.

Impact: Accidental plaintext communication.

Recommendation:
- Require an explicit opt-in (e.g., a dedicated constructor or "I accept risk"
  flag).
- Emit a high-visibility runtime warning when insecure mode is enabled.

## Strengths

- Noise XX with ChaCha20-Poly1305 and Ed25519 identity provides strong security
  and forward secrecy.
- Configuration validation prevents accidental omission of security protocols
  unless insecure mode is explicitly enabled.

## Suggested Next Steps

1. Remove all secret/plaintext logging immediately.
2. Add a max frame size check in `SecuredConnection`.
3. Add guardrails and warnings around insecure mode.

