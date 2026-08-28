# Application-Transport Separation Design

## Problem

Currently `apps/node/src/index.ts` (~1500 lines) mixes transport and application concerns:

```
┌──────────────────────────────────────────────────────────────┐
│                     apps/node/src/index.ts                     │
├──────────────────────────────────────────────────────────────┤
│  Transport Layer (should be isolated)                         │
│  - libp2p setup and lifecycle                                 │
│  - Relay connection management                                │
│  - Circuit dialing                                            │
│  - Peer discovery (mDNS, DHT)                                 │
│  - Message envelope handling                                   │
│  - Signature verification                                     │
├──────────────────────────────────────────────────────────────┤
│  Application Layer (should be isolated)                       │
│  - Sending/receiving chat messages                            │
│  - Hello request/response workflow                           │
│  - Bond management                                            │
│  - Task delegation                                            │
│  - Search/discovery queries                                  │
├──────────────────────────────────────────────────────────────┤
│  Business Logic                                               │
│  - Trust relationships                                        │
│  - Human profiles                                             │
│  - Chat threads                                               │
└──────────────────────────────────────────────────────────────┘
```

## Goal

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│                  apps/social (or apps/client)                │
│                                                              │
│  - React UI components                                       │
│  - State management (Zustand/Redux/Context)                  │
│  - Business logic                                            │
│  - Does NOT import from @envoymesh/network                    │
└──────────────────────┬──────────────────────────────────────┘
                       │ NodeService API (well-defined)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     Transport Layer                          │
│              apps/node + packages/network                    │
│                                                              │
│  - libp2p networking                                         │
│  - Relay circuits                                            │
│  - Peer discovery                                            │
│  - Message envelopes & signatures                            │
│  - Does NOT know what messages mean                         │
└─────────────────────────────────────────────────────────────┘
```

## Design: NodeService Interface

### Location
`packages/api/src/node-service.ts` (new package)

### Core Interface

```typescript
// packages/api/src/node-service.ts

export interface NodeProfile {
  owner: OwnerIdentity;
  device: DeviceIdentity;
  deviceCertificate: DeviceCertificate;
}

export interface HumanProfile {
  ownerId: string;
  displayName: string;           // Required - shown in UI
  username: string;             // Required - used for DHT discovery (3-30 chars, alphanumeric + underscore)
  bio?: string;
  gender?: string;
  hobbies?: string[];
  knowledge?: string[];
  profileVisibility: "public" | "private";  // "public" advertises to DHT for discovery
  updatedAt: string;
  signature: string;
}

export interface HelloProfile {
  displayName: string;        // Required - who you are
  username: string;          // Required - used for DHT discovery
  bio?: string;
  interests: string[];
  whatShares: string[];
  avatarUrl?: string;
}

export interface HelloRequest {
  messageId: string;
  sender: {
    nodeId: string;
    ownerId: string;
    displayName: string;
  };
  profile: HelloProfile;
  message: string;
  timestamp: string;
}

export interface HelloResponse {
  messageId: string;
  inReplyTo: string;
  decision: "accept" | "decline" | "block";
  declineReason?: string;
  timestamp: string;
}

export interface ChatMessage {
  messageId: string;
  inReplyTo?: string;
  sender: {
    nodeId: string;
    displayName: string;
  };
  recipient: {
    nodeId: string;
  };
  content: {
    text: string;
    attachments?: Attachment[];
  };
  metadata: {
    timestamp: string;
    deliveryReceipt?: "sent" | "delivered" | "read";
  };
  signature: string;
}

export interface Attachment {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sensitivity: "public" | "friends" | "private";
}

export interface BondRecord {
  peerOwnerId: string;
  displayName?: string;
  level: "direct" | "referred" | "public" | "blocked";
  createdAt: string;
  note?: string;
}

export interface PeerSearchResult {
  nodeId: string;
  ownerId: string;
  displayName: string;
  username?: string;           // If set, can be discovered via DHT username search
  bio?: string;
  interests: string[];
  profileVisibility: "public" | "private";
}

export interface SearchQuery {
  peerId?: string;              // Direct peer ID lookup
  interests?: string[];         // DHT topic-based discovery
  username?: string;            // Username-based discovery (DHT topic: username:<name>)
  queryText?: string;
  maxResults?: number;
}

