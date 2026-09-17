# Store-and-Forward Architecture

## Overview

The Store-and-Forward (S&F) architecture for dart-libp2p provides reliable message delivery in peer-to-peer networks by combining direct peer connections with intermediary storage servers. This architecture is inspired by email's MX (Mail eXchange) server model, where peers can designate preferred S&F servers that store messages when they're offline.

## Goals

- **Reliable Delivery**: Ensure messages reach recipients even when they're temporarily offline
- **Decentralized Service**: Multiple S&F servers in the network, no single point of failure
- **Smart Routing**: Automatically choose between direct connection and S&F storage
- **MX-like Discovery**: Peers publish their preferred S&F servers with priority rankings
- **Presence Awareness**: Leverage circuit relay reservations for online/offline detection
- **Privacy-Preserving**: Protect peer presence and communication patterns

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    P2P Network with S&F                          │
│                                                                  │
│   Peer A ←──────→ S&F Server 1 ←──────→ Peer C                 │
│     ↓                  ↕                      ↓                  │
│     ↓             S&F Server 2 ←──────→ Peer D                 │
│     ↓                  ↕                                         │
│   Peer B ←──────→ S&F Server 3                                  │
│                                                                  │
│   Circuit Relay 1     Circuit Relay 2     Circuit Relay 3       │
│   (Presence info)     (Presence info)     (Presence info)       │
│                                                                  │
│   GossipSub mesh for service discovery & announcements          │
└─────────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. Service Discovery Layer

**Protocol**: GossipSub (via `dart_libp2p_pubsub`)

**Topics**:
- `/sf-network/services/announce` - S&F servers announce availability
- `/sf-network/services/heartbeat` - Periodic health checks
- `/sf-network/peer/preferences` - Peers publish their S&F preferences

**Purpose**: Decentralized discovery of S&F servers and peer preferences

**Example Announcement**:
```json
{
  "server_id": "12D3KooW...",
  "capabilities": ["store", "forward", "priority-queue"],
  "max_storage": "10GB",
  "retention_policy": "30d",
  "regions": ["us-east", "europe-west"],
  "uptime_score": 0.99,
  "timestamp": "2025-10-19T12:00:00Z"
}
```

**Example Peer Preferences** (MX-like):
```json
{
  "peer_id": "12D3KooW...",
  "sf_servers": [
    {"server_id": "12D3KooWServer1...", "priority": 10},
    {"server_id": "12D3KooWServer2...", "priority": 20},
    {"server_id": "12D3KooWServer3...", "priority": 30}
  ],
  "version": 1,
  "ttl": 3600,
  "timestamp": "2025-10-19T12:00:00Z"
}
```

### 2. Store-and-Forward Protocol

**Protocol ID**: `/sf-network/store-forward/1.0.0`

**Based on**: OBP (OverNode Binary Protocol) with S&F extensions

**Message Types**:

#### Storage Operations
- `storeMessage` (0x30) - Store message for recipient
- `storeAck` (0x31) - Acknowledge storage

#### Retrieval Operations
- `retrieveMessages` (0x32) - Retrieve pending messages
- `retrieveResp` (0x33) - Response with messages
- `markDelivered` (0x34) - Mark message as delivered
- `markDeliveredAck` (0x35) - Acknowledge delivery

#### Forwarding Operations
- `forwardMessage` (0x36) - Forward to another S&F server
- `forwardAck` (0x37) - Acknowledge forwarding

#### Management Operations
- `queryCapacity` (0x38) - Query server capacity
- `capacityResp` (0x39) - Capacity information
- `setPriority` (0x3A) - Set message priority
- `setExpiry` (0x3B) - Set message expiration

**Frame Structure**:
```
┌─────────────────────────────────────────────────────────────┐
│ OBP Header (16 bytes)                                       │
│   - Magic: "OVND"                                           │
│   - Version, Type, Flags, Reserved                          │
│   - Length, Stream ID                                       │
├─────────────────────────────────────────────────────────────┤
│ S&F Header (103 bytes):                                     │
│   - recipient_peer_id (38 bytes)                           │
│   - sender_peer_id (38 bytes)                              │
│   - message_id (UUID, 16 bytes)                            │
│   - priority (1 byte: 0=low, 1=normal, 2=high, 3=urgent)  │
│   - expiry_timestamp (8 bytes, unix ms)                    │
│   - hop_count (1 byte, max 10)                             │
│   - flags (1 byte: encrypted, signed, compress, etc.)      │
├─────────────────────────────────────────────────────────────┤
│ Payload (encrypted message data)                           │
└─────────────────────────────────────────────────────────────┘
```

