# Family Network — Private Social Network on Your Home Computer

**Status:** Designed (2026-07-30)

Turn one EnvoyMesh home node into a **private family social network**. Your home computer becomes a personal server — family members pair their phones, get their own profiles, chat with each other, talk to AI, and share nothing with Big Tech.

No cloud. No subscription. No data leaving your home (except the LLM API calls you configure).

---

## 1. Vision

> **Your home computer is your family's private server.**

One EnvoyMesh home node runs on a desktop or laptop. The **owner** installs it, configures the model, and pairs their phone. Then each family member pairs their phone too — and each gets a focused, independent experience:

- **Their own profile** — name, avatar, identity within the family
- **Their own AI** — private EnvoyAI threads, character bots, and Ext Agent chat
- **Family contacts** — auto-listed with every other family member (local only)
- **Direct + group chat** — with family members on this home node
- **Push notifications** — messages reach their phone when they're away
- **Complete data isolation** — no family member sees another's private AI or chats

The **owner** keeps the full current EnvoyMesh product (mesh contacts, terminal, Pi coding agent, vault, node settings). Family members do **not** get external mesh bonding, terminal, Pi coding agent, vault, or infrastructure settings.

The owner manages profiles (create, rename, delete) and configures infrastructure (model API key, node settings). Each profile is locked to one device — no profile switching within an app.

---

## 2. The analogy

| What it's like | How EnvoyMesh maps to it |
|---|---|
| **Netflix profiles** on one account | Each family member has a profile on one home node |
| **macOS user accounts** | Each profile has isolated data, shared infrastructure |
| **A home WiFi router** | The home node is the gateway — everyone inside is trusted; only the owner talks to the mesh "internet" |
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
│  │ FULL:    │  │ LIMITED: │  │ LIMITED: │                 │
│  │ AI: ✓    │  │ AI: ✓    │  │ AI: ✓    │                 │
│  │ Bots: ✓  │  │ Bots: ✓  │  │ Bots: ✓  │                 │
│  │ Ext: ✓   │  │ Ext: ✓   │  │ Ext: ✓   │                 │
│  │ Family:✓ │  │ Family:✓ │  │ Family:✓ │                 │
│  │ Push: ✓  │  │ Push: ✓  │  │ Push: ✓  │                 │
│  │ Pi: ✓    │  │ Pi: ✗    │  │ Pi: ✗    │                 │
│  │ Term: ✓  │  │ Term: ✗  │  │ Term: ✗  │                 │
│  │ Mesh: ✓  │  │ Mesh: ✗  │  │ Mesh: ✗  │                 │
│  │ Vault: ✓ │  │ Vault: ✗ │  │ Vault: ✗ │                 │
│  │ Admin: ✓ │  │ Admin: ✗ │  │ Admin: ✗ │                 │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                 │
│       │             │             │                         │
│       └──────┬──────┴──────┬──────┘                         │
│              │             │                                │
│         Family contacts (derived from profiles — not mesh)  │
│                                                             │
│  Shared infrastructure (owner-managed):                     │
│  ├── Model config (one LLM API key)                        │
│  ├── OpenClaw / Pi / Ext Agent runtime                      │
│  ├── Node settings (relay, discovery)                       │
│  └── Mesh connectivity (peers, relays) — owner only         │
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
   │ All       │ │ Simple    │ │ Simple    │
   │ features  │ │ features  │ │ features  │
   └───────────┘ └───────────┘ └───────────┘

Dad (owner): full current EnvoyMesh — AI, bots, Ext Agent, Pi,
             terminal, mesh, vault, node settings, family admin.
             Uses phone (EnvoyGo) + desktop (Social UI).

Mom / Alex (family): EnvoyAI, bots, Ext Agent chat, family chat,
             push. No terminal, Pi coding agent, vault, external
             mesh, or node settings. EnvoyGo only.