// ============================================
// NodeService Interface
// ============================================

export interface NodeServiceEvents {
  // Connection events
  "hello:request": HelloRequest;
  "hello:response": HelloResponse;
  "bond:established": { peerOwnerId: string; displayName?: string };
  "bond:revoked": { peerOwnerId: string };
  "bond:blocked": { peerOwnerId: string };

  // Chat events
  "chat:message": ChatMessage;
  "chat:delivered": { messageId: string; timestamp: string };
  "chat:read": { messageId: string; timestamp: string };

  // Peer discovery
  "peer:discovered": PeerSearchResult;
  "peer:lost": { nodeId: string };

  // Connection state
  "node:online": { nodeId: string; multiaddrs: string[] };
  "node:offline": { nodeId: string };
}

export interface NodeService {
  // ----- Identity -----

  /**
   * Get current node's identity and profile
   */
  getProfile(): NodeProfile;

  /**
   * Get current node's human profile
   */
  getHumanProfile(): Promise<HumanProfile | undefined>;

  /**
   * Update human profile (signs with owner key)
   */
  updateHumanProfile(profile: Partial<HumanProfile>): Promise<HumanProfile>;

  // ----- Bond Management -----

  /**
   * Send a hello request to establish connection
   */
  sendHello(targetOwnerId: string, profile: HelloProfile, message: string): Promise<HelloResponse>;

  /**
   * Accept a pending hello request
   */
  acceptHello(messageId: string): Promise<void>;

  /**
   * Decline a pending hello request
   */
  declineHello(messageId: string, reason?: string): Promise<void>;

  /**
   * Block a peer (permanent)
   */
  blockPeer(peerOwnerId: string): Promise<void>;

  /**
   * Unblock a peer
   */
  unblockPeer(peerOwnerId: string): Promise<void>;

  /**
   * Revoke (remove) a bond
   */
  revokeBond(peerOwnerId: string): Promise<void>;

  /**
   * Get all bonds (trusted contacts)
   */
  getBonds(): Promise<BondRecord[]>;

  // ----- Messaging -----

  /**
   * Send a chat message to a bonded peer
   */
  sendChat(targetOwnerId: string, text: string): Promise<void>;

  /**
   * Mark messages as read
   */
  markRead(targetOwnerId: string, upToMessageId?: string): Promise<void>;

  // ----- Search / Discovery -----

  /**
   * Search for peers by interests or text
   */
  searchPeers(query: SearchQuery): Promise<PeerSearchResult[]>;

  // ----- File Sharing -----

  /**
   * Offer a file to a peer
   */
  shareFile(
    targetOwnerId: string,
    file: { path: string; sensitivity: Attachment["sensitivity"] },
  ): Promise<void>;

  /**
   * Accept incoming file share
   */
  acceptShare(shareId: string, savePath: string): Promise<void>;

  /**
   * Decline incoming file share
   */
  declineShare(shareId: string): Promise<void>;

  // ----- Event Subscription -----

  /**
   * Subscribe to events
   */
  on<K extends keyof NodeServiceEvents>(event: K, handler: (data: NodeServiceEvents[K]) => void): () => void;

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus;
}

export interface ConnectionStatus {
  online: boolean;
  peerId: string;
  multiaddrs: string[];
  connectedRelays: string[];
  bondedPeers: number;
}
```

## Implementation Architecture

### Package Structure

```
packages/
  api/                    # NEW: Public API for applications
    src/
      node-service.ts     # NodeService interface
      index.ts

  network/                # Existing: libp2p wrapper
    src/
      libp2p-key.ts       # Existing
      index.ts            # Existing

  protocol/               # Existing: Message schemas
    src/
      index.ts            # Existing (RelayCheckinPayload, etc.)
```

### Implementation in Node

```
apps/node/src/
  index.ts                # Main entry, sets up libp2p
  node-service-impl.ts    # NEW: Implements NodeService interface
  transport/              # NEW: (reorganize existing code)
    relay-manager.ts
    peer-discovery.ts
    circuit-dialer.ts
  handlers/               # NEW: Intent handlers
    hello-handler.ts
    chat-handler.ts
    bond-handler.ts
