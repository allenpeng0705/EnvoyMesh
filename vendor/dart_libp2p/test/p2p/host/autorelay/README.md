# AutoRelay Unit Tests

This directory contains unit tests for the AutoRelay client functionality in dart-libp2p.

## Test Structure

```
test/p2p/host/autorelay/
├── README.md                           # This file
├── autorelay_test.dart                # Tests for AutoRelay class
├── autorelay_test.mocks.dart          # Generated mocks
├── relay_finder_test.dart             # Tests for RelayFinder
└── relay_finder_test.mocks.dart       # Generated mocks
```

## What These Tests Cover

### `relay_finder_test.dart`
Tests the core circuit relay address construction logic:

- **Circuit Address Construction**: Verifies that relay addresses are properly formatted
  - Format: `/ip4/.../tcp/.../p2p/RELAY_ID/p2p-circuit`
- **Multiple Relay Handling**: Tests with multiple relay connections
- **Address Caching**: Verifies efficient caching to avoid excessive lookups
- **Relay Candidate Selection**: Tests filtering and selection logic
- **Reservation Management**: Tests reservation expiration tracking
- **Edge Cases**: Empty relay lists, malformed addresses, etc.

### `autorelay_test.dart`
Tests the AutoRelay service integration:

- **Initialization**: Proper AutoRelay and RelayFinder setup
- **Address Advertisement**: Emitting address update events
- **Reachability Changes**: Handling private/public/unknown transitions
- **Lifecycle Management**: Start/stop behavior
- **Configuration**: Custom config handling
- **Event Bus Integration**: Subscribing and emitting events
- **Edge Cases**: Empty addresses, null configs, errors

## Running the Tests

### Run all AutoRelay tests:
```bash
dart test test/p2p/host/autorelay/
```

### Run specific test file:
```bash
# Test circuit address construction
dart test test/p2p/host/autorelay/relay_finder_test.dart

# Test AutoRelay integration
dart test test/p2p/host/autorelay/autorelay_test.dart
```

### Run with verbose output:
```bash
dart test test/p2p/host/autorelay/ --reporter=expanded
```

## Generating Mocks

If you modify the `@GenerateMocks` annotations, regenerate mocks:

```bash
dart run build_runner build --delete-conflicting-outputs
```

## Current Test Status

⚠️ **Important**: These tests currently verify the **specification** of how AutoRelay should work, but the actual implementation needs to be integrated into `BasicHost`.

### What's Tested:
- ✅ Circuit address format and construction logic
- ✅ AutoRelay event handling and lifecycle
- ✅ RelayFinder address management
- ✅ Configuration and error handling

### What's NOT Yet Integrated:
- ❌ AutoRelay service is not started in `BasicHost.start()`
- ❌ Circuit addresses are not automatically advertised
- ❌ `CircuitV2Client` is not registered as a transport

## Integration Test Failure

Your integration test in `test/integration/holepunch_network/holepunch_network_integration_test.dart` currently fails at:

```
⚠️  Peer A does not advertise circuit relay addresses
   Expected format: /ip4/.../tcp/.../p2p/RELAY_ID/p2p-circuit
   Actual addresses: [/ip4/192.168.1.100/tcp/4001, /ip4/10.10.0.2/tcp/4001]
```

This is **expected** because the AutoRelay service needs to be integrated into BasicHost.

## Next Steps to Fix the Integration Test

1. **Integrate AutoRelay in `BasicHost`** (see `lib/p2p/host/basic/basic_host.dart`):
   ```dart
   // In BasicHost.start() - around line 318
   if (_config.enableRelay && reachability == Reachability.private) {
     _autoRelay = AutoRelay(this, _upgrader, userConfig: _config.autoRelayConfig);
     await _autoRelay.start();
   }
   ```

2. **Register `CircuitV2Client` as a transport** (in `BasicHost` or `Swarm`):
   ```dart
   final circuitClient = CircuitV2Client(
     host: this,
     upgrader: upgrader,
     connManager: connManager,
   );
   await circuitClient.start();
   
   // Add to transports list in Swarm
   transports: [
     TCPTransport(...),
     circuitClient,  // Add circuit transport
   ],
   ```

3. **Update `BasicHost.addrs` to include circuit addresses**:
   - Subscribe to `EvtAutoRelayAddrsUpdated` events
   - Include circuit addresses in the advertised address list

4. **Run the integration test again**:
   ```bash
   dart test test/integration/holepunch_network/holepunch_network_integration_test.dart --plain-name "Circuit Relay"
   ```

## Test Patterns Used

These tests follow existing patterns from:
- `test/protocol/holepunch/` - Protocol-level testing
- `test/p2p/host/resource_manager/` - Host component testing
- Using Mockito for dependency injection
- Using `@GenerateMocks` for clean mock generation

## Additional Resources

- Circuit Relay v2 Spec: https://github.com/libp2p/specs/blob/master/relay/circuit-v2.md
- Go implementation: https://github.com/libp2p/go-libp2p/tree/master/p2p/host/autorelay
- Related tests in other directories:
  - `test/protocol/circuitv2/client/` - CircuitV2Client tests
  - `test/p2p/host/relaysvc/` - RelayManager tests
