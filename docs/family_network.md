# Family Network — Private Social Network on Your Home Computer

**Status:** Designed (2026-07-30)

Turn one EnvoyMesh home node into a **private family social network**. Your home computer becomes a personal server — family members pair their phones, get their own profiles, chat with each other, talk to AI, and share nothing with Big Tech.

No cloud. No subscription. No data leaving your home (except the LLM API calls you configure).

---

## 1. Vision

> **Your home computer is your family's private server.**

One EnvoyMesh home node runs on a desktop or laptop (or a Raspberry Pi). Each family member installs EnvoyGo on their phone, pairs with the home node, and gets:

- **Their own profile** — name, avatar, identity within the family
- **Their own AI assistant** — private conversations with EnvoyAI, Pi, and custom bots
- **Their own contacts** — auto-bonded with every other family member
- **Direct + group chat** — with family members AND external mesh peers
- **Push notifications** — messages reach their phone when they're away
- **Complete data isolation** — no family member sees another's private data

The home node owner (the person who set it up) manages profiles — create, rename, delete. Like adding user accounts on a shared family computer.

---

## 2. The analogy

| What it's like | How EnvoyMesh maps to it |
|---|---|
| **Netflix profiles** on one account | Each family member has a profile on one home node |
| **macOS user accounts** | Each profile has isolated data, shared infrastructure |
| **A home WiFi router** | The home node is the gateway — everyone inside is trusted, the mesh is the internet |
| **A family WhatsApp group** | Auto-bonded contacts + group chat, but private (no Meta server) |
| **Each person's ChatGPT** | Each profile gets their own AI threads, private from other members |

---

## 3. Architecture

### 3.1 The home node as a multi-profile server

```
┌─────────────────────────────────────────────────────────────┐
│  Home Computer (one EnvoyMesh node)                         │
│                                                             │
│  Mesh Identity: envoy:owner:abc123                          │
│  (one identity on the P2P network — the "router")           │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │ Dad      │  │ Mom      │  │ Kid      │                 │
│  │ profile  │  │ profile  │  │ profile  │                 │
│  │          │  │          │  │          │                 │
│  │ AI: ✓    │  │ AI: ✓    │  │ AI: ✓    │                 │
│  │ Bots: ✓  │  │ Bots: ✓  │  │ Bots: ✓  │                 │
│  │ Chats: ✓ │  │ Chats: ✓ │  │ Chats: ✓ │                 │
│  │ Push: ✓  │  │ Push: ✓  │  │ Push: ✓  │                 │
│  │ Vault: ✓ │  │ Vault: ✓ │  │ Vault: ✓ │                 │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                 │
│       │             │             │                         │
│       └──────┬──────┴──────┬──────┘                         │
│              │             │                                │
│         Auto-bonded    Auto-bonded                          │
│         (contacts)    (contacts)                            │
│                                                             │
│  Shared infrastructure:                                     │
│  ├── Model config (one LLM API key)                        │
│  ├── OpenClaw / Pi runtime                                  │
│  └── Mesh connectivity (peers, relays, discovery)           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │              │              │
    WebSocket       WebSocket      WebSocket
    + Push          + Push         + Push
         │              │              │
   ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
   │ Dad's     │ │ Mom's     │ │ Kid's     │
   │ iPhone    │ │ iPhone    │ │ iPad      │
   │ (EnvoyGo) │ │ (EnvoyGo) │ │ (EnvoyGo) │
   └───────────┘ └───────────┘ └───────────┘
```

### 3.2 Profile model

A **family profile** is a lightweight identity that lives on the home node. It is NOT a full mesh identity (no Ed25519 keypair, no mandate, no bonding protocol). It's a local-only identity — the mesh sees only the home owner.

```typescript
interface FamilyProfile {
  /** Unique ID within this node, e.g. "dad", "mom", "kid". */
  id: string
  /** Display name shown in chat lists + AI threads. */
  name: string
  /** Avatar URL or initials-based color. */
  avatarColor?: string
  /** When this profile was created. */
  createdAt: string
  /** Last seen (for presence). */
  lastSeenAt?: string
  /** Whether this profile is active (owner can deactivate without deleting). */
  active: boolean
  /** Per-profile bot definitions (each user creates their own bots). */
  aiBots?: AiBotDefinition[]
}
```

