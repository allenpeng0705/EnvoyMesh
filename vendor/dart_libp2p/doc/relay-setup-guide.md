# Circuit Relay v2 Setup Guide

This guide explains how to set up Circuit Relay v2 in dart-libp2p, based on the go-libp2p implementation with nested security and multiplexing.

## Table of Contents

1. [Running a Relay Server](#running-a-relay-server)
2. [Using Circuit Relay (AutoRelay Client)](#using-circuit-relay-autorelay-client)
3. [Dialing Through Circuit Relay](#dialing-through-circuit-relay)
4. [Architecture and Data Flow](#architecture-and-data-flow)
5. [Testing and Verification](#testing-and-verification)
6. [Troubleshooting](#troubleshooting)

---

## Running a Relay Server

### Basic Setup (Always-On Relay)

For a dedicated relay server that's always publicly reachable:

```dart
import 'package:dart_libp2p/p2p/protocol/autonatv2/options.dart';

final config = Config()
  ..enableRelay = true                    // Enable relay service
  ..enableAutoNAT = true                  // Enable AutoNAT server for other peers
  ..forceReachability = Reachability.public  // Force public status (skips ambient probing)
  ..autoNATv2Options = [allowPrivateAddrs()]; // Allow private addrs for local testing

final host = await BasicHost.create(
  network: network,
  config: config,
);

await host.start();
// ✅ Relay service automatically starts and advertises the hop protocol
// ✅ AutoNAT v2 server provides reachability checks for other peers
// No manual event emission required!
```

**What happens automatically:**
1. `BasicHost` detects `forceReachability = Reachability.public`
2. Emits `EvtLocalReachabilityChanged(reachability: Reachability.public)` during startup
3. `RelayManager` receives the event and starts the relay service
4. Relay service registers the `/libp2p/circuit/relay/0.2.0/hop` protocol handler
5. AutoNAT v2 server starts and advertises `/libp2p/autonat/2/*` protocols
6. AmbientAutoNATv2 client is **skipped** (to avoid contradicting forced status)
7. Other peers can discover this node as a relay and use it for reachability checks

### Dynamic Relay (With AutoNAT Detection)

For relays that should only operate when publicly reachable (e.g., mobile nodes):

```dart
import 'package:dart_libp2p/p2p/host/autonat/ambient_config.dart';

final config = Config()
  ..enableRelay = true     // Enable relay service
  ..enableAutoNAT = true   // Enable AmbientAutoNATv2 for dynamic detection
  ..ambientAutoNATConfig = AmbientAutoNATv2Config(
    bootDelay: Duration(seconds: 5),      // Wait before first probe
    retryInterval: Duration(seconds: 30),  // Retry on failure
    refreshInterval: Duration(minutes: 5), // Refresh when stable
  );

final host = await BasicHost.create(
  network: network,
  config: config,
);

await host.start();
// Relay service starts/stops automatically based on AmbientAutoNATv2 detection
```

**AmbientAutoNATv2** will:
- Automatically probe connected peers for reachability checks
- Build confidence through multiple successful probes (confidence levels 0-3)
- Emit `EvtLocalReachabilityChanged` when status changes
- Start relay service when you become publicly reachable
- Stop relay service when you become privately reachable (e.g., network change)

**No manual event emission needed** - it's all automatic!

---

## Using Circuit Relay (AutoRelay Client)

### Recommended Setup (With AmbientAutoNATv2)

The **canonical approach** - fully automatic reachability detection:

```dart
import 'package:dart_libp2p/p2p/host/autonat/ambient_config.dart';

final config = Config()
  ..enableAutoRelay = true   // Enable AutoRelay client
  ..enableAutoNAT = true     // Enable AmbientAutoNATv2 for automatic detection
  ..ambientAutoNATConfig = AmbientAutoNATv2Config(
    bootDelay: Duration(milliseconds: 500),  // Fast boot for testing
    retryInterval: Duration(seconds: 1),      // Quick retry on failure
    refreshInterval: Duration(seconds: 30),   // Refresh when stable
  );

final host = await BasicHost.create(
  network: network,
  config: config,
);

await host.start();

// Connect to relay server (AmbientAutoNATv2 needs peers for probing)
final relayAddr = MultiAddr('/ip4/1.2.3.4/tcp/4001/p2p/12D3Koo...');
final relayPeerId = PeerId.fromString('12D3Koo...');
await host.connect(AddrInfo(relayPeerId, [relayAddr]));
print('✅ Connected to relay server');

// Wait for AmbientAutoNATv2 + AutoRelay initialization
// bootDelay (500ms) + probes (1-2s) + AutoRelay (2-3s) ≈ 5-6s total
print('⏰ Waiting for automatic reachability detection and relay reservations...');
await Future.delayed(Duration(seconds: 6));

// Verify circuit addresses are advertised
final myAddrs = host.addrs;
final circuitAddrs = myAddrs.where((a) => a.toString().contains('/p2p-circuit')).toList();
print('📍 Circuit addresses: $circuitAddrs');
// Circuit addresses look like:
// /ip4/1.2.3.4/tcp/4001/p2p/RELAY_PEER_ID/p2p-circuit/
```

**What happens automatically:**
1. AmbientAutoNATv2 waits `bootDelay` (500ms) then begins probing
2. Probes the relay server (must support `/libp2p/autonat/2/dial-request`)
3. Receives `E_DIAL_REFUSED` response (expected for private addresses)
4. Interprets as `Reachability.private` and builds confidence (3 successful probes)
5. Emits `EvtLocalReachabilityChanged(reachability: Reachability.private)`
6. AutoRelay receives event and starts looking for relay candidates
7. Discovers the relay server and makes a reservation
8. Advertises circuit addresses via `EvtAutoRelayAddrsUpdated`

### Automatic Relay Connection

Configure relay servers to automatically connect during host startup:

```dart
import 'package:dart_libp2p/p2p/host/autonat/ambient_config.dart';

final config = Config()
  ..enableAutoRelay = true   // Enable AutoRelay client
  ..enableAutoNAT = true     // Enable AmbientAutoNATv2 for automatic detection
  ..relayServers = [
    '/ip4/relay.example.com/tcp/4001/p2p/12D3KooW...',
    '/ip4/backup-relay.example.com/tcp/4001/p2p/12D3KooW...',
  ]
  ..ambientAutoNATConfig = AmbientAutoNATv2Config(
    bootDelay: Duration(milliseconds: 500),  // Fast boot for testing
    retryInterval: Duration(seconds: 1),
    refreshInterval: Duration(seconds: 30),
  );

final host = await BasicHost.create(
  network: network,
  config: config,
);

await host.start();
// ✅ Host automatically connects to configured relay servers during startup
// No manual connect() calls needed!

// Wait for AmbientAutoNATv2 + AutoRelay initialization
await Future.delayed(Duration(seconds: 6));

// Verify circuit addresses are advertised
final myAddrs = host.addrs;
final circuitAddrs = myAddrs.where((a) => a.toString().contains('/p2p-circuit')).toList();
print('📍 Circuit addresses: $circuitAddrs');
```

**What happens automatically:**
1. During `host.start()`, connects to all configured relay servers (blocking)
2. Failed relay connections are logged and skipped (non-blocking)
3. AmbientAutoNATv2 can immediately use these relays for probing
4. AutoRelay has immediate relay candidates if you're behind NAT
5. Opportunistic relay discovery continues from peer connections

**Benefits:**
- **No manual connect()** - relay connections happen automatically
- **Fast initialization** - relays are available before AutoNAT probing starts
- **Graceful degradation** - failed connections don't block startup
- **Flexibility** - still discovers new relays from normal peer connections

### Alternative: Manual Trigger (For Testing Only)

If you need to skip AutoNAT for testing purposes:

```dart
final config = Config()
  ..enableAutoRelay = true   // Enable AutoRelay client
  ..enableAutoNAT = false;   // Skip automatic detection

final host = await BasicHost.create(
  network: network,
  config: config,
);

await host.start();

// Connect to relay server FIRST
await host.connect(AddrInfo(relayPeerId, [relayAddr]));

// Manually trigger AutoRelay
final emitter = await host.eventBus.emitter(EvtLocalReachabilityChanged);
await emitter.emit(EvtLocalReachabilityChanged(reachability: Reachability.private));
await emitter.close();
print('✅ AutoRelay manually triggered');

// Wait for reservations
await Future.delayed(Duration(seconds: 10));
```

**Note:** Manual triggering is **not recommended** for production. Use AmbientAutoNATv2 for automatic, reliable reachability detection.

---

## Dialing Through Circuit Relay

### Understanding Circuit Addresses

AutoRelay advertises **base circuit addresses**:
```
/ip4/1.2.3.4/tcp/4001/p2p/RELAY_PEER_ID/p2p-circuit/
```

To dial a peer through the relay, you need a **full dialable address**:
```
/ip4/1.2.3.4/tcp/4001/p2p/RELAY_PEER_ID/p2p-circuit/p2p/DEST_PEER_ID
```

### Constructing Dialable Circuit Addresses

```dart
import 'package:dart_libp2p/p2p/multiaddr/protocol.dart';

// Get destination peer's base circuit addresses
final destPeerId = PeerId.fromString('12D3Koo...');
final destAddrs = await host.peerStore.addrBook.addrs(destPeerId);

// Filter to circuit addresses
final baseCircuitAddrs = destAddrs.where((addr) {
  final addrStr = addr.toString();
  return addrStr.contains('/p2p-circuit') && 
         addrStr.contains('RELAY_PEER_ID'); // Contains relay ID
}).toList();

// Construct full dialable addresses by appending destination peer ID
final dialableCircuitAddrs = baseCircuitAddrs.map((addr) {
  return addr.encapsulate(Protocols.p2p.name, destPeerId.toString());
}).toList();

print('Dialable circuit addresses:');
for (final addr in dialableCircuitAddrs) {
  print('  - $addr');
}
```

### Forcing Circuit Relay Usage

To ensure connections use circuit relay (not direct connection):

```dart
// Clear existing addresses to prevent direct dial
await host.peerStore.addrBook.clearAddrs(destPeerId);

// Add ONLY circuit addresses
await host.peerStore.addrBook.addAddrs(
  destPeerId,
  dialableCircuitAddrs,
  Duration(hours: 1),
);

// Now any connection will use circuit relay
await host.connect(AddrInfo(destPeerId, dialableCircuitAddrs));
```

### Using Circuit Connections

Once connected, use the connection normally:

```dart
// Ping through relay
final pingService = PingService(host);
final result = await pingService.ping(destPeerId).first;
print('✅ Ping RTT: ${result.rtt?.inMilliseconds}ms');

// Verify connection is relayed
final conns = host.network.connsToPeer(destPeerId);
final isRelayed = conns.first.remoteMultiaddr.toString().contains('/p2p-circuit');
print('Connection is relayed: $isRelayed');

// Use any protocol - it works transparently through the relay
final stream = await host.newStream(destPeerId, ['/my-protocol/1.0.0']);
```

---

## Architecture and Data Flow

### Nested Security and Multiplexing

Circuit relay in dart-libp2p follows the go-libp2p model with nested security/multiplexing layers:

```
Application Data (e.g., Ping, Custom Protocol)
    ↓
Yamux (inner)       ← Multiplexing for relayed connection
    ↓  
Noise (inner)       ← Security for relayed connection
    ↓
ONE Relay Stream    ← Single stream from HOP CONNECT
    ↓
Yamux (outer)       ← Multiplexing to relay server
    ↓
Noise (outer)       ← Security to relay server
    ↓
Transport (UDX/TCP) ← Physical connection
```

**Key Insight:** The `RelayedConn` (single stream through relay) is itself upgraded with Noise + Yamux, creating a nested structure. This allows multiple application streams over one relay connection.

### Connection Upgrade Flow

1. **Dial**: `CircuitV2Client.dial()` returns `RelayedConn` (raw connection wrapping relay stream)
2. **Check State**: `RelayedConn.state` reports empty `security` and `streamMultiplexer`
3. **Upgrade**: Swarm calls `upgrader.upgradeOutbound()` on `RelayedConn`
4. **Noise**: Upgrader negotiates Noise security on the relay stream
5. **Yamux**: Upgrader negotiates Yamux multiplexing on the secured stream
6. **Result**: Returns `UpgradedConnectionImpl` with full security/multiplexing stack

### Circuit Relay Protocol Messages

**HOP CONNECT (Source → Relay):**
```protobuf
HopMessage {
  type: CONNECT
  peer: { id: destination_peer_id, addrs: [...] }
}
```

**STOP (Relay → Destination):**
```protobuf
StopMessage {
  type: CONNECT
  peer: { id: source_peer_id, addrs: [...] }
}
```

**STOP Response (Destination → Relay):**
```protobuf
StopMessage {
  type: STATUS
  status: OK
}
```

**HOP Response (Relay → Source):**
```protobuf
HopMessage {
  type: STATUS
  status: OK
}
```

After successful handshake, the relay forwards data bidirectionally between source and destination streams.

---

## Testing and Verification

### In-Process Integration Test

See `test/p2p/host/autorelay_integration_test.dart` for a complete example:

```dart
test('Circuit relay with ping (automatic detection)', () async {
  // 1. Create relay server with forced public reachability
  final relayNode = await createLibp2pNode(
    enableRelay: true,
    forceReachability: Reachability.public,
    autoNATOptions: [allowPrivateAddrs()], // For local testing
  );
  
  // 2. Create clients with AutoRelay and fast AmbientAutoNATv2 config
  final autoNATConfig = AmbientAutoNATv2Config(
    bootDelay: Duration(milliseconds: 500),
    retryInterval: Duration(seconds: 1),
    refreshInterval: Duration(seconds: 5),
  );
  
  final peerA = await createLibp2pNode(
    enableAutoRelay: true,
    ambientAutoNATConfig: autoNATConfig,
  );
  final peerB = await createLibp2pNode(
    enableAutoRelay: true,
    ambientAutoNATConfig: autoNATConfig,
  );
  
  // 3. Connect to relay (needed for AmbientAutoNATv2 probing)
  await peerA.host.connect(AddrInfo(relayNode.peerId, relayNode.host.addrs));
  await peerB.host.connect(AddrInfo(relayNode.peerId, relayNode.host.addrs));
  
  // 4. Wait for AmbientAutoNATv2 + AutoRelay
  // No manual event emission needed!
  await Future.delayed(Duration(seconds: 6));
  
  // 5. Verify circuit addresses
  final circuitAddrs = peerA.host.addrs.where((a) => 
    a.toString().contains('/p2p-circuit')
  ).toList();
  expect(circuitAddrs, isNotEmpty);
  
  // 6. Construct dialable circuit address
  final dialableAddr = circuitAddrs.first.encapsulate(
    Protocols.p2p.name, 
    peerB.peerId.toString()
  );
  
  // 7. Force circuit relay usage
  await peerA.host.peerStore.addrBook.clearAddrs(peerB.peerId);
  await peerA.host.peerStore.addrBook.addAddrs(
    peerB.peerId, 
    [dialableAddr], 
    Duration(hours: 1)
  );
  
  // 8. Ping through relay
  final ping = PingService(peerA.host);
  final result = await ping.ping(peerB.peerId).first;
  expect(result.hasError, isFalse);
  
  // 9. Verify relayed connection
  final conn = peerA.host.network.connsToPeer(peerB.peerId).first;
  expect(conn.remoteMultiaddr.toString().contains('/p2p-circuit'), isTrue);
});
```

**Key differences from old approach:**
- ✅ Uses `forceReachability` for relay server
- ✅ Uses `AmbientAutoNATv2Config` for fast testing
- ✅ No manual `EvtLocalReachabilityChanged` emission
- ✅ Fully automatic reachability detection

### Docker Integration Test

See `test/integration/holepunch_network/holepunch_network_integration_test.dart` for containerized testing with NAT simulation.

### Container Setup (peer_main.dart)

The integration test peer demonstrates production-ready setup:

```dart
// 1. Configure host based on role
final config = Config();
if (role == 'relay') {
  config
    ..enableRelay = true
    ..enableAutoNAT = true  // Provide AutoNAT service to clients
    ..forceReachability = Reachability.public  // Skip ambient probing
    ..autoNATv2Options = [allowPrivateAddrs()]; // For local testing
} else {
  config
    ..enableAutoRelay = true
    ..enableAutoNAT = true  // Enable AmbientAutoNATv2
    ..ambientAutoNATConfig = AmbientAutoNATv2Config(
      bootDelay: Duration(milliseconds: 500),
      retryInterval: Duration(seconds: 1),
      refreshInterval: Duration(seconds: 30),
    );
}

// 2. Start host (auto-starts relay if enabled)
await host.start();

// 3. For relay servers: done! Service is active.
if (role == 'relay') {
  print('📡 Relay server ready (HOP + AutoNAT v2 server active)');
  return;
}

// 4. For clients: connect to relay servers
await _connectToRelayServers();

// 5. Wait for AmbientAutoNATv2 + AutoRelay initialization
// No manual event emission needed!
print('⏰ Waiting for automatic reachability detection and relay reservations...');
await Future.delayed(Duration(seconds: 5));

// 6. Circuit addresses now available
print('📍 My addresses: ${host.addrs}');
```

**Key improvements:**
- ✅ Relay servers use `forceReachability` to skip ambient probing
- ✅ Clients use `AmbientAutoNATv2Config` for fast testing
- ✅ No manual `EvtLocalReachabilityChanged` emission needed
- ✅ Automatic reachability detection and relay discovery

---

## Troubleshooting

### Circuit Addresses Not Advertised

**Symptoms:**
- `host.addrs` doesn't contain `/p2p-circuit`
- AutoRelay doesn't discover relay

**Solutions:**

1. **Verify AmbientAutoNATv2 is enabled:**
   ```dart
   final config = Config()
     ..enableAutoRelay = true
     ..enableAutoNAT = true;  // ✅ Must be true for automatic detection
   ```

2. **Connect to relay server that supports AutoNAT v2:**
   ```dart
   await host.connect(AddrInfo(relayPeerId, [relayAddr]));
   
   // Check relay supports both Circuit v2 AND AutoNAT v2
   final protocols = await host.peerStore.protoBook.getProtocols(relayPeerId);
   print('Relay protocols: $protocols');
   // Should include:
   // - '/libp2p/circuit/relay/0.2.0/hop'
   // - '/libp2p/autonat/2/dial-request'
   ```

3. **Wait for AmbientAutoNATv2 + AutoRelay initialization:**
   ```dart
   // AmbientAutoNATv2: bootDelay + probes (500ms + 1-2s)
   // AutoRelay: discovery + reservation (2-3s)
   await Future.delayed(Duration(seconds: 6));
   ```

4. **Check AmbientAutoNATv2 logs for errors:**
   ```dart
   Logger.root.level = Level.FINE;
   Logger.root.onRecord.listen((record) {
     if (record.loggerName.contains('ambient_autonat_v2')) {
       print('${record.level.name}: ${record.message}');
     }
   });
   // Look for "no valid peers for autonat v2" or "E_DIAL_REFUSED"
   ```

5. **Verify relay has AutoNAT v2 server enabled:**
   ```dart
   // Relay configuration must include:
   final relayConfig = Config()
     ..enableRelay = true
     ..enableAutoNAT = true  // ✅ Provides AutoNAT service to clients
     ..forceReachability = Reachability.public;
   ```

### Dial Fails with "No addresses"

**Symptoms:**
- Dial fails: "No addresses found for peer"
- Circuit address missing destination peer ID

**Solution:**
Use full dialable address with destination peer ID:

```dart
// ❌ WRONG: Base circuit address (missing destination)
final addr = '/ip4/1.2.3.4/tcp/4001/p2p/RELAY_ID/p2p-circuit/';

// ✅ CORRECT: Full dialable address (with destination)
final addr = '/ip4/1.2.3.4/tcp/4001/p2p/RELAY_ID/p2p-circuit/p2p/DEST_PEER_ID';

// Use encapsulate() to construct correctly
final dialableAddr = baseCircuitAddr.encapsulate(
  Protocols.p2p.name,
  destPeerId.toString()
);
```

### Connection Succeeds But Not Using Relay

**Symptoms:**
- Ping works but connection doesn't contain `/p2p-circuit`
- Direct connection established instead

**Solution:**
Clear existing addresses before adding circuit addresses:

```dart
// Force circuit relay usage
await host.peerStore.addrBook.clearAddrs(destPeerId); // Clear direct addresses
await host.peerStore.addrBook.addAddrs(
  destPeerId,
  dialableCircuitAddrs, // Only circuit addresses
  Duration(hours: 1)
);
```

### Relay Reservation Fails

**Symptoms:**
- AutoRelay runs but no circuit addresses advertised
- Logs show reservation failures

**Solutions:**

1. **Check relay has resources available:**
   ```dart
   // Relay servers have limits on reservations
   // Default: 128 concurrent reservations
   ```

2. **Verify relay is publicly reachable:**
   ```dart
   // For relay servers
   config.enableRelay = true;
   config.enableAutoNAT = false; // Assumes public
   ```

3. **Check connection to relay is stable:**
   ```dart
   final connectedness = host.network.connectedness(relayPeerId);
   print('Relay connectedness: $connectedness');
   // Should be 'connected'
   ```

### Ping Through Relay Times Out

**Symptoms:**
- Circuit address constructed correctly
- Connection established but ping times out

**Solutions:**

1. **Verify both sides have upgraded connection:**
   ```dart
   // Check logs for "Going to try and upgrade to [[/noise]]"
   // Both source and destination must upgrade RelayedConn
   ```

2. **Check CircuitV2Client is registered as transport:**
   ```dart
   // Should happen automatically in BasicHost.start()
   // when enableRelay=true or enableAutoRelay=true
   ```

3. **Verify relay is forwarding data:**
   ```dart
   // Check relay logs for "Relaying data from source to destination"
   ```

---

## Understanding AmbientAutoNATv2

### How It Works

**AmbientAutoNATv2** is an orchestrator that wraps the AutoNAT v2 protocol to provide automatic, continuous reachability detection:

1. **Boot Delay**: Waits `bootDelay` after start (default 15s, configurable to 500ms for testing)
2. **Peer Discovery**: Monitors connected peers for AutoNAT v2 support (`/libp2p/autonat/2/dial-request`)
3. **Probing**: Sends dial requests to AutoNAT v2 servers
4. **Response Handling**:
   - `E_DIAL_REFUSED`: Interpreted as **private** reachability (expected for NAT)
   - `OK` + dial-back success: Interpreted as **public** reachability
   - Errors: Treated as **unknown** reachability
5. **Confidence Tracking**: Builds confidence (0-3) through multiple successful probes
6. **Event Emission**: Emits `EvtLocalReachabilityChanged` when status changes
7. **Continuous Monitoring**: Reschedules probes based on current status

### E_DIAL_REFUSED: Why It Means "Private"

When you're behind NAT, the AutoNAT v2 server responds with `E_DIAL_REFUSED` because:
- Your IP address is private (e.g., `192.168.x.x`, `10.x.x.x`)
- The server cannot reach private addresses from the public internet
- This is the **expected and correct** response for NAT scenarios

AmbientAutoNATv2 correctly interprets this as `Reachability.private`, triggering AutoRelay to find relay servers.

### Configuration Options

```dart
AmbientAutoNATv2Config(
  bootDelay: Duration(seconds: 15),      // Wait before first probe (default: 15s)
  retryInterval: Duration(seconds: 60),  // Retry after failures (default: 60s)
  refreshInterval: Duration(minutes: 15), // Refresh when stable (default: 15m)
  addressFunc: null,                      // Custom address filter (optional)
)
```

**For production:**
- Use default intervals for stable, low-overhead probing
- Let `bootDelay` be 15s to allow network to stabilize

**For testing:**
- Use fast intervals (500ms boot, 1s retry) for quick feedback
- Configure relay with `allowPrivateAddrs()` for local testing

## Best Practices

1. **Use AmbientAutoNATv2 for automatic detection**
   - No manual event emission needed
   - Continuous monitoring and confidence tracking
   - Handles network changes automatically

2. **Connect to relay before initialization completes**
   - AmbientAutoNATv2 needs connected peers for probing
   - Connect to relay immediately after `host.start()`

3. **Use appropriate timeouts**
   - AmbientAutoNATv2 + AutoRelay: 5-6 seconds (with fast config)
   - Ping through relay: 10-15 seconds (higher latency than direct)

4. **Handle relay disconnections**
   - Subscribe to `EvtAutoRelayAddrsUpdated` to detect when relays change
   - Re-advertise circuit addresses when relay list updates

5. **Verify circuit usage in tests**
   - Always check connection addresses contain `/p2p-circuit`
   - Don't assume circuit usage - verify it!

6. **Production relay servers**
   - Use `forceReachability = Reachability.public` to skip probing
   - Enable AutoNAT v2 server for clients (`enableAutoNAT = true`)
   - Use dedicated nodes with good network connectivity
   - Configure resource limits appropriately
   - Monitor relay usage and reservations

7. **Security considerations**
   - Circuit relay uses nested Noise security
   - Relay cannot decrypt application data
   - End-to-end encryption maintained between peers
   - AutoNAT v2 dial-backs are authenticated

---

## What's New

### AmbientAutoNATv2 Implementation

- **Automatic Reachability Detection**: No manual event emission required
- **Confidence Tracking**: 0-3 confidence levels with gradual status changes
- **E_DIAL_REFUSED Handling**: Correctly interprets as private reachability
- **Event Emission**: Automatic `EvtLocalReachabilityChanged` events
- **Configurable Intervals**: Fast boot for testing, stable intervals for production

### Circuit Relay v2 Improvements

- **Nested Security/Multiplexing**: Follows go-libp2p architecture
- **Direct Address Filtering**: Prevents circular HOP dialing
- **Double `/p2p-circuit` Fix**: Skips addresses already containing circuit component
- **Relay Service Lifecycle**: Separate AutoNAT server (always on) from ambient client (conditional)

### New Configuration Options

- `forceReachability`: Force specific reachability status (for relay servers)
- `ambientAutoNATConfig`: Configure boot delay, retry, and refresh intervals
- `autoNATv2Options`: Configure AutoNAT v2 server behavior (e.g., `allowPrivateAddrs()`)

## References

- **AmbientAutoNATv2:** `lib/p2p/host/autonat/ambient_autonat_v2.dart`
- **AutoNAT v2:** `lib/p2p/protocol/autonatv2/`
- **Circuit Relay v2:** `lib/p2p/host/autorelay/`, `lib/p2p/protocol/circuitv2/`
- **Configuration:** `lib/config/config.dart`, `lib/p2p/host/autonat/ambient_config.dart`
- **Tests:** `test/p2p/host/autorelay_integration_test.dart`, `test/p2p/host/autonat/ambient_autonat_v2_test.dart`
- **Docker Tests:** `test/integration/holepunch_network/`
- **Container Example:** `test/integration/holepunch_network/containers/dart-peer/peer_main.dart`
- **Spec:** [Circuit Relay v2 Specification](https://github.com/libp2p/specs/blob/master/relay/circuit-v2.md)