```

### 3.2 Feature tiers

| Feature | Owner | Family member |
|---|---|---|
| **EnvoyAI** | ✅ Private AI threads | ✅ Private AI threads |
| **AI Character Bots** | ✅ Create + use their own | ✅ Create + use their own |
| **Ext Agent chat** | ✅ Chat with active Ext Agent | ✅ Chat with active Ext Agent |
| **Family direct chat** | ✅ | ✅ |
| **Family group chat** | ✅ Family-only rooms | ✅ Family-only rooms |
| **Push notifications** | ✅ Per-device | ✅ Per-device |
| **Terminal** | ✅ | ❌ |
| **Pi (coding agent)** | ✅ | ❌ |
| **Vault** | ✅ | ❌ |
| **External mesh contacts** | ✅ | ❌ |
| **Mesh discovery** | ✅ | ❌ |
| **Node settings** | ✅ | ❌ |
| **Model provider config** | ✅ | ❌ (uses owner's config) |
| **Family profile management** | ✅ | ❌ |
| **Authorized device management** | ✅ | ❌ |

**Ext Agent vs Pi:** Family members may **chat** with the active Ext Agent bridge (including if that agent is Pi-backed). They may **not** open the Pi coding-agent UI, terminal, or filesystem tools. Chat is namespaced; shell/FS stays owner-only.

**The owner has everything.** Family members get: talk to AI and talk to each other.

### 3.3 Profile model

A **family profile** is a lightweight identity that lives on the home node. It is NOT a full mesh identity (no Ed25519 keypair, no mandate, no bonding protocol). The mesh sees only the home owner.

```typescript
interface FamilyProfile {
  /** Unique ID within this node, e.g. "dad", "mom", "alex". */
  id: string
  /** Display name shown in chat lists + AI threads. */
  name: string
  /** Avatar color (hex). */
  avatarColor?: string
  /** Whether this is the owner profile (admin rights + full features). */
  isOwner: boolean
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
    }
  ]
}
```

The first profile created during node setup is automatically `isOwner: true`. Only one owner profile exists per node.

### 3.4 Session token → profile binding

**No profile switching within an app.** The profile is chosen once during pairing and never changes. If someone wants a different profile, they pair a different device.

```typescript
interface SessionTokenRecord {
  token: string
  ownerId: string           // always the home owner (the mesh identity)
  profileId: string          // which family profile this device belongs to
  deviceId: string           // stable client-generated UUID (avoid name collisions)
  platform: string
  createdAt: string
}
```

When a device pairs, the pairing flow asks "Who are you?" (select existing profile or create new). The session token is permanently tagged with that `profileId`. From then on, every RPC call from that WebSocket connection is scoped to that profile.

**Backward compatibility:** tokens without a `profileId` default to the owner's profile. Existing single-user setups continue working unchanged.

**EnvoyGo path only:** Family Network uses thin-client pairing (`pairThinClient` + session token). Phase 11 Capacitor shared-identity mobile remains "another device of the owner," not a family profile.

---

## 4. Features — owner vs family member

### 4.1 Shared features (both owner + family, per-profile isolated)

| Feature | How it's scoped | Example |
|---|---|---|
| **EnvoyAI** | Thread key: `__envoy_ai__:<profileId>` | Dad's AI conversations are invisible to Mom |
| **AI Character Bots** | Per-profile `aiBots` in `family-profiles.json` | Dad creates "Luna", Mom creates "Chef Marco" |
| **Ext Agent chat** | Thread key: `bridge:<agentId>:<profileId>` | Each profile chats with the active Ext Agent privately |
| **Family direct chat** | Thread key: `family:<sortedProfileA>:<sortedProfileB>` | Dad ↔ Mom |
| **Family group chat** | Room with `memberProfileIds` (family only) | Dad + Mom + Alex |
| **Push** | Token tagged with `profileId` | Mom's phone doesn't buzz for Dad's messages |

### 4.2 Owner-only features

| Feature | Why owner-only |
|---|---|
| **Terminal** | Shell access — system-level |
| **Pi (coding agent)** | Developer tool / filesystem |
| **Vault** | Filesystem data plane |
| **External mesh contacts** | Mesh bonding + inbound routing stay single-identity |
| **Mesh discovery** | P2P / network |
| **Model Provider config** | One API key serves everyone |
| **OpenClaw / Pi enable/disable** | Infrastructure |
| **Node settings** | Infrastructure |
| **Family profile management** | Admin |
| **Authorized device management** | Admin |

### 4.3 Per-profile settings (each person controls)

| Setting | Scope |
|---|---|
| **Create/delete their own bots** | Private — this profile's bots only |
| **Push notification toggle** | Private — their phone |

### 4.4 Feature gate (server + UI)

Non-owner sessions are **rejected** on owner-only RPCs (UI hide is not enough):

```
Mom tries ensureTerminalSession / sendBondRequest / updateNodeConfig / vault.*
  → session.profileId "mom" → isOwner = false
  → error: "Only available to the node owner"
