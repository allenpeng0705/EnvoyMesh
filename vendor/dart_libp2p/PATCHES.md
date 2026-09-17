# Vendored fork of `dart_libp2p` 1.0.3

This directory is a **modified copy** of the pub.dev package `dart_libp2p` 1.0.3, not a pristine
copy. It is vendored once here, in the family repo, so that every EnvoyMesh product that consumes
the shared Dart SDK (`envoy_mesh_libp2p` → apps/envoygo, EnvoyCoder/apps/mobile, …) resolves the
same patched muxer instead of each app carrying its own copy.

- **Upstream source:** `~/.pub-cache/hosted/pub.dev/dart_libp2p-1.0.3/`
- **Upstream version:** 1.0.3 (package name and version in `pubspec.yaml` are intentionally left
  unchanged so `dependency_overrides: dart_libp2p: path: …` resolves cleanly).
- **Consumed via:** `dependency_overrides` entries in each **pub root** (see below). Overrides are
  honoured only from the root package, so a path override cannot be injected by a family-level
  package.

> **Re-vendoring on the next upstream bump means re-applying the patch below.** Do not silently
> refresh this directory from pub.dev: the patch is the only reason it exists. After copying a new
> upstream version over it, re-apply the change in §1, re-run the patch-count check, and re-run the
> acceptance test (`EnvoyCoder/apps/mobile/test/libp2p_relay_e2e_test.dart`, gated `RUN_E2E=1`).

## Why the fork exists

A Dart client could not open **any** libp2p stream to a JavaScript host
(`@chainsafe/libp2p-yamux` 8.x). Both ends were observed:

- Dart: `[OPEN-STREAM-DIAG] SYN sent for streamID=1, waiting for ACK (timeout=30s)` and never an
  `ACK received` line; the stream setup then timed out and Identify died with
  `Bad state: Cannot add new events after calling close`.
- JavaScript (`DEBUG=libp2p:*`): `…:yamux:inbound:1 start protocol negotiation, timing out after
  10000ms` — the SYN arrived and the responder began reading, but the opener's
  multistream-select proposal never came.

The cause is an asymmetry between the two yamux implementations:

1. `dart_libp2p`'s `YamuxSession.openStream` (1.0.3) sent a `SYN` and then **awaited an explicit
   `ACK`** before `stream.open()` — and therefore before Phase-4 multistream-select could write the
   protocol proposal.
2. `@chainsafe/libp2p-yamux` does not ACK on stream acceptance. Its ACK flag is emitted lazily by
   `YamuxStream.getSendFlags()` (`dist/src/stream.js`) on the receiver's **first outbound frame**,
   and multistream-select's *responder* reads the opener's proposal before writing anything.

Every libp2p protocol starts with an opener-written stream, so this deadlocked all Dart → JS streams
(relayed and loopback-direct alike; the relay was never involved). There is no shared alternative
muxer to sidestep it: `dart_libp2p` is Yamux-only and EnvoyMesh configures `streamMuxers: [yamux()]`
alone.

## §1 — The patch

**File:** `lib/p2p/transport/multiplexing/yamux/session.dart`
**Function:** `YamuxSession.openStream(Context context)`
**Upstream hunk:** the four lines after the `SYN` send (upstream `session.dart:722-730`).

Before (upstream):

```dart
      final frame = YamuxFrame.synStream(streamId);
      await _sendFrame(frame);
      _log.fine('$_logPrefix [OPEN-STREAM-DIAG] SYN sent for streamID=$streamId, waiting for ACK (timeout=${_config.streamWriteTimeout.inSeconds}s)');

      await completer.future.timeout(_config.streamWriteTimeout);
      _log.fine('$_logPrefix [OPEN-STREAM-DIAG] ACK received for streamID=$streamId');

      await stream.open();
```

After (this fork):

```dart
      final frame = YamuxFrame.synStream(streamId);
      await _sendFrame(frame);
      _log.fine('$_logPrefix [OPEN-STREAM-DIAG] SYN sent for streamID=$streamId');

      // [EnvoyMesh fork — see vendor/dart_libp2p/PATCHES.md]
      // … rationale comment …
      unawaited(completer.future.then((_) {
        _log.fine('$_logPrefix [OPEN-STREAM-DIAG] ACK received for streamID=$streamId');
      }).catchError((_) {}));

      await stream.open();
```

That is the whole change: the opener still sends `SYN`, still registers the per-stream completer,
and still sends its initial window update in `stream.open()` — it simply no longer *waits* for the
peer's ACK before doing so. The ACK is still observed for diagnostics.

### Yamux semantics this relies on