Stored in `<profileDir>/family-profiles.json` (mode `0600`):

```json
{
  "version": "0.1",
  "profiles": [
    { "id": "dad", "name": "Dad", "avatarColor": "#3b82f6", "active": true, "createdAt": "..." },
    { "id": "mom", "name": "Mom", "avatarColor": "#ec4899", "active": true, "createdAt": "..." },
    { "id": "kid", "name": "Alex", "avatarColor": "#10b981", "active": true, "createdAt": "..." }
  ],
  "defaultProfileId": "dad"
}
```

### 3.3 Session token → profile binding

Today: session token → `ownerId` (the home owner).

Family Network: session token → **`profileId`** → ownerId.

When a device pairs, the pairing flow asks "Who are you?" (select existing profile or create new). The session token is tagged with the `profileId`. From then on, every RPC call from that WebSocket connection is scoped to that profile.

```typescript
interface SessionTokenRecord {
  token: string
  ownerId: string           // always the home owner (the mesh identity)
  profileId?: string         // NEW — which family profile this device belongs to
  deviceId: string
  platform: string
  createdAt: string
}
```

**Backward compatibility:** tokens without a `profileId` default to the owner's primary profile (the person who set up the node). Existing single-user setups continue working unchanged.

---

## 4. Data isolation

### 4.1 Thread key namespacing

Every chat/AI thread is scoped by profile:

| Thread type | Key format today | Key format with profiles |
|---|---|---|
| EnvoyAI | `__envoy_ai__` | `__envoy_ai__:<profileId>` |
| Bot | `bot:librarian` | `bot:librarian:<profileId>` |
| Pi | `pi` | `pi:<profileId>` |
| Direct chat (mesh peer) | `envoy:owner:xyz` | `envoy:owner:xyz:<profileId>` |
| Direct chat (family) | n/a (new) | `family:<profileA>:<profileB>` |
| Group chat | `room:<roomId>` | `room:<roomId>` (shared, members checked) |
| Ext Agent | `bridge:<agentId>` | `bridge:<agentId>:<profileId>` |

**Rule:** when a profile requests `listChatHistory`, the server only returns threads that contain that profile's namespace. Dad can't see Mom's EnvoyAI thread. Mom can't see Dad's bot conversations.

### 4.2 Group chat membership

Group chats are **per-room**, not per-profile. A room has a `memberProfileIds: string[]` field. Only members see the room. Any member can create a room with any subset of family profiles + external mesh contacts.

The owner can create a "Family" room with all profiles as members — but this is just a normal group chat, not a special "shared" surface.

### 4.3 Bot definitions (per-profile)

Bots are stored per-profile in `family-profiles.json` under `profile.aiBots`. Each user creates their own bots in their own Settings → AI → Bots section. Dad's bots are invisible to Mom.

(Infrastructure note: the `aiBots` field in `node-config.json` is migrated to per-profile storage. The owner's existing bots move to the owner's profile.)

### 4.4 Vault

Each profile gets a vault subdirectory:
```
<profileDir>/vault/
  ├── dad/          ← Dad's private files
  ├── mom/          ← Mom's private files
  └── kid/          ← Kid's private files
```

Vault access is scoped by profile — `readFile` / `writeFile` RPCs resolve to `<profileDir>/vault/<profileId>/`.

### 4.5 Push notifications

Push tokens are already per-device. With profiles, the `listChatPush` dispatch checks the profileId on the token — Mom's phone only gets pushes for Mom's threads, not Dad's.

```
Push dispatch:
  1. Event arrives (e.g., chat:message for thread "bot:librarian:mom")
  2. Extract profileId from thread key → "mom"
  3. Find push tokens for "mom" → only Mom's devices
  4. Push → Mom's phone
```

---

## 5. Auto-bonding (family contacts)

### 5.1 The rule

When a profile is created, it is automatically added to every other **active** profile's contact list. When a profile is deactivated, it appears offline/disconnected to others (but is not removed from their list — they can still see old chat history).

### 5.2 Contact model

```typescript
interface FamilyContact {
  profileId: string           // e.g. "mom"
  displayName: string         // e.g. "Mom"
  avatarColor?: string
  relationship: "family"      // always "family" for auto-bonded
  bondedAt: string
}
```

Stored alongside each profile's data. When Dad's profile is created, Mom's contact list gets `{ profileId: "dad", displayName: "Dad", relationship: "family" }` automatically.