### 3. Peer Preferences Protocol

**Protocol ID**: `/sf-network/preferences/1.0.0`

**Purpose**: Query and update peer S&F server preferences (MX-like lookups)

**Operations**:
- `queryPreferences(peer_id)` - Get peer's S&F server list
- `updatePreferences(preferences)` - Update own preferences
- `validateServer(server_id)` - Check if server is valid/available

**Storage Options**:
- **Option A**: GossipSub broadcast (simple, higher traffic)
- **Option B**: DHT-based storage (efficient, scalable)
- **Option C**: S&F servers as registries (centralized but fast)

**Recommended**: Hybrid approach using DHT with GossipSub for updates

### 4. Presence Detection via Relay Reservations

**Key Insight**: Circuit Relay v2 reservations provide natural presence indicators

**Protocol Extension**: `/sf-network/relay-query/1.0.0`

**Relay Query Operations**:
- `hasReservation(peer_id)` → boolean
- `getReservation(peer_id)` → ReservationInfo
- `getRelayStatus(peer_id)` → RelayStatus

**Presence Mapping**:
| Relay Reservation State | Presence Status | Action |
|------------------------|-----------------|--------|
| Active reservation (< 5min old) | **Online** | Try direct or relay circuit |
| Active reservation (5-30min old) | **Probably online** | Try relay circuit |
| Expired reservation | **Offline** | Use S&F storage |
| No reservation found | **Unknown/Offline** | Use S&F storage |

**Advantages**:
- ✅ Reuses existing infrastructure (no new presence system)
- ✅ Accurate liveness (reservation refresh = heartbeat)
- ✅ Actionable information (relay addresses available)
- ✅ Natural expiration handling (TTL-based)

## Message Flow Examples

### Example 1: Direct Delivery (Recipient Online)

```
1. Peer A wants to send to Peer B
   ↓
2. Query B's relay servers for active reservations
   → Relay R1 responds: B has active reservation
   → TTL remaining: 15 minutes
   ↓
3. Attempt direct connection
   → Open stream to B's advertised addresses
   → Success: Message delivered directly
   ↓
4. Update local cache: B is reachable directly
```

### Example 2: Store-and-Forward (Recipient Offline)

```
1. Peer A wants to send to Peer C
   ↓
2. Query C's relay servers for active reservations
   → No active reservations found
   → C is offline
   ↓
3. Query C's S&F server preferences (DHT or GossipSub)
   → Preference list: [Server1(priority=10), Server2(priority=20)]
   ↓
4. Connect to Server1 (highest priority)
   → Send STORE_MESSAGE with encrypted payload
   → Server1 responds: STORE_ACK with message_id
   ↓
5. Server1 stores message persistently
   → Waiting for C to come online
   ↓
6. C comes online later
   → C connects to Server1
   → Server1 detects C's relay reservation
   → Server1 pushes pending messages to C
   ↓
7. C acknowledges delivery
   → Sends MARK_DELIVERED
   → Server1 deletes message from storage
```

### Example 3: Failover to Next Priority Server

```
1. Peer A tries to send to Peer D via Server1
   → Connection to Server1 fails (timeout)
   ↓
2. Failover to Server2 (next priority)
   → Successfully connects to Server2
   → Stores message
   ↓
3. Server2 optionally forwards to Server3 for redundancy
   → Cross-server synchronization
   → Increases delivery reliability
```

## Connection Decision Algorithm

### Smart Routing Logic

```
Function: routeMessage(target: PeerId, message: Message, urgency: Level)

Step 1: Get target's configuration
  config = queryPeerConfig(target)  // From DHT or cache
  relays = config.relay_servers
  sfServers = config.sf_servers

Step 2: Check relay reservations (parallel queries)
  reservations = []
  for relay in relays:
    info = queryRelayReservation(relay, target)
    if info.has_reservation:
      reservations.add(info)

Step 3: Analyze and decide
  if reservations.isEmpty():
    return routeToSF(target, sfServers[0])  // Offline
  
  if urgency == URGENT:
    return parallelAttempt(direct, relay, sf)  // Try all
  
  bestReservation = reservations.sortByTTL().first()
  
  if bestReservation.ttl > 5min && bestReservation.has_direct_addr:
    return tryDirectFallbackRelay(target, bestReservation)
  
  if bestReservation.ttl > 1min:
    return useRelayCircuit(bestReservation)
  
  return routeToSF(target, sfServers[0])  // Be safe

Step 4: Execute with fallback
  try:
    if strategy == "direct":
      return attemptDirect(target, timeout=2s)
  catch:
    pass
  
  try:
    if strategy includes "relay":
      return attemptRelayCircuit(relay, target, timeout=5s)
  catch:
    pass
  
  // Final fallback
  return sendToSFServer(target, message, sfServers)
```

