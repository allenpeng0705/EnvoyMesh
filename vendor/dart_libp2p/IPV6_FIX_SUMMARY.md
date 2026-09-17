# IPv6 Support Fixes for dart-libp2p

## Summary
Fixed critical IPv6 support issues in dart-libp2p that prevented IPv6 multiaddrs from being used for dialing peers.

## Issues Found

### Issue 1: UDX Transport Hardcoded IPv4 Protocol
**Location**: `lib/p2p/transport/udx_transport.dart`

When binding to addresses, the transport was hardcoding the protocol to `ip4` even when binding to IPv6 addresses:

```dart
// BEFORE (Lines 166, 229)
final boundMa = MultiAddr('/ip4/${rawSocket.address.address}/udp/${rawSocket.port}/udx');
```

**Fix**: Detect the address type and use the appropriate protocol:

```dart
// AFTER
final protocol = rawSocket.address.type == InternetAddressType.IPv6 ? 'ip6' : 'ip4';
final boundMa = MultiAddr('/$protocol/${rawSocket.address.address}/udp/${rawSocket.port}/udx');
```

### Issue 2: MultiAddr valueForProtocol Returns Empty String Instead of Null
**Location**: `lib/core/multiaddr.dart` line 150-156

When a protocol wasn't found, `valueForProtocol` returned an empty string `''` instead of `null`. This caused the `??` fallback operator to fail when extracting host addresses:

```dart
// In udx_transport.dart line 66
final host = addr.valueForProtocol('ip4') ?? addr.valueForProtocol('ip6');
// When no ip4 existed, valueForProtocol('ip4') returned '', not null
// So host was set to '' instead of falling through to check ip6
```

**Root Cause**: The `firstWhere` orElse clause returned `(Protocols.ip4, '')` which then matched the protocol check.

**Fix**: Changed to use try-catch and return null for both missing protocols and empty values:

```dart
String? valueForProtocol(String protocol) {
  try {
    final component = _components.firstWhere((c) => c.$1.name == protocol);
    // Return null for empty string values (protocols with size 0)
    return component.$2.isEmpty ? null : component.$2;
  } catch (e) {
    // Protocol not found
    return null;
  }
}
```

### Issue 3: IPv6 Zone Identifiers Not Stripped During Parsing
**Location**: `lib/core/multiaddr.dart` line 46-54

IPv6 addresses with zone identifiers (e.g., `fe80::1%eth0`) were not being stripped during parsing, only during encoding.

**Fix**: Strip zone identifiers during parsing:

```dart
var value = parts[i];

// Strip zone identifier from IPv6 addresses (e.g., fe80::1%eth0 -> fe80::1)
if (protocolName == 'ip6') {
  value = value.split('%')[0];
}
```

### Issue 4: MultiAddr toString() Used Cached String
**Location**: `lib/core/multiaddr.dart`

The `_addr` field stored the original string, so when we modified components (like stripping zone identifiers), the string representation didn't match.

**Fix**: Removed `_addr` field and reconstruct the string from components in `toString()`:

```dart
@override
String toString() {
  final sb = StringBuffer();
  for (final (protocol, value) in _components) {
    sb.write('/${protocol.name}');
    if (protocol.size != 0) {
      sb.write('/$value');
    }
  }
  return sb.toString();
}
```

## Tests Added

### Comprehensive MultiAddr Tests
**File**: `test/multiaddr/multiaddr_test.dart`

Added 23 comprehensive tests covering:
- IPv4 parsing and encoding
- IPv6 parsing with various formats:
  - Compressed notation (`::1`, `2001:db8::1`)
  - Full notation (`2001:0db8:0000:0000:0000:0000:0000:0001`)
  - Single-digit segments (`2400:6180:0:d2:0:2:8351:9000`)
- Zone identifier stripping
- Roundtrip encoding/decoding
- Component access

### IPv6 Transport Tests
**File**: `test/transport/udx_transport_ipv6_test.dart`

Tests to verify:
- IPv6 address extraction from multiaddrs
- UDX transport can dial IPv6 addresses  
- Host extraction works correctly with IPv6

### IPv6 Address Parsing Tests
**File**: `dart-udx/test/ipv6_address_test.dart`

Verified that Dart's `InternetAddress` class can parse IPv6 addresses correctly.

## Result

IPv6 multiaddrs now work correctly:

```dart
// This now works!
final addr = MultiAddr('/ip6/2400:6180:0:d2:0:2:8351:9000/udp/55222/udx/p2p/12D3...');
final host = addr.valueForProtocol('ip6');  // Returns '2400:6180:0:d2:0:2:8351:9000'
await transport.dial(addr);  // Successfully extracts and uses IPv6 address
```

## Testing

All tests pass:
- ✅ 23/23 multiaddr tests
- ✅ 6/6 InternetAddress IPv6 tests  
- ✅ IPv6 dial attempts work (extract address correctly)

## Impact

- **Ricochet servers** can now advertise IPv6 listen addresses
- **Overtop clients** can connect to IPv6 bootstrap peers
- **Full dual-stack support** (IPv4 + IPv6) is now functional