- Yamux (`hashicorp/yamux`, the reference implementation, and the libp2p spec) treats a stream as
  usable by the opener as soon as `SYN` has been sent. The ACK flag is an acknowledgement that the
  remote has accepted the stream, not a precondition for the opener to write. `go-yamux`'s
  `Session.Open()` returns immediately after `sendWindowUpdate(SYN)` and the caller writes at once.
- The ACK is flow-control-adjacent and emitted lazily. `@chainsafe/libp2p-yamux` moves
  `SYNReceived → Established` and stamps the ACK flag on the **next frame it sends**
  (`YamuxStream.getSendFlags()`); it never sends a bare ACK. Waiting for a frame the peer will only
  emit after reading our bytes is a circular wait.
- Nothing downstream of `openStream` assumes the ACK has arrived. `_pendingStreams` is only read by
  the ACK branch in `_handleFrame` (which completes/removes the entry) and by
  `_cleanupWithoutFrames` (which fails and clears pending entries at teardown). `YamuxStream.write`
  gates on the stream's own state, set by `stream.open()`, not on ACK.
- Errors on the (now unawaited) completer are explicitly observed via `catchError`, so session
  teardown's `completeError(StateError('Session closed while opening stream …'))` is not reported as
  an unhandled zone error.

### Why it is safe for Dart ↔ Dart sessions too

Dart↔Dart already ACKed promptly (`_handleNewStream` fire-and-forgets `synAckStream`), so removing
the wait changes nothing observable there: the ACK still arrives, `_handleFrame` still completes and
removes the pending completer, and the diagnostic line still prints. The patch only removes a wait
that happened to be satisfied; it does not change what is sent or the order of frames. The existing
`dart_libp2p` yamux tests (frame-level and session-level) exercise state transitions, not the
open-blocking behaviour, and are expected to stay green.

### Narrower alternatives considered

- **Configuration only.** There is no flag for this. `MultiplexerConfig` exposes
  `streamWriteTimeout`, and `openStream` passes it straight to `Future.timeout`; the wait is
  unconditional, so a timeout value cannot disable it (only shorten the deadlock to a faster
  failure). A config field would itself be a code change, and a larger one than this.
- **Patch the JS side** (`@chainsafe/libp2p-yamux`) to ACK on acceptance. Rejected by the owner:
  the JS side is also consumed by non-family peers, and the deadlock is Dart's added wait.
- **Avoid the libp2p rungs** and use the family WebSocket relay. Rejected by the owner: the
  libp2p rungs are a product feature and the goal is genuine cross-language interop.

## §2 — Which pub roots carry the override

`dependency_overrides` are honoured only from the pub root, so each root that resolves
`dart_libp2p` needs its own entry. The override added in each case is:

```yaml
dependency_overrides:
  dart_libp2p:
    path: <relative path to EnvoyMesh/vendor/dart_libp2p>
```

Roots found and updated:

| Pub root | Resolves `dart_libp2p` via | Override |
|---|---|---|
| `EnvoyMesh/apps/envoygo` | `envoy_mesh_libp2p` (path) | yes |
| `EnvoyCoder/apps/mobile` | `envoy_mesh_libp2p` (path) | yes |
| `EnvoyMesh/packages/envoy-reuse-fixture` | direct dependency | yes |
| `EnvoyMesh/packages/envoy-mesh-libp2p-dart` | direct dependency | **yes** (reversed — see below) |

### Why `envoy-mesh-libp2p-dart` carries one too (a reversed decision)

It first did **not**, following the rule its pubspec records for `mdns_dart`: overrides are honoured
only from the root, so an override inside a package cannot reach that package's consumers, and adding
one moves its tracked `pubspec.lock`. That reasoning is sound for *consumers*, and it is still why
`mdns_dart` is not overridden there.

It was reversed for this fork because the two cases are not the same shape. `mdns_dart`'s override
affects only whoever runs tests in that package. This one decides **which muxer the package's own
tests exercise** — and this package is where the Dart libp2p behaviour actually lives, so it is the
one place where validating the fork matters most. A wrapper that validates against a muxer other
than the one it ships with is testing something nobody runs.

Cost, accepted knowingly and recorded rather than discovered later: its tracked `pubspec.lock` now
records `dart_libp2p` as `path: ../../vendor/dart_libp2p`. Pub does not consult a dependency's lock
file when resolving a consumer's graph, so the apps above are unaffected — only this package's lock
moves. Verified after the override landed: `dart pub get` succeeds, the lock shows
`source: path`, `dart analyze` is clean, and `dart test` is **21/21 against the fork** (previously
21/21 against unforked 1.0.3, so the patch does not change this package's behaviour either).

The `pointycastle`/`mdns_dart` overrides already present in the app roots stay; the fork entry is
additive, next to the comment block that explains why overrides live at the root.