```

EnvoyGo UI:

- **Owner:** all tabs (Chat, Inbox, Content, Me with full settings, Terminals, Discover, Family admin)
- **Non-owner:** Chat (AI + bots + Ext Agent + family), Me (Bots + Push only). No Terminals, Node, Discover, Model Provider, Pi coding UI, vault

---

## 5. Family contacts (not mesh bonds)

### 5.1 Separate from the trust store

**Do not put `family:*` IDs in the mesh trust store.** Family contacts are derived from `family-profiles.json`:

```
For profile "mom":
  contacts = all other active profiles  →  Dad, Alex
```

The owner's **external** mesh bonds stay in the existing trust store, unchanged — no `profileId` field required for v1. Only the owner profile can create or use mesh contacts.

```
Profile: Dad (owner)
  Family contacts: Mom, Alex          ← from family-profiles.json
  Mesh contacts: Bob, Carol           ← existing trust store (unchanged)

Profile: Mom (family)
  Family contacts: Dad, Alex          ← from family-profiles.json
  Mesh contacts: (none)
```

### 5.2 Auto-list on profile creation

When a new profile is created, every other **active** profile sees them in Family contacts immediately (clients sync from `familyProfiles` in config). When a profile is **deactivated**, it appears offline but stays listed so chat history remains reachable; deactivated profiles are hidden from the family invite preview until reactivated; live thin-client WebSockets for that profile are disconnected. **Wipe** (also what `deleteFamilyProfile` does) removes the profile row and erases profile-scoped local data (EnvoyAI / bot / bridge threads, family DMs involving that id, session tokens, push tokens, chat RAG for those threads). Shared family rooms keep remaining members and reassign creator when needed; solo rooms created only by the wiped profile are removed. Live WS clients for the profile are disconnected. Recreating the same display name may reuse the slug id, but wiped history is gone.

### 5.3 Direct messaging (local-only)

```
Dad → sendFamilyMessage("mom", "What's for dinner?")
  → thread "family:dad:mom"
  → emit chat:message to Mom's WS sessions
  → push to Mom if offline
```

Thread key: `family:<sortedProfileA>:<sortedProfileB>` — both profiles read/write the same key.

### 5.4 Family group chats (local-only)

Rooms use `memberProfileIds: string[]`. **Family members only** — no mixing with external mesh peers in v1. Owner mesh group rooms (existing `memberOwnerIds` protocol) stay as today and are owner-only.

---

## 6. Data isolation

### 6.1 Thread keys

| Thread type | Key format | Who |
|---|---|---|
| EnvoyAI | `__envoy_ai__:<profileId>` | All profiles |
| Bot | `bot:<botId>:<profileId>` | All profiles |
| Ext Agent | `bridge:<agentId>:<profileId>` | All profiles |
| Family DM | `family:<sortedA>:<sortedB>` | Both members |
| Family group | `room:<roomId>` | Membership check via `memberProfileIds` |
| Mesh DM / mesh room | Existing keys (unchanged) | **Owner only** |
| Pi coding thread | Existing keys (unchanged) | **Owner only** |

**ACL:** use an explicit helper `threadVisibleTo(profileId)` — do not rely on "string contains profileId" (family DMs and rooms need membership checks).

### 6.2 Push routing

```
Push dispatch:
  1. Event for thread "bot:librarian:mom" (or family:dad:mom)
  2. Resolve target profileId(s)
  3. Tokens for those profiles only
  4. Skip if isProfileOnline(profileId)
  5. Push
