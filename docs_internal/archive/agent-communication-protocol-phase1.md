# EnvoyMesh Communication Protocol

## Overview

EnvoyMesh is a **P2P Human Network** - humans connect directly to each other via their nodes. AI/Agents come later (Phase 2).

```
┌─────────────────────────────────────────────────────────────┐
│                      EnvoyMesh P2P Network                   │
│                                                              │
│   Human A ◄═══════════► Human B ◄═══════════► Human C        │
│       │                    │                    │             │
│     Node A               Node B               Node C         │
│     (App A)              (App B)              (App C)        │
│                                                              │
│   Features:                                                  │
│   - Connection establishment (hello + profile review)        │
│   - Search for friends                                      │
│   - Chat                                                    │
│   - Data sharing                                            │
└─────────────────────────────────────────────────────────────┘
```

## Phase 1: Core Features (No AI)

1. **Connection** - Establish trust between two strangers
2. **Chat** - Human-to-human text messaging
3. **Share** - File/data sharing with sensitivity levels
4. **Search** - Find friends by interests/profile

Phase 2 will add AI agents as sidekicks to each human.

## Design Principles

1. **Humans are principals** - Each node represents one human
2. **Consent required** - Can't message someone without hello.accept
3. **Profile-first hello** - See who wants to connect before accepting
4. **Searchable by interest** - Peers can discover each other by interests

---

## 1. Hello Protocol (Connection Establishment)

### Flow: Hello with Profile Review

```
Node A (stranger) ──────────────────────────────────► Node B
    │                                                  │
    │─── hello.request ─────────────────────────────► │
    │     senderDisplayName: "Alice"                    │
    │     senderProfile: {                             │
    │       displayName: "Alice",                       │
    │       bio: "Music lover, blues enthusiast",      │
    │       interests: ["blues", "jazz", "guitar"],    │
    │       whatShares: ["music", "playlists", "gigs"] │
    │     }                                             │
    │     message: "Hi! We share music taste -        │
    │               check out some blues artists?"     │
    │                                                  │
    │                           Node B sees popup:      │
    │                           ┌────────────────────┐ │
    │                           │ "Alice" wants to   │ │
    │                           │ connect with you   │ │
    │                           │                    │ │
    │                           │ Profile:           │ │
    │                           │ Bio: Music lover   │ │
    │                           │ Interests: blues  │ │
    │                           │                    │ │
    │                           │ "Hi! We share      │ │
    │                           │ music taste..."    │ │
    │                           │                    │ │
    │                           │ [Accept] [Decline] │ │
    │                           │      [Block]        │ │
    │                           └────────────────────┘ │
    │                                                  │
    │◄─── hello.response (accept/decline/block) ──────
    │
    = BONDED (if accept) =
```

### Hello Request (`hello.request`)

```typescript
interface HelloRequest {
  version: "0.1";
  senderNodeId: string;        // This node's peerId
  senderOwnerId: string;        // Owner's ID

  senderProfile: {
    displayName: string;        // Required - who you are
    bio?: string;              // Optional - tell them about yourself
    interests: string[];       // What you care about
    whatShares: string[];      // What you're willing to share
    avatarUrl?: string;        // Optional avatar
  };

  message: string;            // Personal note (max 500 chars)
  timestamp: string;           // ISO 8601
}
```

### Hello Response (`hello.response`)

```typescript
interface HelloResponse {
  version: "0.1";
  inReplyTo: string;           // messageId of the hello.request

  decision: "accept" | "decline" | "block";

  // If declining, optional reason
  declineReason?: string;     // "not interested", "too busy", etc.

  // If blocking, sender is added to blocklist
  blocklistNote?: string;     // Optional note for self

  timestamp: string;
}
```

### Blocklist Behavior

- Blocked peers cannot send hello.requests to you again
- Blocked peers cannot see your profile in search
- You can unblock someone later

---

## 2. Search Friends

### Flow: Search by Interest

```
Human A → App A: "Find people interested in blues"

App A → relay.lookup:
  query: { interests: ["blues"] }
  returns: [list of matching peers with profiles]

Human A sees results:
┌─────────────────────────────────────────────┐
│ Search: "blues"                             │
├─────────────────────────────────────────────┤
│ Alice                                       │
│ Music lover, blues enthusiast               │
│ Interests: blues, jazz, guitar              │
│ [View Profile] [Send Hello]                 │
├─────────────────────────────────────────────┤
│ Bob                                         │
│ DJ, vinyl collector                         │
│ Interests: blues, rock, electronic          │
│ [View Profile] [Send Hello]                 │
└─────────────────────────────────────────────┘
```

### Search Implementation

Uses existing `relay.lookup` mechanism:
- Each node advertises interests in their profile
- `relay.lookup` filters by `interests` array
- Returns peer display names, bios, interests
- **Note:** Only nodes opted-in to discovery appear in search

### Profile Visibility Levels

```typescript
enum ProfileVisibility {
  PUBLIC = "public",      // Appears in search, anyone can hello
  CONTACTS = "contacts",  // Only bonded friends can see full profile
  PRIVATE = "private",    // Never appears in search
}
```

---

## 3. Chat Protocol

### After Bond: Free-form Chat

Once `hello.accept` completes, both nodes are bonded and can chat freely.