```

### App Layer

```
apps/social/              # NEW: Social application
  src/
    App.tsx               # Main React app
    components/
      ContactList.tsx
      ChatWindow.tsx
      HelloRequestCard.tsx
      SearchPanel.tsx
      ProfileEditor.tsx
    hooks/
      useNodeService.ts   # Connects to NodeService
      useContacts.ts
      useMessages.ts
    store/
      index.ts            # Zustand store
    main.tsx
```

## Key Principles

### 1. App Layer Never Imports Transport

```typescript
// GOOD: App imports from @envoymesh/api
import { NodeService, type HelloRequest } from "@envoymesh/api";

function HelloRequestPopup({ request }: { request: HelloRequest }) {
  const nodeService = useNodeService();
  const handleAccept = () => nodeService.acceptHello(request.messageId);
  // ...
}

// BAD: App imports transport internals
import { relayManager } from "@envoymesh/node/src/relay-manager"; // NO!
```

### 2. Well-Defined Event Contract

```typescript
// NodeService events are the ONLY way app receives updates
nodeService.on("hello:request", (request) => {
  // request is typed, app knows shape
});

nodeService.on("chat:message", (message) => {
  // message is typed, app knows shape
});
```

### 3. Async/Promise-Based API

```typescript
// All operations return promises
const response = await nodeService.sendHello(targetOwnerId, profile, message);
await nodeService.sendChat(targetOwnerId, "Hello!");
const bonds = await nodeService.getBonds();
```

### 4. No Message Envelopes in App API

```typescript
// App doesn't deal with EnvoyEnvelope
const msg = await nodeService.sendChat(targetOwnerId, "Hello!");

// App receives parsed, typed messages
nodeService.on("chat:message", (msg) => {
  // msg is ChatMessage, not raw EnvoyEnvelope
  console.log(msg.content.text);
});
```

## Migration Path

### Phase 1: Extract Interface (No Behavior Changes)
1. Create `packages/api/src/node-service.ts` with interface definitions
2. Extract types from existing code (HelloRequest, ChatMessage, etc.)
3. Make existing `apps/node/src/index.ts` implement `NodeService` behind a getter
4. Verify all existing handlers still work

### Phase 2: Create App Shell
1. Create `apps/social` with React + Vite
2. Build minimal shell that connects to existing Node
3. Wire up one feature (e.g., view bonds)

### Phase 3: Extract Handlers
1. Move intent handlers from `index.ts` to `handlers/*.ts`
2. Keep handlers in node, called by NodeService implementation
3. App calls `nodeService.sendChat()` which calls chat handler

### Phase 4: New Features in App Layer
1. Add UI state management in app
2. Move business logic (thread building, etc.) to app where appropriate
3. App becomes the UI, node becomes the transport

## Example Code Flow

### Sending a Chat Message

```
User types message in React UI
         │
         ▼
App.tsx calls nodeService.sendChat("Alice", "Hello!")
         │
         ▼
NodeServiceImpl.sendChat() creates EnvoyEnvelope
         │
         ▼
Transport layer sends via libp2p
         │
         ▼
Remote node receives, routes to chat handler
         │
         ▼
Remote node sends back delivery receipt
         │
         ▼
NodeServiceImpl receives, emits "chat:delivered" event
         │
         ▼
App.tsx shows "delivered" status
```

### Receiving a Hello Request

```
Remote node sends hello.request envelope
         │
         ▼
NodeServiceImpl.helloHandler() processes
         │
         ▼
NodeServiceImpl emits "hello:request" event
         │
         ▼
App.tsx receives via nodeService.on("hello:request", ...)
         │
         ▼
React renders HelloRequestCard component
         │
         ▼
User clicks "Accept"
         │
         ▼
App.tsx calls nodeService.acceptHello(messageId)
         │
         ▼
NodeServiceImpl processes accept, sends hello.response
         │
         ▼
Bond established, "bond:established" event emitted
```

## Benefits

1. **Testable**: App logic can be tested without P2P network
2. **Portable**: Same app code works with different transports
3. **Clean**: Developers working on UI don't need P2P knowledge
4. **Upgradeable**: Transport can be swapped without app changes
5. **Mobile-ready**: iOS/Android can implement same NodeService interface

## Next Steps

1. Create `packages/api` with `node-service.ts` interface
2. Add implementation to `apps/node/src/node-service-impl.ts`
3. Create `apps/social` with React + Vite
4. Build UI components incrementally