### Decision Matrix

| Reservation Status | Message Urgency | Direct Addr | Decision |
|-------------------|-----------------|-------------|----------|
| Active (< 5min) | Urgent | Yes | Try direct (2s) → relay → S&F |
| Active (< 5min) | Normal | Yes | Try direct (2s) → S&F |
| Active (< 5min) | Low | Yes | Relay circuit only |
| Active (< 5min) | Any | No | Relay circuit → S&F |
| Active (5-30min) | Any | Any | Relay circuit → S&F |
| Expired | Any | Any | S&F only |
| None found | Any | Any | S&F only |

## Service Registry Manager

### Tracking Available S&F Servers

```
Component: SFServiceRegistry

Responsibilities:
  - Subscribe to service announcements (GossipSub)
  - Maintain registry of available S&F servers
  - Monitor server health and availability
  - Provide server selection for peers

Data Structure:
  Map<PeerId, SFServerInfo> where:
    SFServerInfo {
      peerId: PeerId,
      capabilities: List<String>,
      maxStorage: int,
      retentionPolicy: Duration,
      regions: List<String>,
      uptimeScore: double,
      lastSeen: DateTime,
    }

Operations:
  - registerServer(announcement)
  - getSFServersForPeer(peer_id) → List<SFServerInfo>
  - selectBestServer(peer_id, criteria) → SFServerInfo
  - monitorHealth() → Remove stale servers
```

### MX-Like Server Resolution

```
Function: resolveSFServers(peer_id) → List<SFServerInfo>

1. Query peer's S&F preferences
   prefs = queryDHT(hash(peer_id + "/sf-prefs"))
   // Returns: [{server_id, priority}, ...]

2. Validate servers exist and are healthy
   validServers = []
   for pref in prefs:
     server = registry.get(pref.server_id)
     if server && server.isHealthy():
       validServers.add(server)

3. Sort by priority (lower = better, like MX)
   return validServers.sortBy(priority)

4. Return ordered list for failover
   // Client tries servers in order until success
```

## S&F Server Implementation

### Core Server Responsibilities

1. **Message Storage**
   - Persistent storage (SQLite, Isar, or similar)
   - Message expiration and cleanup
   - Priority queue management
   - Storage quota enforcement

2. **Presence Monitoring**
   - Track connected clients
   - Query relay reservations periodically
   - Maintain hot cache of online/offline states
   - Push-notify peers when they come online

3. **Message Forwarding**
   - Forward messages between S&F servers
   - Synchronize with peer's other S&F servers
   - Handle inter-server redundancy

4. **Service Announcement**
   - Broadcast availability via GossipSub
   - Advertise capabilities and resources
   - Provide health metrics

### Message Storage Schema

```
Table: sf_messages
  - id: UUID (primary key)
  - recipient_peer_id: String (indexed)
  - sender_peer_id: String
  - message_data: Blob (encrypted)
  - priority: Integer (0-3)
  - created_at: Timestamp
  - expires_at: Timestamp (indexed)
  - delivered: Boolean
  - hop_count: Integer
  - metadata: JSON

Indexes:
  - (recipient_peer_id, delivered, expires_at)
  - (expires_at) for cleanup
  - (priority, created_at) for queue ordering
```

### Relay-Aware S&F Server

```
Component: RelayAwareStorageManager

For each registered peer, maintain:
  peer_id → {
    known_relays: [R1, R2, R3],
    last_relay_check: timestamp,
    relay_status: {
      R1: {has_reservation: true, checked_at: timestamp},
      R2: {has_reservation: false, checked_at: timestamp},
    },
    derived_status: "online" | "offline" | "unknown",
    pending_message_count: int,
  }

When message arrives for Peer B:
  1. Check relay status cache (< 30s = fresh)
  2. If fresh && online → Attempt push via relay circuit
  3. If fresh && offline → Store for retrieval
  4. If stale → Re-query relays, then decide

Periodic tasks:
  - Every 30s: Batch query relays for all registered peers
  - Every 5m: Clean up expired messages
  - Every 1h: Compact storage
```