```
Human A ──► Node A ──► Node B ──► Human B
     │              chat.message              │
     ◄───────────── chat.message ◄────────────
```

### Chat Message (`chat.message`)

```typescript
interface ChatMessage {
  version: "0.1";
  messageId: string;           // UUID
  inReplyTo?: string;         // For threading

  sender: {
    nodeId: string;
    displayName: string;
  };

  recipient: {
    nodeId: string;
  };

  content: {
    text: string;             // Max 10,000 chars
    attachments?: Attachment[];
  };

  metadata: {
    timestamp: string;
    deliveryReceipt?: "sent" | "delivered" | "read";
    // Future: encryption, reactions, edits
  };

  signature: string;          // Proof this is from sender
}
```

### Attachment

```typescript
interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sensitivity: "public" | "friends" | "private";
  // Content sent separately via data transfer
}
```

---

## 4. Data Sharing

### File Sharing Flow

```
Human A → App A: "Share this playlist with Alice"

App A:
  1. Asks for sensitivity level: [Public] [Friends] [Private]
  2. Selects "Friends" (bonded only)
  3. Creates share offer
  4. Sends to Alice via data transfer

App A ────► App B:
  share.offer {
    what: "Blues Playlist 2024",
    type: "playlist",
    sensitivity: "friends",
    preview: "10 songs, 45 min"
  }

App B ──► Human B:
  "Alice shared 'Blues Playlist 2024' (friends-only)
   [Preview] [Accept & Save] [Decline]"
```

### Sensitivity Levels

| Level | Who can access |
|-------|----------------|
| `public` | Anyone on the mesh |
| `friends` | Bonded contacts only |
| `private` | Only on your own devices |

---

## 5. Node Profile

Each node has a profile that is shown during hello and searchable.

```typescript
interface NodeProfile {
  version: "0.1";
  ownerId: string;
  displayName: string;           // Required, shown in hello

  // For display in hello request
  bio?: string;                 // Short bio (max 500 chars)
  interests: string[];          // Searchable interests
  whatShares: string[];         // What you're willing to share

  // Avatar
  avatarUrl?: string;

  // Discovery settings
  profileVisibility: ProfileVisibility;

  // Connection settings
  acceptHelloFrom: "anyone" | "contacts" | "referrals";

  // Capabilities
  supportsVoice: boolean;       // Future
  supportsVideo: boolean;       // Future
}
```

---

## 6. Message Envelope (Generic)

All messages use a common envelope:

```typescript
interface EnvoyEnvelope {
  version: "envoy/0.1.0";
  messageId: string;            // UUID
  inReplyTo?: string;           // Correlation ID

  sender: {
    nodeId: string;
    ownerId: string;
    displayName: string;
  };

  recipient: {
    nodeId: string;
    ownerId?: string;
  };

  intent: string;               // "hello.request" | "chat.message" | "share.offer" | etc.

  payload: unknown;             // Intent-specific data

  timestamp: string;            // ISO 8601
  signature: string;            // Signed by sender's device key
}
```

---

## 7. Connection States

```
         ┌─────────────────────────────────────────┐
         │                                         │
         ▼                                         │
    STRANGER ────hello.request───► PENDING ──┐    │
         ▲                                 │       │
         │                                 │       │
         │            hello.decline/       │       │
         │              block              │       │
         │                                 ▼       │
         │                              REJECTED    │
         │                                 │       │
         │                                 │       │
         │            hello.accept         │       │
         │              ───────►            │       │
         │                                 │       │
         └─────────────────────────────── BONDED ──┘
                                           ▲
                                           │
                                           │
                                     (future: REFERRAL)
```

### State Persistence

- **Bonded** - Stored in local trust store, survives restarts
- **Rejected** - Peer can try again later with a new hello.request
- **Blocked** - Never receive hello.requests from this peer again

---

## 8. Bond Maintenance

### Heartbeat

Bonded peers send periodic `signal` messages to confirm connection:

```typescript
interface HeartbeatSignal {
  type: "heartbeat";
  bondId: string;            // Which bond this heartbeat is for
  status: "online" | "away" | "busy";
  lastSeenMessageId?: string;
}
```

### Bond Revocation

Either peer can break the bond:

```typescript
interface BondRevoke {
  type: "bond.revoke";
  bondId: string;
  reason?: string;
  timestamp: string;
}
```

After revoke, both nodes return to STRANGER state.

---

## Phase 2: AI Agents (Future)

Once Phase 1 is stable, AI agents are added:

- Each human has an AI agent sidekick
- Agents can send `agent.query`, `agent.propose`, `agent.delegate` messages
- Agents help draft messages, manage tasks, handle routine queries
- Humans set policies for what agents can do autonomously

The core P2P network, chat, and sharing remain the same - just adding an AI layer on top.

---

## Summary

**Phase 1 Focus:**
- Simple hello + profile review connection flow
- Human-to-human chat with delivery receipts
- File/data sharing with sensitivity levels
- Search by interests

**Key Design Decisions:**
- Hello requires profile review before accepting (not silent auto-connect)
- Search is opt-in via profile visibility setting
- Bonded = trusted, can chat freely
- Sensitivity levels control who can access shared data

This gives us a functional P2P social network without the complexity of AI involvement.