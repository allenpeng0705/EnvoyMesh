# Family Network — Private Social Network on Your Home Computer

**Status:** Designed (2026-07-30)

Turn one EnvoyMesh home node into a **private family social network**. Your home computer becomes a personal server — family members pair their phones, get their own profiles, chat with each other, talk to AI, and share nothing with Big Tech.

No cloud. No subscription. No data leaving your home (except the LLM API calls you configure).

---

## 1. Vision

> **Your home computer is your family's private server.**

One EnvoyMesh home node runs on a desktop or laptop. The **owner** installs it, configures the model, and pairs their phone. Then each family member pairs their phone too — and each gets a completely independent experience:

- **Their own profile** — name, avatar, identity within the family
- **Their own AI assistant** — private conversations with EnvoyAI, Pi, and custom bots
- **Their own contacts** — auto-bonded with every other family member + their own external mesh contacts
- **Direct + group chat** — with family members AND external peers
- **Push notifications** — messages reach their phone when they're away
- **Complete data isolation** — no family member sees another's private data

The owner manages profiles (create, rename, delete) and configures infrastructure (model API key, node settings). Each profile is locked to one device — no profile switching within an app.

---

## 2. The analogy

| What it's like | How EnvoyMesh maps to it |
|---|---|
| **Netflix profiles** on one account | Each family member has a profile on one home node |
| **macOS user accounts** | Each profile has isolated data, shared infrastructure |
| **A home WiFi router** | The home node is the gateway — everyone inside is trusted, the mesh is the internet |
| **Each person's ChatGPT** | Each profile gets their own AI threads, private from other members |
| **Your own phone** | Profile is locked at pairing time — no switching, no confusion |

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
│  │ Dad      │  │ Mom      │  │ Alex     │                 │
│  │ (owner)  │  │          │  │          │                 │
│  │          │  │          │  │          │                 │
│  │ AI: ✓    │  │ AI: ✓    │  │ AI: ✓    │                 │
│  │ Bots: ✓  │  │ Bots: ✓  │  │ Bots: ✓  │                 │
│  │ Pi: ✓    │  │ Pi: ✓    │  │ Pi: ✓    │                 │
│  │ Term: ✓  │  │ Term: ✓  │  │ Term: ✓  │                 │
│  │ Chats: ✓ │  │ Chats: ✓ │  │ Chats: ✓ │                 │
│  │ Push: ✓  │  │ Push: ✓  │  │ Push: ✓  │                 │
│  │ Vault: ✓ │  │ Vault: ✓ │  │ Vault: ✓ │                 │
│  │          │  │          │  │          │                 │
│  │ Admin: ✓ │  │ Admin: ✗ │  │ Admin: ✗ │                 │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                 │
│       │             │             │                         │
│       └──────┬──────┴──────┬──────┘                         │
│              │             │                                │
│         Auto-bonded    Auto-bonded                          │
│         (contacts)    (contacts)                            │
│                                                             │
│  Shared infrastructure (owner-managed):                     │
│  ├── Model config (one LLM API key)                        │
│  ├── OpenClaw / Pi runtime                                  │
│  ├── Node settings (relay, discovery)                       │
│  └── Mesh connectivity (peers, relays)                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
         │              │              │
    WebSocket       WebSocket      WebSocket
    + Push          + Push         + Push
         │              │              │
   ┌─────┴─────┐ ┌─────┴─────┐ ┌─────┴─────┐
   │ Dad's     │ │ Mom's     │ │ Alex's    │
   │ iPhone    │ │ iPhone    │ │ iPad      │
   │ (EnvoyGo) │ │ (EnvoyGo) │ │ (EnvoyGo) │
   │           │ │           │ │           │
   │ Settings: │ │ Settings: │ │ Settings: │
   │ All tabs  │ │ Bots only │ │ Bots only │
│   │ + Push   │ │ + Push    │ │ + Push    │
│   │ + Node   │ │           │ │           │
   └───────────┘ └───────────┘ └───────────┘