```

Presence is **per-profile**. Dad online on desktop must not suppress Mom's push.

### 6.3 Config sync

`home:config-updated` for non-owner sessions must **omit secrets** (model API keys, service accounts). Non-owners may receive `familyProfiles` (names/avatars/bots metadata) and feature flags, not infrastructure credentials.

---

## 7. Pairing flow

### 7.1 Owner setup

1. Owner installs and starts EnvoyMesh on the home computer
2. Configures model provider via desktop Social UI (or EnvoyGo if headless)
3. Pairs phone via normal pairing QR → creates **owner profile** (name + avatar)
4. First profile is `isOwner: true`
5. Owner uses EnvoyGo + desktop Social UI (desktop always runs as owner)

### 7.2 Family invite QR

| Token | After scan | Profile |
|---|---|---|
| Normal pairing | "Set up your node" → name + avatar | Owner (`isOwner: true`) |
| Family invite | "Welcome to the family! Who are you?" → create or select | Non-owner |

```
Normal:  envoy://pair?wsUrl=...&token=<ownerToken>
Family:  envoy://pair?wsUrl=...&token=<familyInviteToken>
```

Family invite tokens are single-use and owner-revocable. Prefer reusing the company-invite token lifecycle (Phase 35A) with a `kind: "family"` discriminator rather than inventing a parallel store.

**Adding Mom:** Owner → Settings → Family → Add Member → QR → Mom scans → create "Mom" → appears in everyone's Family section → invite consumed.

### 7.3 No profile switching

Device locked to one profile for that session. New phone → re-pair → select existing profile → revoke old session.

---

## 8. Security model

### 8.1 Trust boundary

The home node owner is the trust root. Family profiles are inside that boundary (like users on a shared computer). No mesh bonding between family members.

### 8.2 Enforcement

| Layer | How |
|---|---|
| WebSocket session | `profileId` from session token on every RPC |
| Thread ACL | `threadVisibleTo(profileId)` |
| AI / bots / Ext Agent | Thread + history scoped by profile |
| Push tokens | Tagged with `profileId` |
| Bot definitions | Per-profile in `family-profiles.json` |
| Mesh / terminal / Pi / vault / config | Owner-only RPC allowlist |
| Family contacts | Derived from profiles — never mesh trust store |

### 8.3 What family members control

Their AI threads, bots, family chats, display name/avatar, push toggle.

---

## 9. Implementation plan

Aligned with [implementation-plan.md](./implementation-plan.md) Phase 51 (51A–51F).

| Slice | Scope | ~Days |
|---|---|---|
| **51A** | Profile store, session `profileId`, invite QR, owner RPC gate | 2 |
| **51B** | Thread namespace (EnvoyAI / bots / Ext Agent) + push by profile | 2 |
| **51C** | Family DM + contacts from profiles (no trust-store rewrite) | 1 |
| **51D** | Family-only group rooms | 0.5 |
| **51E** | EnvoyGo UI (pairing, Family section, feature gating) | 1.5 |
| **51F** | Social UI Family settings + invite QR | 1 |

**Total: ~8 days**

---

## 10. Backward compatibility

| Current | Family Network | Migration |
|---|---|---|
| One owner, one device | Owner profile + optional family profiles | Auto-create owner profile on first boot |
| `aiBots` in node-config | Per-profile `aiBots` | Migrate existing bots → owner profile |
| `listChatHistory("__envoy_ai__")` | `__envoy_ai__:<profileId>` | Append caller profile when missing |
| Session tokens without `profileId` | `profileId = owner` | Backfill on read |
| `isOwnerOnline()` | `isProfileOnline(profileId)` | Owner sessions = previous behavior |
| Trust store | **Unchanged** for v1 | No schema migration |

Existing single-user installs upgrade transparently.

---

## 11. What this is NOT

- **NOT** a mesh identity system — profiles are local
- **NOT** E2E encrypted between family members — home node sees messages (owner trusts family)
- **NOT** a multi-node cluster — one home node
- **NOT** a profile switcher — device locked to one profile
- **NOT** mesh contacts for family members — owner only
- **NOT** equal features — family = AI + Ext Agent chat + family chat + push; owner = full product
- **NOT** vault / terminal / Pi coding UI for family members

---

## 12. References

- Phase plan: [implementation-plan.md](./implementation-plan.md) § Phase 51
- Pairing: `apps/node/src/node-service-impl.ts` → `pairThinClient`
- Session tokens: `packages/local-store/src/session-token-store.ts`
- Chat log: `packages/local-store/src/chat-log-store.ts`
- Push: `apps/node/src/push-notification.ts`
- Config sync: `apps/node/src/node-service-config.ts` + `home:config-updated`
- AI thread: `packages/api/src/envoy-ai-thread.ts`
- Bots: `packages/api/src/ai-bot.ts`
- Ext Agent: `packages/api/src/ext-agent.ts`
- Chat rooms: `packages/api/src/chat-room-service.ts`
- Company invite (reuse for family invite): Phase 35A