### 5.3 Direct messaging (family member → family member)

Messages between family profiles are **local-only** — they never leave the home node. No libp2p, no mesh, no relay.

```
Dad types "What's for dinner?" → sendToFamilyMember("mom", "What's for dinner?")
  → Home node writes to thread "family:dad:mom"
  → Emit chat:message (Mom's WS picks it up if online)
  → Push to Mom's device if offline
```

The message path:
1. Dad's EnvoyGo sends `sendFamilyMessage({ toProfileId: "mom", text: "..." })` via RPC
2. Home node persists under thread key `family:<fromProfileId>:<toProfileId>`
3. Emits `chat:message` — filtered by profileId (only Mom's WS receives it)
4. If Mom's WS is offline → push to Mom's device

**Bidirectional thread:** `family:dad:mom` and `family:mom:dad` are the same thread (sorted by ID). Both profiles read + write to the same key.

### 5.4 Presence

Each profile tracks `lastSeenAt` — when the device was last connected. Other family members see an online/offline indicator, exactly like mesh contacts today. The `isProfileOnline(profileId)` check mirrors `isOwnerOnline()` but scopes by profile.

---

## 6. External mesh contacts (coexistence)

Family profiles and mesh contacts coexist. Dad can chat with his friend Bob (on a different home node) while also chatting with Mom.

```
Dad's chat list:
  AI Section:
    ├── EnvoyAI (Dad's private AI)
    └── Dad's bots

  Contacts Section:
    ├── Mom (family, auto-bonded, always online)
    ├── Alex (family, auto-bonded)
    └── Bob (mesh, bonded, may be offline)

  Groups:
    └── Family Trip (Dad + Mom + Alex + Bob)
```

**External mesh messages** are scoped by profile too. When Bob sends a message to the home node, the home node routes it to Dad's thread (`envoy:owner:bob:dad`), not Mom's. The mesh identity is still the home owner — Bob sees one peer (the home node), not individual family members.

**Future enhancement:** if family members want their own mesh identities (to bond with external peers independently), that's Approach B (full DIDs per member) — a much larger effort that can be layered on later.

---

## 7. Pairing flow

### 7.1 First device (owner setup)

The owner installs the home node, configures the model, and pairs their phone. During pairing:

1. QR scan → pair
2. "Welcome! Create your profile:"
   - Name: `[Dad]`
   - Avatar color: `[■ #3b82f6]`
3. Profile created as the **owner profile** (the primary user)
4. This profile has full admin rights (create/delete profiles, manage bots, configure node)

### 7.2 Additional family members

1. The owner generates a "family invite" QR code (Settings → Family → Add Member)
2. Family member scans the QR with EnvoyGo
3. "Welcome to the [Node Name] family! Who are you?"
   - Create new: `[Mom]` name + avatar
   - Or: select an existing profile (if the owner pre-created it)
4. Profile created → auto-bonded with all existing profiles
5. Mom sees Dad in her contacts immediately; Dad sees Mom

### 7.3 Profile switching (optional)

If one device is shared (e.g., a family iPad), the user can switch profiles from the Me screen:

```
Me → [Profile: Alex ▼]
       ├── Alex (Kid)
       └── Switch Profile...
```

This re-pairs with a different profileId. Chat history is scoped to the selected profile.

---

## 8. Security model

### 8.1 Trust boundary

The home node owner is the **trust root**. All profiles are trusted by the owner. There is no need for mesh bonding or mandate authorization between family members — they're inside the trust boundary (like users on a shared computer).

### 8.2 Data isolation enforcement

| Layer | How isolation is enforced |
|---|---|
| **WebSocket session** | Every RPC is tagged with `profileId` from the session token |
| **Thread keys** | Namespaced by profile — `listChatHistory` filters by namespace |
| **AI/bot processing** | `sendToOpenClaw` / `sendToAiBot` scope thread + history by profile |
| **Push tokens** | Tagged with `profileId` — dispatch matches profile |
| **Vault** | Per-profile subdirectory |
| **Bot definitions** | Per-profile in `family-profiles.json` |

### 8.3 What the owner controls

| Setting | Scope |
|---|---|
| Model config (API key) | Shared — one key for all profiles |
| OpenClaw / Pi enable/disable | Shared — affects all profiles' AI |
| Profile creation / deletion | Owner-only |
| Node settings (relay, discovery) | Owner-only |
| Family invite QR generation | Owner-only |

### 8.4 What each profile controls

| Setting | Scope |
|---|---|
| Their own AI conversations | Private — only this profile sees |
| Their own bots | Private — each profile creates their own |
| Their own contacts (mesh) | Private — external bonds are per-profile |
| Their own vault | Private |
| Their display name / avatar | Per-profile |
| Group chat membership | Per-room (any member can create) |

---

## 9. Implementation plan

### Phase 1: Profile model + pairing (~2 days)

- `family-profiles.json` store (CRUD)
- `FamilyProfile` type in `@envoymesh/api`
- Session token → profileId binding
- Pairing flow: "Who are you?" (select/create profile)
- Config sync: `familyProfiles` in `home:config-updated`
- `defaultProfileId` for backward compat (owner = first profile)

### Phase 2: Thread namespacing + data isolation (~2 days)

- Thread key convention: `<threadKey>:<profileId>`
- `listChatHistory` filter by profile namespace
- `sendToOpenClaw` / `sendToAiBot` accept `profileId` from session
- Chat log store: per-profile query filter
- Bot definitions: migrate from `node-config.aiBots` to per-profile

### Phase 3: Family contacts + direct messaging (~1.5 days)

- Auto-bonding: new profile → added to all active profiles' contacts
- `sendFamilyMessage({ toProfileId, text })` RPC
- Thread key: `family:<sortedProfileA>:<sortedProfileB>`
- Push routing per profile
- Presence: `isProfileOnline(profileId)`

### Phase 4: Group chat integration (~0.5 days)

- Room creation: `memberProfileIds` field on rooms
- Room membership filter by profile
- "Create group" UI includes family contacts alongside mesh contacts

### Phase 5: EnvoyGo UI (~2 days)

- Pairing screen: profile selection / creation
- Me screen: current profile display + switcher
- Chat list: family contacts section (auto-bonded)
- Direct chat with family member (new)
- Group chat: include family members

### Phase 6: Social UI (~1 day)

- Settings → Family: profile management (create, rename, avatar, delete)
- Family invite QR generation
- Profile switcher (for shared devices)

**Total: ~9 days**

---

## 10. Backward compatibility

| Current behavior | Family Network | Migration |
|---|---|---|
| One owner, one device | One owner + one "owner profile" | Auto-create owner profile on first boot; existing tokens get `profileId = "owner"` |
| `aiBots` in node-config | Per-profile `aiBots` | Migrate existing bots to owner's profile |
| `listChatHistory("__envoy_ai__")` | `listChatHistory("__envoy_ai__:owner")` | Auto-append profile namespace when missing |
| Single push token for owner | Per-profile push tokens | Existing token gets `profileId = "owner"` |
| `isOwnerOnline()` | `isProfileOnline(profileId)` | Owner profile = existing behavior |

Existing single-user installations upgrade transparently — the owner gets a default profile, everything works as before.

---

## 11. What this is NOT

- **NOT** a mesh identity system — profiles are local, not bonded on the P2P network
- **NOT** end-to-end encrypted between family members — messages are in-process (the home node sees everything). This is acceptable because the owner trusts all family members (they're inside the trust boundary).
- **NOT** a multi-node cluster — one home node serves the family. If the home node is down, the family network is down.
- **NOT** a replacement for mesh contacts — external peers still use the full bonding + mesh transport. Family Network is an additional local layer.

---

## 12. References

- Current pairing flow: `apps/node/src/node-service-impl.ts` → `pairThinClient`
- Session token store: `packages/local-store/src/session-token-store.ts`
- Chat log store: `packages/local-store/src/chat-log-store.ts` (arbitrary thread keys)
- Push token store: `apps/node/src/push-notification.ts` → `PushTokenStore`
- Config sync: `apps/node/src/node-service-config.ts` → `getNodeConfigViaRuntime` + `home:config-updated`
- AI thread: `packages/api/src/envoy-ai-thread.ts` → `ENVOY_AI_THREAD_KEY`
- Bot framework: `packages/api/src/ai-bot.ts` → `AiBotDefinition`
- Chat rooms: `packages/api/src/chat-room-service.ts`
- Ext Agent: `packages/api/src/ext-agent.ts`
