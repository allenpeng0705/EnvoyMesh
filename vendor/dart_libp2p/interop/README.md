# Go-libp2p Interop Tests

End-to-end interoperability tests between **dart-libp2p** and **go-libp2p**.

## Prerequisites

- **Go** 1.24+ (`go version`)
- **Dart** 3.5+ (`dart --version`)

The Go peer binary is built automatically on first test run. To build it manually:

```bash
cd interop/go-peer
go build -o go-peer .
```

## Running the tests

From the project root:

```bash
# All interop tests
dart test test/interop/

# Host-level tests (identify, echo, ping, identify-push)
dart test test/interop/go_interop_host_test.dart

# Circuit Relay v2 tests
dart test test/interop/go_interop_relay_test.dart

# Kademlia DHT tests (currently skipped — see note below)
dart test test/interop/go_dht_interop_test.dart

# Low-level transport tests (Noise, Yamux, multistream)
dart test test/interop/go_interop_test.dart

# Single test by name
dart test test/interop/ --name="Dart BasicHost echoes via newStream"
```

## Test overview

### `go_interop_host_test.dart` (5 tests)

Full-stack BasicHost tests exercising the identify protocol, peerstore, and stream handling.

| Test | Direction | What it verifies |
|------|-----------|-----------------|
| Connect + identify | Dart -> Go | TCP dial, Noise, Yamux, identify exchange populates peerstore |
| Echo via newStream | Dart -> Go | `host.newStream()` path: connection lookup, identify wait, multistream-select |
| Echo handler | Go -> Dart | `host.setStreamHandler()`, inbound connection upgrade, echo round-trip |
| Ping | Go -> Dart | Built-in PingService handles Go's `/ipfs/ping/1.0.0` |
| Identify push | Go -> Dart | Go registers new protocol, triggers identify push, Dart peerstore updates |

### `go_interop_relay_test.dart` (2 tests)

Circuit Relay v2 tests using a 3-node topology (Go relay + two peers).

| Test | Topology | What it verifies |
|------|----------|-----------------|
| Dart dials through relay | Go relay <- Go echo-server; Dart client dials via circuit | Relay reservation, HOP CONNECT, Noise+Yamux over relay, echo round-trip |
| Go dials through relay | Go relay <- Dart echo-handler; Go client dials via circuit | Dart `CircuitV2Client.reserve()`, inbound STOP handling, echo round-trip |

### `go_dht_interop_test.dart` (4 tests — currently skipped)

Kademlia DHT (`/ipfs/kad/1.0.0`) interop tests using `dart-libp2p-kad-dht`.

| Test | Direction | What it verifies |
|------|-----------|-----------------|
| FIND_NODE | Dart -> Go | Dart connects to Go DHT server, queries for peer via routing table |
| GET_VALUE | Go -> Dart | Go stores value, Dart retrieves it via DHT |
| PROVIDE/FIND_PROVIDERS | Dart -> Go | Dart announces provider, Go finds it |
| PUT_VALUE/GET_VALUE | Dart -> Go | Dart stores value, Go retrieves it |

> **Note:** These tests are currently skipped because `dart-libp2p-kad-dht` uses JSON encoding
> for DHT messages, while the spec requires protobuf. The tests are ready to enable once the
> encoding is fixed.

### `go_interop_test.dart`

Lower-level transport tests that directly exercise the upgrader pipeline (TCP -> Noise -> Yamux) without the full BasicHost stack.

## Go peer modes

The Go peer binary (`interop/go-peer/go-peer`) supports multiple modes:

| Mode | Description |
|------|-------------|
| `server` | Listen with echo + identify handlers (long-running) |
| `client` | Connect to target peer and exit |
| `ping` | Connect and ping via `/ipfs/ping/1.0.0` |
| `echo-server` | Listen with echo handler only |
| `echo-client` | Connect, send message via `/echo/1.0.0`, verify echo |
| `push-test` | Connect, register new protocol to trigger identify push |
| `relay` | Run a Circuit Relay v2 service |
| `relay-echo-server` | Reserve slot on relay, handle echo streams |
| `relay-echo-client` | Dial peer through relay, send echo message |
| `dht-server` | Run a Kademlia DHT server (long-running) |
| `dht-put-value` | Connect to DHT peer and store a key-value pair |
| `dht-get-value` | Connect to DHT peer and retrieve a value by key |
| `dht-provide` | Connect to DHT peer and announce as content provider |
| `dht-find-providers` | Connect to DHT peer and find providers for a CID |

Usage: `./go-peer --mode=<mode> [--port=N] [--target=<multiaddr>] [--relay=<multiaddr>] [--message=<text>] [--key=<key>] [--value=<value>] [--cid=<cid>]`

## Architecture

```
test/interop/
  go_interop_*_test.dart    Dart test files
  helpers/
    go_process_manager.dart  Manages Go peer process lifecycle

interop/go-peer/
  main.go                    Go peer with all test modes
  go.mod / go.sum            Go module dependencies
```

`GoProcessManager` handles building, starting, and stopping Go peer processes.
It parses stdout for `PeerID:`, `Listening:`, `CircuitAddr:`, and `Ready` markers
to extract connection details for the Dart tests.