## Privacy Considerations

### Privacy Challenges

1. **Relay Enumeration**: Querying relays reveals interest in specific peers
2. **Online Status Leakage**: Anyone can query relay reservations
3. **Traffic Analysis**: Query patterns reveal social graphs
4. **S&F Server Surveillance**: S&F servers see who's messaging whom

### Privacy Protection Mechanisms

#### 1. Authenticated Relay Queries

```
Query Requirements:
  - Requester's peer ID (signed)
  - Proof of relationship (optional):
    • Shared group membership
    • Contact list inclusion
    • Previous message exchange
  - Rate limiting per requester
```

#### 2. Query Obfuscation

```
When querying for Peer B:
  - Include dummy queries for random peers X, Y, Z
  - Relay can't distinguish real from fake queries
  - k-anonymity for presence queries
```

#### 3. S&F as Privacy Proxy

```
Route relay queries through S&F servers:
  Peer A → S&F Server → Relay → Response
  
Advantages:
  - Relay doesn't know who's asking
  - S&F aggregates queries
  - Better privacy for individual peers
```

#### 4. Selective Presence Visibility

```
Presence Modes:
  - Public: Visible to all
  - Selective: Only to approved peers
  - Invisible: Online but no announcements
  - S&F-only: Force all messages through S&F
```

## Security Considerations

### Message Security

1. **End-to-End Encryption**: Payloads encrypted at sender, decrypted at recipient
2. **Message Signing**: Sender signs messages to prevent spoofing
3. **Authentication**: Verify sender identity via libp2p peer IDs
4. **Authorization**: S&F servers verify sender/recipient relationships

### Storage Security

1. **Encrypted Storage**: Messages stored encrypted on S&F servers
2. **Access Control**: Only recipient can retrieve messages
3. **TTL Enforcement**: Automatic expiration and deletion
4. **Storage Quotas**: Per-peer limits prevent abuse

### Network Security

1. **Rate Limiting**: Prevent spam and DoS attacks
2. **Reputation Systems**: Track sender behavior
3. **Blacklisting**: Block malicious peers
4. **Relay Authentication**: Verify relay server identities

## Performance Considerations

### Scalability

- **S&F Servers**: Horizontally scalable (multiple servers per network)
- **Relay Queries**: Parallel queries to multiple relays (sub-second)
- **Message Storage**: Efficient indexing for fast retrieval
- **GossipSub**: Handles 100-500 peers efficiently

### Latency

- **Direct Connection**: 50-200ms (optimal)
- **Relay Circuit**: 200-500ms (acceptable)
- **S&F Storage**: Seconds to hours (depends on recipient availability)
- **Relay Query**: 100-500ms per relay

### Bandwidth

- **GossipSub Overhead**: ~1-5 KB/s for announcements
- **Relay Queries**: ~1 KB per query
- **Message Storage**: Minimal (only when storing)
- **Retrieval**: Batch retrieval reduces overhead

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Extend OBP with S&F message types
- [ ] Implement SFServiceRegistry
- [ ] Basic GossipSub integration for announcements
- [ ] Simple in-memory storage

### Phase 2: Core S&F (Weeks 3-4)
- [ ] Implement message routing logic
- [ ] Add persistent storage (SQLite/Isar)
- [ ] Message expiry and cleanup
- [ ] Priority queue implementation

### Phase 3: Relay Integration (Weeks 5-6)
- [ ] Implement relay reservation queries
- [ ] Relay-aware presence detection
- [ ] Smart connection decision engine
- [ ] Failover logic

### Phase 4: MX-Like Discovery (Weeks 7-8)
- [ ] Implement preferences protocol
- [ ] DHT-based preference storage
- [ ] Priority/weight-based server selection
- [ ] Multi-server redundancy

### Phase 5: Advanced Features (Weeks 9-10)
- [ ] Message forwarding between S&F servers
- [ ] Encryption and signing
- [ ] Monitoring and metrics
- [ ] Privacy enhancements

## API Examples

### Client: Sending Messages

```dart
// Get S&F service
final sfService = host.getService<SFService>();

// Send message (automatically routes)
final result = await sfService.sendMessage(
  recipient: recipientPeerId,
  payload: utf8.encode('Hello, World!'),
  urgency: MessageUrgency.normal,
  options: SendOptions(
    preferDirect: true,
    maxRetries: 3,
    expiry: Duration(days: 7),
  ),
);

if (result.deliveredDirectly) {
  print('Message delivered in real-time');
} else if (result.storedAt != null) {
  print('Message stored at S&F server: ${result.storedAt}');
}
```