Dad also uses the Social UI on the desktop (owner profile).
Mom and Alex use EnvoyGo only (phone/iPad).
```

### 3.2 Profile model

A **family profile** is a lightweight identity that lives on the home node. It is NOT a full mesh identity (no Ed25519 keypair, no mandate, no bonding protocol). It's a local-only identity — the mesh sees only the home owner.

```typescript
interface FamilyProfile {
  /** Unique ID within this node, e.g. "dad", "mom", "alex". */
  id: string
  /** Display name shown in chat lists + AI threads. */
  name: string
  /** Avatar color (hex). */
  avatarColor?: string
  /** Whether this is the owner profile (admin rights). */
  isOwner: boolean
  /** When this profile was created. */
  createdAt: string
  /** Last seen (for presence). */
  lastSeenAt?: string
  /** Whether this profile is active (owner can deactivate without deleting). */
  active: boolean
  /** Per-profile bot definitions (each user creates their own bots). */
  aiBots?: AiBotDefinition[]
  /** Per-profile Pi settings (auto-run policy, allowed paths). */
  piSettings?: PiSettings
}
```

Stored in `<profileDir>/family-profiles.json` (mode `0600`):

```json
{
  "version": "0.1",
  "profiles": [
    {
      "id": "dad",
      "name": "Dad",
      "avatarColor": "#3b82f6",
      "isOwner": true,
      "active": true,
      "createdAt": "2026-07-30T..."
    },
    {
      "id": "mom",
      "name": "Mom",
      "avatarColor": "#ec4899",
      "isOwner": false,
      "active": true,
      "createdAt": "2026-07-30T..."
    },
    {
      "id": "alex",
      "name": "Alex",
      "avatarColor": "#10b981",
      "isOwner": false,
      "active": true,
      "createdAt": "2026-07-30T..."
    }
  ]
}
```

The first profile created during node setup is automatically `isOwner: true`. Only one owner profile exists per node.

### 3.3 Session token → profile binding

**No profile switching within an app.** The profile is chosen once during pairing and never changes. If someone wants a different profile, they pair a different device.

```typescript
interface SessionTokenRecord {
  token: string
  ownerId: string           // always the home owner (the mesh identity)
  profileId: string          // which family profile this device belongs to
  deviceId: string
  platform: string
  createdAt: string
}
```

When a device pairs, the pairing flow asks "Who are you?" (select existing profile or create new). The session token is permanently tagged with that `profileId`. From then on, every RPC call from that WebSocket connection is scoped to that profile.

**Backward compatibility:** tokens without a `profileId` default to the owner's profile. Existing single-user setups continue working unchanged.

---

## 4. Features — what each profile gets

Every profile gets **the same features** — there's no "family member gets less" tiering. The only difference is the owner has admin rights (infrastructure management).

### 4.1 Per-profile features (all profiles, fully isolated)

| Feature | How it's scoped | Example |
|---|---|---|
| **EnvoyAI** | Thread key: `__envoy_ai__:<profileId>` | Dad's AI conversations are invisible to Mom |
| **Chat bots** | Per-profile `aiBots` in `family-profiles.json` | Dad creates "Luna", Mom creates "Chef Marco" — separate |
| **Bot conversations** | Thread key: `bot:<botId>:<profileId>` | Dad's Luna thread ≠ Mom's Luna thread (even if same bot) |
| **Pi** | Thread key: `pi:<profileId>` | Each profile has their own Pi sessions |
| **Terminal** | Sessions scoped by `profileId` | Dad's terminal ≠ Mom's terminal |
| **Push** | Token tagged with `profileId` | Mom's phone doesn't buzz for Dad's messages |
| **Vault** | `<profileDir>/vault/<profileId>/` | Private files per profile |

### 4.2 Owner-only features (admin rights)

These are **infrastructure settings** that affect all profiles. Only the owner profile can access them:

| Setting | Where | Why owner-only |
|---|---|---|
| **Model Provider** (API key, endpoint, model) | Settings → AI → Model Provider | One key serves everyone. Only owner should see/change it. |
| **OpenClaw enable/disable** | Settings → AI → AI Engine | Infrastructure — affects all profiles' AI |
| **Pi enable/disable** | Settings → AI → Pi | Infrastructure |
| **AI Engine mode** (which agents active) | Settings → AI | Infrastructure |
| **Node settings** (relay, discovery, network) | Settings → Node | Infrastructure |
| **Family profile management** | Settings → Family | Admin-only |
| **Authorized device management** | Settings → Devices | Admin-only |
| **Ext Agent configuration** | Settings → AI → Ext Agent | Infrastructure |

### 4.3 Per-profile settings (each person controls their own)

| Setting | Where | Scope |
|---|---|---|
| **Create/delete their own bots** | Settings → AI → Bots | Private — only this profile's bots |
| **Push notification toggle** | Me → Preferences | Private — their phone |
| **Auto-run policy** (Pi tool approvals) | Settings → AI → Pi | Private — their preferences |

### 4.4 How EnvoyGo enforces the permission model

The home node knows which profile is the owner (`isOwner: true` on the profile). When a non-owner profile tries to access an owner-only RPC:

```
Mom's EnvoyGo tries to update model provider config
  → updateNodeConfig({ modelProviders: {...} })
  → Home node checks: session.profileId "mom" → isOwner = false
  → Returns error: "Only the node owner can change this setting"