### Client: Configuring S&F Preferences

```dart
// Set preferred S&F servers (MX-like)
await sfService.setPreferences(
  SFPreferences(
    servers: [
      SFServerPreference(
        serverId: server1PeerId,
        priority: 10,  // Lower = higher priority
        weight: 50,    // For load balancing
      ),
      SFServerPreference(
        serverId: server2PeerId,
        priority: 20,
        weight: 50,
      ),
    ],
    ttl: Duration(hours: 24),
  ),
);

// Publish to network (DHT or GossipSub)
await sfService.publishPreferences();
```

### Server: Running an S&F Server

```dart
// Create S&F server
final sfServer = SFServer(
  host: host,
  config: SFServerConfig(
    maxStorage: 10 * 1024 * 1024 * 1024,  // 10 GB
    retentionPolicy: Duration(days: 30),
    regions: ['us-east', 'us-west'],
    enableForwarding: true,
  ),
);

// Start server
await sfServer.start();

// Announce availability
await sfServer.announceService();

// Listen for stored messages
sfServer.onMessageStored.listen((event) {
  print('Stored message ${event.messageId} for ${event.recipientId}');
});

// Listen for deliveries
sfServer.onMessageDelivered.listen((event) {
  print('Delivered message ${event.messageId} to ${event.recipientId}');
});
```

### Querying Presence via Relays

```dart
// Get presence manager
final presenceManager = sfService.presenceManager;

// Check if peer is online
final status = await presenceManager.checkPresence(targetPeerId);

if (status.isOnline) {
  print('Peer is online via relay: ${status.relayId}');
  print('TTL remaining: ${status.ttlRemaining}');
  
  // Try direct connection
  final stream = await host.newStream(
    targetPeerId,
    ['/my-protocol/1.0.0'],
  );
} else {
  print('Peer is offline, using S&F');
  await sfService.sendMessage(
    recipient: targetPeerId,
    payload: messageData,
  );
}
```

## Comparison to Email Architecture

| Email System | S&F P2P Network |
|-------------|-----------------|
| DNS MX records | DHT/GossipSub peer preferences |
| SMTP protocol | S&F Protocol (OBP-based) |
| Mail servers | S&F servers (P2P nodes) |
| MX priority values | S&F server priority + weight |
| Mailbox storage | Persistent message queue |
| Delivery attempts | Retry with server failover |
| Multiple MX records | Multiple S&F servers per peer |
| Direct delivery | Direct P2P connection |
| Store-and-forward | S&F server storage |
| IMAP/POP3 retrieval | Pull-based message retrieval |

## Integration with Existing Protocols

### GossipSub (dart_libp2p_pubsub)
- **Use**: Service announcements, peer preferences, network events
- **Integration**: Subscribe to S&F topics
- **Status**: Use existing package

### Circuit Relay v2 (dart-libp2p)
- **Use**: Presence detection via reservation queries
- **Integration**: Extend with query protocol
- **Status**: Extend existing implementation

### OBP (dart-libp2p)
- **Use**: Binary framing for S&F messages
- **Integration**: Add S&F message types
- **Status**: Extend existing protocol

### DHT (future)
- **Use**: Preference storage and lookups
- **Integration**: Store/retrieve S&F configurations
- **Status**: To be implemented or use external DHT

## Future Enhancements

1. **Cross-Network Federation**: S&F servers across different P2P networks
2. **Message Encryption Layers**: Additional encryption beyond transport
3. **Advanced Routing**: Machine learning for optimal server selection
4. **Blockchain Integration**: Proof-of-storage for accountability
5. **Economic Incentives**: Payment for S&F service provision
6. **Group Messaging**: Efficient multi-recipient S&F
7. **Message Threading**: Conversation and thread support
8. **Rich Metadata**: Attachments, media, structured data

## References

- [Circuit Relay v2 Specification](https://github.com/libp2p/specs/blob/master/relay/circuit-v2.md)
- [GossipSub Specification](https://github.com/libp2p/specs/blob/master/pubsub/gossipsub/README.md)
- [Email MX Records (RFC 5321)](https://www.rfc-editor.org/rfc/rfc5321)
- [XMPP Presence (RFC 6121)](https://www.rfc-editor.org/rfc/rfc6121)

## Contributing

Contributions to the S&F architecture are welcome! Please see the main project contributing guidelines.

## License

See the main project LICENSE file.