```

EnvoyGo's Settings screen also hides owner-only sections for non-owner profiles:
- **Owner sees:** Model Provider, AI Engine, Pi, Bots, Node settings, Devices, Family
- **Non-owner sees:** Bots, Push toggle (their own only)

The owner can use **both phone and desktop** (Social UI / Tauri). Non-owner profiles use EnvoyGo only (phone/iPad). The desktop Social UI always runs as the owner.

---

## 5. Auto-bonding (family contacts)

### 5.1 The rule — everything is per-profile

There is **no shared trust store**. Every contact — whether family or external mesh — belongs to a specific profile:

```
Profile: Dad (owner)
  Contacts:
    ├── Mom (family, auto-bonded)
    ├── Alex (family, auto-bonded)
    └── Bob (mesh, Dad bonded with him)

Profile: Mom
  Contacts:
    ├── Dad (family, auto-bonded)
    ├── Alex (family, auto-bonded)
    └── Alice (mesh, Mom bonded with her)

Profile: Alex
  Contacts:
    ├── Dad (family, auto-bonded)
    └── Mom (family, auto-bonded)
```

The trust store carries a `profileId` on every bond:

```json
[
  { "peerOwnerId": "family:mom", "profileId": "dad", "level": "family" },
  { "peerOwnerId": "family:alex", "profileId": "dad", "level": "family" },
  { "peerOwnerId": "envoy:owner:bob", "profileId": "dad", "level": "direct" },

  { "peerOwnerId": "family:dad", "profileId": "mom", "level": "family" },
  { "peerOwnerId": "family:alex", "profileId": "mom", "level": "family" },
  { "peerOwnerId": "envoy:owner:alice", "profileId": "mom", "level": "direct" },

  { "peerOwnerId": "family:dad", "profileId": "alex", "level": "family" },
  { "peerOwnerId": "family:mom", "profileId": "alex", "level": "family" }
]
```

**One store, one rule, one treatment.** No "shared" vs "per-profile" distinction. The mesh identity still does the bonding (the home node is one peer on the mesh), but the bond record is tagged with which profile initiated it.

### 5.2 Auto-bonding on profile creation

When a new profile is created, it is automatically added to every other **active** profile's contact list. When a profile is deactivated, it appears offline to others but stays in their contact list (old chat history is preserved).

### 5.3 Direct messaging (family member ↔ family member)

Messages between family profiles are **local-only** — they never leave the home node. No libp2p, no mesh, no relay.

```
Dad types "What's for dinner?" → sendFamilyMessage("mom", "What's for dinner?")
  → Home node writes to thread "family:dad:mom"
  → Emit chat:message (Mom's WS picks it up if online)
  → Push to Mom's device if offline
```

Thread key: `family:<sortedProfileA>:<sortedProfileB>` — bidirectional, both profiles read + write the same key.

### 5.4 External mesh contacts (per-profile bonding)

Each profile can bond with external peers independently. Dad bonds with Bob; Mom bonds with Alice. The bond record carries the `profileId`. When an inbound mesh message arrives:

1. Look up the bond: `{ peerOwnerId: "envoy:owner:bob", profileId: "dad" }`
2. Route to thread: `envoy:owner:bob:dad`
3. Emit filtered to Dad's WS sessions only
4. Push to Dad's devices only

Two profiles **cannot** bond with the same external peer simultaneously (one `profileId` per peer). This is acceptable — in a family, external contacts are typically personal.

### 5.5 Group chats

Group chat rooms are **per-room** (not per-profile). A room has a `memberProfileIds: string[]` field. Only members see the room. Any member can create a room with any subset of family profiles + external mesh contacts.

---

## 6. Data isolation

### 6.1 Thread key namespacing

Every thread is scoped by profile:

| Thread type | Key format |
|---|---|
| EnvoyAI | `__envoy_ai__:<profileId>` |
| Bot | `bot:<botId>:<profileId>` |
| Pi | `pi:<profileId>` |
| Direct chat (mesh peer) | `envoy:owner:<peerId>:<profileId>` |
| Direct chat (family) | `family:<sortedProfileA>:<sortedProfileB>` |
| Group chat | `room:<roomId>` (membership checked) |
| Ext Agent | `bridge:<agentId>:<profileId>` |

**Rule:** when a profile requests `listChatHistory`, the server only returns threads that contain that profile's namespace. No cross-profile visibility.

### 6.2 Push notification routing

Push tokens are tagged with `profileId`. When the unified push listener fires:

```
Push dispatch:
  1. Event arrives (e.g., chat:message for thread "bot:librarian:mom")
  2. Extract profileId from thread key → "mom"
  3. Find push tokens for "mom" → only Mom's devices
  4. Check isProfileOnline("mom") → skip if Mom's WS is active
  5. Push → Mom's phone only
```

---

## 7. Pairing flow

### 7.1 Owner setup

The home node runs on the home computer (either as a desktop/Tauri app with a visible UI, or headless as a background service). The **owner** is the person who sets it up:

1. Owner installs and starts EnvoyMesh on the home computer
2. Configures the model provider (Settings → AI → Model Provider) via the desktop Social UI
3. Pairs their phone: opens EnvoyGo → scans the pairing QR displayed on the desktop → "Who are you?" → creates the **owner profile** (name "Dad", avatar color)
4. The first profile created is automatically marked `isOwner: true` — has admin rights
5. Dad can now use **both** his phone (EnvoyGo) and the desktop (Social UI) — both run as the owner profile

**The owner is not a special desktop-only identity.** The owner is simply the first family member to set up the node. They pair their phone via EnvoyGo exactly like everyone else — the only difference is their profile has `isOwner: true` (admin rights) and they can also use the desktop UI.

If the owner has no desktop (e.g., running the node on a Raspberry Pi headless), they can still configure everything via EnvoyGo — the owner profile in EnvoyGo shows all settings tabs (Model Provider, Node settings, Family management, etc.).

### 7.2 Adding family members — the family invite QR

The **family invite QR** is a special pairing token distinct from the normal pairing QR:

- **Normal pairing QR:** displayed on the desktop Social UI (Settings → Node). Used by the **owner** to pair their first device. No profile selection step — it auto-creates the owner profile.
- **Family invite QR:** generated by the owner (Settings → Family → "Add Member"). Contains a `familyInviteToken` that grants the scanner the right to create a **new non-owner profile** or select an existing one. The token is single-use (consumed on pairing) and can be revoked by the owner.

```
Normal pairing QR:     envoy://pair?wsUrl=...&relayPeerId=...&token=<ownerToken>
Family invite QR:     envoy://pair?wsUrl=...&relayPeerId=...&token=<familyInviteToken>
```

Both use the same `envoy://pair` scheme + EnvoyGo QR scanner. The difference is the token type — the home node checks which type it is and adjusts the pairing flow:

| Token type | After QR scan, EnvoyGo shows | Profile created |
|---|---|---|
| `ownerToken` | "Set up your node" → name + avatar | Owner profile (`isOwner: true`) |
| `familyInviteToken` | "Welcome to the family! Who are you?" → create new or select existing | Non-owner profile (`isOwner: false`) |

**The flow for adding Mom:**
1. Owner opens Settings → Family on the desktop (or EnvoyGo) → clicks "Add Member"
2. A QR code appears on screen (or can be sent as an image / AirDrop)
3. Mom opens EnvoyGo on her phone → scans the QR
4. "Welcome to the [Node Name] family! Who are you?"
   - Create new: `[Mom]` name + avatar color
   - Or: select an existing profile (if owner pre-created "Mom" in advance)
5. Profile created → auto-bonded with all existing profiles
6. Mom sees Dad + Alex in her contacts immediately; they see Mom
7. Mom uses EnvoyGo only — her phone is locked to her profile
8. The `familyInviteToken` is consumed (can't be reused)

### 7.3 No profile switching

Each device is locked to one profile at pairing time. There is **no profile switcher** in EnvoyGo or the Social UI. The profile is permanent for that device's session.

- Dad gets a new phone → re-pairs → selects his existing "Dad" profile → old phone's session is revoked
- Family iPad shared between Alex and a guest → Alex's profile only; guest would need their own profile on a separate pairing

This keeps the mental model simple: **your phone shows your stuff, always.** No "am I looking at my messages or someone else's?" confusion.

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
| **Trust store** | Every bond carries `profileId` — contacts are per-profile |
| **Settings RPCs** | Owner-only RPCs rejected for non-owner profiles |

### 8.3 Owner controls (infrastructure)

| Setting | Scope |
|---|---|
| Model config (API key) | Shared — one key for all profiles |
| OpenClaw / Pi enable/disable | Shared — affects all profiles' AI |
| Node settings (relay, discovery) | Owner-only |
| Family profile management | Owner-only |
| Family invite QR generation | Owner-only |

### 8.4 Profile controls (personal)

| Setting | Scope |
|---|---|
| Their own AI conversations | Private — only this profile sees |
| Their own bots | Private — each profile creates their own |
| Their own contacts (mesh) | Private — bonds are per-profile |
| Their own vault | Private |
| Their display name / avatar | Per-profile |
| Their push toggle | Per-profile |
| Their auto-run policy | Per-profile |

---

## 9. Implementation plan

### Phase 1: Profile model + pairing (~2 days)

- `family-profiles.json` store (CRUD with `isOwner` flag)
- `FamilyProfile` type in `@envoymesh/api`
- Session token → `profileId` binding
- Pairing flow: "Who are you?" (select/create profile)
- Config sync: `familyProfiles` in `home:config-updated`
- Owner profile auto-created on first boot (migration)
- Owner-only RPC guard (reject `updateNodeConfig` from non-owner)

### Phase 2: Thread namespacing + data isolation (~2 days)

- Thread key convention: `<threadKey>:<profileId>`
- `listChatHistory` filter by profile namespace
- `sendToOpenClaw` / `sendToAiBot` accept `profileId` from session
- Chat log store: per-profile query filter
- Bot definitions: migrate from `node-config.aiBots` to per-profile
- Push routing: per-profile token matching

### Phase 3: Family contacts + auto-bonding (~1.5 days)

- Trust store: add `profileId` to every bond record
- Auto-bonding: new profile → added to all active profiles' contacts
- `sendFamilyMessage({ toProfileId, text })` RPC
- Thread key: `family:<sortedProfileA>:<sortedProfileB>`
- External mesh routing: inbound messages match bond's `profileId`
- Presence: `isProfileOnline(profileId)`

### Phase 4: Group chat integration (~0.5 days)

- Room creation: `memberProfileIds` field on rooms
- Room membership filter by profile
- "Create group" UI includes family contacts alongside mesh contacts

### Phase 5: EnvoyGo UI (~2 days)

- Pairing screen: profile selection / creation (name + avatar color)
- Settings screen: hide owner-only sections for non-owner profiles
- Chat list: family contacts section (auto-bonded)
- Direct chat with family member (new)
- Group chat: include family members
- Per-profile bot management (their own bots)

### Phase 6: Social UI (~1 day)

- Settings → Family: profile management (create, rename, avatar, delete)
- Family invite QR generation
- Desktop always runs as owner profile

**Total: ~9 days**

---

## 10. Backward compatibility

| Current behavior | Family Network | Migration |
|---|---|---|
| One owner, one device | One owner profile + family profiles | Auto-create owner profile on first boot |
| `aiBots` in node-config | Per-profile `aiBots` in family-profiles.json | Migrate existing bots to owner's profile |
| `listChatHistory("__envoy_ai__")` | `listChatHistory("__envoy_ai__:owner")` | Auto-append profile namespace when missing |
| Session tokens without `profileId` | Tagged with `profileId = "owner"` | Backfill on token read |
| `isOwnerOnline()` | `isProfileOnline(profileId)` | Owner profile = existing behavior |
| Trust store bonds without `profileId` | Tagged with `profileId = "owner"` | Backfill on read |

Existing single-user installations upgrade transparently.

---

## 11. What this is NOT

- **NOT** a mesh identity system — profiles are local, not bonded on the P2P network
- **NOT** end-to-end encrypted between family members — messages are in-process (the home node sees everything). Acceptable because the owner trusts all family members.
- **NOT** a multi-node cluster — one home node serves the family
- **NOT** a profile switcher — each device is locked to one profile permanently
- **NOT** a replacement for mesh contacts — external peers still use the full bonding + mesh transport

---

## 12. References

- Current pairing flow: `apps/node/src/node-service-impl.ts` → `pairThinClient`
- Session token store: `packages/local-store/src/session-token-store.ts`
- Chat log store: `packages/local-store/src/chat-log-store.ts` (arbitrary thread keys)
- Push token store: `apps/node/src/push-notification.ts` → `PushTokenStore`
- Config sync: `apps/node/src/node-service-config.ts` + `home:config-updated`
- AI thread: `packages/api/src/envoy-ai-thread.ts` → `ENVOY_AI_THREAD_KEY`
- Bot framework: `packages/api/src/ai-bot.ts` → `AiBotDefinition`
- Chat rooms: `packages/api/src/chat-room-service.ts`
- Trust store: `packages/local-store/src/local-trust-store.ts`
- Ext Agent: `packages/api/src/ext-agent.ts`
