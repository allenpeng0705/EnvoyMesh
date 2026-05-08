# AI Response Settings & Rules — Detailed Design

## Overview

This design enables a powerful yet controlled AI assistant that works on behalf of the user in two modes:

1. **Online Assistant**: When the user is present, AI suggests drafts but never auto-sends
2. **Offline Agent**: When the user is away, AI can respond autonomously based on configurable rules

The key insight from the discussion: instead of one global AI toggle, we separate **identity** (how the AI presents itself), **trust circles** (per-contact permissions), and **rule builders** (trigger-action logic for context-aware responses).

---

## 1. Three Assistant Modes (Per-Chat)

Each chat window has a small **Assistant Switch** with three positions:

| Mode | Icon | Behavior |
|------|------|----------|
| **Manual** | ✏️ (default) | User types everything. No AI involvement. |
| **Assistant** | 💬 | AI generates a **draft** in the input box. User edits and clicks Send. |
| **Auto-Reply** | 🔄 | AI sends responses automatically (only if enabled for this contact). |

### UI Placement

The Assistant Switch appears as a small pill/toggle in the chat header, next to the contact name:

```
┌─────────────────────────────────────────┐
│ 💬 Alice                    [✏️ 💬 🔄] │
│                           Assistant Switch│
├─────────────────────────────────────────┤
```

### Storage

The selected mode per contact is stored locally in the UI state (React state + localStorage fallback). It does NOT sync to the node or other devices — this is a local UI preference.

```typescript
// Local UI state only (not persisted to node)
type AssistantMode = "manual" | "assistant" | "auto";

// In App.tsx
const [assistantModes, setAssistantModes] = useState<Record<string, AssistantMode>>({});
```

**Constraint**: Auto-Reply mode is only selectable if the contact's **AI Access Level** (see Per-Chat Permissions) is set to `"full"`. Otherwise, the switch is grayed out for Auto-Reply.

---

## 2. Global AI Settings Page

Located under **Settings → AI** (new tab in settings). Contains three sections:

### 2A. Core Status

```
┌─────────────────────────────────────────┐
│ AI Assistant Settings                    │
├─────────────────────────────────────────┤
│ Status                                  │
│ ┌─────────────────────────────────────┐ │
│ │ Online Assistant          [Toggle]  │ │
│ │ Suggest replies when you are online │ │
│ └─────────────────────────────────────┘ │
│ ┌─────────────────────────────────────┐ │
│ │ Offline Agent            [Toggle]  │ │
│ │ Handle chats when you are away     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Online/Offline detection:               │
│ ○ Automatic (based on activity)        │
│ ○ Manual (set status manually)          │
└─────────────────────────────────────────┘
```

**Data Model**:

```typescript
interface AiAssistantStatus {
  onlineAssistantEnabled: boolean;  // Suggest drafts, never auto-send
  offlineAgentEnabled: boolean;     // Auto-reply when away (requires rules)
  statusMode: "automatic" | "manual";
  isOnline: boolean;               // Current detected status (if automatic)
}
```

### 2B. AI Identity (Global Response Mode)

Defines how the AI presents itself in all responses:

```
┌─────────────────────────────────────────┐
│ AI Identity                             │
│                                         │
│ How should the AI respond?              │
│                                         │
│ ○ Invisible                             │
│   Response as if it were you            │
│   Example: "Yeah, I can do that."       │
│                                         │
│ ○ Transparent                           │
│   Prefix every message with [AI]        │
│   Example: "[AI]: I'm checking the..."  │
│                                         │
│ ○ Defensive (Gatekeep)                  │
│   AI acts as gatekeeper when you're away │
│   Example: "I've received your message  │
│   and will notify Alice when back."     │
└─────────────────────────────────────────┘
```

**Data Model**:

```typescript
type AiIdentityMode = "invisible" | "transparent" | "defensive";

interface AiIdentity {
  mode: AiIdentityMode;
  transparentPrefix?: string;  // Default: "[AI Agent]"
}
```

**Prompt Engineering by Mode**:

| Mode | System Prompt Suffix |
|------|---------------------|
| Invisible | `You are Alice. Respond naturally as if you are them.` |
| Transparent | `You are Alice's AI assistant. Prefix your response with "[AI Agent]:".` |
| Defensive | `You are Alice's assistant. When they are unavailable, politely inform callers and promise to relay messages.` |

### 2C. Per-Contact Default Mode

```
┌─────────────────────────────────────────┐
│ Default Mode for New Contacts           │
│                                         │
│ For contacts without explicit settings:  │
│                                         │
│ ○ Manual (safest)                      │
│ ○ Assistant                            │
│ ○ Auto-Reply (requires trust)          │
└─────────────────────────────────────────┘
```

---

## 3. Per-Chat Permissions (Trust Circle)

In the **Contact Info** panel (accessible via right-click or info icon on a contact), add a new **AI Access** section:

```
┌─────────────────────────────────────────┐
│ AI Access for Alice                     │
├─────────────────────────────────────────┤
│ AI Access Level                         │
│ ┌─────────────────────────────────────┐ │
│ │ ○ None                               │ │
│ │   AI never responds to this contact  │ │
│ ├─────────────────────────────────────┤ │
│ │ ○ Assistant Only                     │ │
│ │   Draft suggestions only             │ │
│ ├─────────────────────────────────────┤ │
│ │ ○ Full Auto-Reply                    │ │
│ │   AI can respond automatically       │ │
│ │   (also enables Auto-Reply mode)     │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Knowledge Access                        │
│ ┌─────────────────────────────────────┐ │
│ │ ○ Public Only                        │ │
│ │   AI can share public info only     │ │
│ ├─────────────────────────────────────┤ │
│ │ ○ Professional                       │ │
│ │   AI can access work-related vault  │ │
│ ├─────────────────────────────────────┤ │
│ │ ○ Personal                           │ │
│ │   AI can access personal vault too   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Priority                                │
│ ┌─────────────────────────────────────┐ │
│ │ ○ High                               │ │
│ │   Alert human immediately for this   │ │
│ │   contact's messages                 │ │
│ ├─────────────────────────────────────┤ │
│ │ ○ Low                                │ │
│ │   AI handles entirely without alert  │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Data Model — Contact AI Preferences**:

```typescript
// Stored in BondRecord or separate contact-preferences store
interface ContactAiPreferences {
  peerOwnerId: string;
  aiAccessLevel: "none" | "assistant_only" | "full";
  knowledgeAccess: "public" | "professional" | "personal";
  priority: "high" | "low";
}
```

**Storage**: Stored in `local-store` under a new `contact-ai-preferences.json` file. This is local to each device.

---

## 4. Rule Builder (Trigger-Action Logic)

Rules define what the AI does in **Offline Agent** mode. Rules are evaluated in order; first matching rule wins.

### 4A. Rule Structure

```typescript
interface AiRule {
  id: string;
  enabled: boolean;
  name: string;                   // Human-readable label: "Meeting Reply"
  category: "availability" | "capability" | "catch_all";
  priority: number;              // Lower = evaluated first

  // Trigger (all fields optional, any can match)
  trigger: {
    keywords?: string[];          // ["meeting", "schedule", "calendar"]
    contactAiAccessLevel?: AiAccessLevel[];  // ["full"]
    messageContains?: string;     // Regex pattern
    isGreeting?: boolean;         // True for "hi", "hello", "howdy"
    isComplex?: boolean;          // True if LLM confidence is low
  };

  // Action
  action: {
    type: "draft" | "auto_send" | "gatekeep" | "defer";
    template?: string;            // Template with placeholders: "I'm busy at {time}, free at {free_time}"
    aiIdentityOverride?: AiIdentityMode;  // Override global identity for this rule
    vaultQuery?: {
      path: string;              // e.g., "/calendar", "/documents/work"
      maxSensitivity: Sensitivity;
    };
  };
}
```

### 4B. Pre-Built Rule Templates

The settings UI provides templates users can enable/disable:

**Availability Rules**

| Rule | Trigger | Action |
|------|---------|--------|
| Meeting Query | message contains "meeting", "schedule", "calendar" | Check vault `/calendar`, respond with availability |
| Out of Office | AI detects user is offline + greeting | `"Doing well! Alice is away — I'll let them know you pinged."` |

**Capability Rules**

| Rule | Trigger | Action |
|------|---------|--------|
| File Share (Trusted) | contact asks for files + AI Access Level = full | Share link from `/public` vault folder |
| Private Info Block | message contains "phone", "address", "password" | `"I can't share that. Please wait for Alice to respond."` |

**Catch-All**

| Rule | Trigger | Action |
|------|---------|--------|
| Low Confidence | LLM confidence < threshold | `"That sounds important. I've logged this for Alice to reply."` |
| Unknown Topic | no other rule matched + offline | Gatekeep: `"Alice is away. I've received your message and will notify them."` |

### 4C. Rule Builder UI

```
┌─────────────────────────────────────────────────────────────┐
│ AI Rules                                         [+ Add Rule]│
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 1. Meeting Query                         [✓] [✏️] [🗑️] │ │
│ │    Category: Availability    Priority: 1                  │ │
│ │    Trigger: message contains "meeting", "schedule"       │ │
│ │    Action: Check calendar vault, draft response         │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 2. Greeting (Away)                      [✓] [✏️] [🗑️] │ │
│ │    Category: Availability    Priority: 2                  │ │
│ │    Trigger: isGreeting + user offline                   │ │
│ │    Action: "Doing well! Alice is away..."               │ │
│ └─────────────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ 3. Private Info Block                   [✓] [✏️] [🗑️] │ │
│ │    Category: Capability    Priority: 10                 │ │
│ │    Trigger: message contains "phone", "address"          │ │
│ │    Action: "I can't share that..."                      │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Add/Edit Rule Modal**:

```
┌─────────────────────────────────────────────────────────────┐
│ Edit Rule                                               [×] │
├─────────────────────────────────────────────────────────────┤
│ Name: [Meeting Query                                  ]   │
│ Category: [Availability ▼]                               │
│ Priority: [1] (lower = evaluated first)                    │
│                                                             │
│ ── Triggers (any match) ──                                │
│ Keywords: [meeting] [schedule] [calendar] [+ add]          │
│ Contact AI Access: [▼ Select...]                          │
│ Message Pattern: [.*book.*flight.* ]                       │
│ □ Greeting only                                            │
│                                                             │
│ ── Action ──                                              │
│ Type: [Draft with vault lookup ▼]                          │
│ Vault Path: [/calendar                               ]      │
│ Max Sensitivity: [friends ▼]                               │
│ Response Template:                                         │
│ ┌───────────────────────────────────────────────────────┐ │
│ │ I'm busy at {meeting_time}, but free at {free_time}.   │ │
│ └───────────────────────────────────────────────────────┘ │
│                                                             │
│ □ Override AI Identity for this rule                       │
│   Mode: [Defensive ▼]                                     │
│                                                             │
│                                        [Cancel] [Save Rule]│
└─────────────────────────────────────────────────────────────┘
```

### 4D. Default Rules (Shipped with App)

```typescript
const DEFAULT_AI_RULES: AiRule[] = [
  {
    id: "greeting-away",
    enabled: true,
    name: "Greeting (Away)",
    category: "availability",
    priority: 1,
    trigger: { isGreeting: true },
    action: {
      type: "auto_send",
      template: "Doing well! {ownerName} is away — I'll let them know you pinged.",
    },
  },
  {
    id: "private-info-block",
    enabled: true,
    name: "Private Info Block",
    category: "capability",
    priority: 10,
    trigger: { keywords: ["phone", "address", "password", "ssn", "credit card"] },
    action: {
      type: "auto_send",
      template: "I can't share that. Please wait for {ownerName} to respond.",
      aiIdentityOverride: "defensive",
    },
  },
  {
    id: "low-confidence-defer",
    enabled: true,
    name: "Low Confidence Defer",
    category: "catch_all",
    priority: 100,
    trigger: { isComplex: true },
    action: {
      type: "defer",
      template: "That sounds important. I've logged this for {ownerName} to reply to later.",
    },
  },
  {
    id: "catch-all-gatekeep",
    enabled: true,
    name: "Away Gatekeep",
    category: "catch_all",
    priority: 999,
    trigger: {},
    action: {
      type: "gatekeep",
      template: "{ownerName} is away. I've received your message and will notify them when they're back.",
    },
  },
];
```

---

## 5. Context Injector (Technical Implementation)

When generating a response, the system builds a **prompt context** by stacking:

1. **Global system prompt** (based on AI Identity mode)
2. **User context** (owner name, online/offline status)
3. **Contact context** (from ContactAiPreferences)
4. **Matching rules** (as system instructions)
5. **Vault data** (if rule requires it)
6. **Incoming message**

```typescript
function buildAiContext(input: {
  ownerName: string;
  isOnline: boolean;
  identity: AiIdentity;
  contactPrefs: ContactAiPreferences;
  rules: AiRule[];
  vaultData?: Record<string, unknown>;
  incomingMessage: string;
}): string {
  const { ownerName, isOnline, identity, contactPrefs, rules, vaultData, incomingMessage } = input;

  // 1. Base identity
  let context = buildIdentitySystemPrompt(identity, ownerName);

  // 2. Availability status
  context += `\n\nUser status: ${isOnline ? "ONLINE (assistant mode — suggest drafts only)" : "OFFLINE (agent mode — may auto-reply)"}`;

  // 3. Contact permissions
  context += `\n\nContact permissions:`;
  context += `\n- AI Access Level: ${contactPrefs.aiAccessLevel}`;
  context += `\n- Knowledge Access: ${contactPrefs.knowledgeAccess}`;
  context += `\n- Priority: ${contactPrefs.priority}`;

  // 4. Matching rules (as instructions)
  const matchingRules = rules
    .filter(r => r.enabled)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5); // Cap at 5 rules to avoid prompt bloat

  if (matchingRules.length > 0) {
    context += `\n\nActive rules (evaluate in order):`;
    for (const rule of matchingRules) {
      context += `\n- [${rule.name}]`;
      if (rule.action.template) {
        context += ` Response template: "${rule.action.template}"`;
      }
    }
  }

  // 5. Vault data (if any)
  if (vaultData && Object.keys(vaultData).length > 0) {
    context += `\n\nRelevant data from vault:`;
    context += `\n${JSON.stringify(vaultData, null, 2)}`;
  }

  // 6. The actual message
  context += `\n\nIncoming message from contact:\n"${incomingMessage}"`;

  return context;
}
```

### Prompt Examples by Mode

**Invisible Mode (Online)**:
```
You are {ownerName}. Respond naturally as if you are them.
Keep replies short (1-3 sentences).
Match the tone of the conversation.
Do not reveal private information.

User status: ONLINE (assistant mode — suggest drafts only)

Contact permissions:
- AI Access Level: full
- Knowledge Access: personal
- Priority: low

Incoming message:
"Hey, what time is the meeting tomorrow?"
```

**Transparent Mode (Offline)**:
```
You are {ownerName}'s AI assistant. Prefix every response with "[AI Agent]:".
Be helpful and concise. When {ownerName} is unavailable, politely assist callers.

User status: OFFLINE (agent mode — may auto-reply)

Contact permissions:
- AI Access Level: full
- Knowledge Access: professional
- Priority: low

Active rules:
- [Greeting (Away)] Response template: "Doing well! {ownerName} is away..."
- [Private Info Block] Response template: "I can't share that..."

Incoming message:
"Hi! Is Alice around?"
```

---

## 6. Data Model Changes

### 6A. New Types (packages/api/src/ws-protocol.ts)

```typescript
// AI Assistant Status
export interface AiAssistantStatus {
  onlineAssistantEnabled: boolean;
  offlineAgentEnabled: boolean;
  statusMode: "automatic" | "manual";
  isOnline: boolean;
}

// AI Identity
export type AiIdentityMode = "invisible" | "transparent" | "defensive";

export interface AiIdentity {
  mode: AiIdentityMode;
  transparentPrefix?: string;
}

// Contact AI Preferences (stored locally per device)
export interface ContactAiPreferences {
  peerOwnerId: string;
  aiAccessLevel: "none" | "assistant_only" | "full";
  knowledgeAccess: "public" | "professional" | "personal";
  priority: "high" | "low";
}

// AI Rule
export type AiRuleCategory = "availability" | "capability" | "catch_all";

export interface AiRuleTrigger {
  keywords?: string[];
  contactAiAccessLevel?: Array<"none" | "assistant_only" | "full">;
  messageContains?: string;
  isGreeting?: boolean;
  isComplex?: boolean;
}

export type AiRuleActionType = "draft" | "auto_send" | "gatekeep" | "defer";

export interface AiVaultQuery {
  path: string;
  maxSensitivity: "public" | "friends" | "personal";
}

export interface AiRuleAction {
  type: AiRuleActionType;
  template?: string;
  aiIdentityOverride?: AiIdentityMode;
  vaultQuery?: AiVaultQuery;
}

export interface AiRule {
  id: string;
  enabled: boolean;
  name: string;
  category: AiRuleCategory;
  priority: number;
  trigger: AiRuleTrigger;
  action: AiRuleAction;
}

// Node Config additions
export interface AiSettings {
  status: AiAssistantStatus;
  identity: AiIdentity;
  rules: AiRule[];
  defaultModeForNewContacts: "manual" | "assistant" | "auto";
}
```

### 6B. NodeConfig Additions

```typescript
// In UpdateNodeConfigParams and NodeConfig
interface NodeConfig {
  // ... existing fields ...

  // New AI settings
  aiSettings?: AiSettings;
}
```

### 6C. Storage Files

| File | Location | Contents |
|------|----------|----------|
| `ai-settings.json` | Profile dir | Global AI settings, rules, identity |
| `contact-ai-preferences.jsonl` | Profile dir | One line per contact's AI preferences |

---

## 7. Files to Modify

### packages/api/src/ws-protocol.ts
- Add `AiAssistantStatus`, `AiIdentity`, `AiIdentityMode`, `ContactAiPreferences`, `AiRule`, `AiRuleTrigger`, `AiRuleAction`, `AiSettings` types
- Add `aiSettings?: AiSettings` to `NodeConfig` and `UpdateNodeConfigParams`

### packages/local-store/src/
- Add `LocalContactAiPreferencesStore` class with `get()`, `set()`, `delete()` methods
- Update `LocalNodeConfigStore` to handle `aiSettings`

### apps/node/src/
- `index.ts`: Add AI status detection (activity-based online/offline)
- `chat-draft-inbound.ts`: Integrate rule builder, context injector, vault queries
- `auto-reply-inbound.ts` (new): Handle offline auto-reply logic
- `rule-engine.ts` (new): Rule matching and evaluation
- `context-injector.ts` (new): Build prompts from rules + context

### apps/social/src/
- `App.tsx`: Add Assistant Switch UI, AI Settings tab
- `components/AssistantSwitch.tsx` (new): The per-chat toggle
- `components/AiSettings.tsx` (new): Global AI settings page
- `components/ContactAiPrefs.tsx` (new): Per-contact AI preferences
- `components/RuleBuilder.tsx` (new): Rule editor UI

### packages/api/src/node-service.ts
- Add `updateAiSettings()`, `getAiSettings()`, `getContactAiPreferences()`, `updateContactAiPreferences()` methods to `NodeService` interface

### apps/node/src/node-service-impl.ts
- Implement new AI settings methods

---

## 8. Implementation Phases

### Phase 1: Assistant Switch + Basic Draft Generation
- Add Assistant Switch UI component (Manual / Assistant / Auto-Reply toggle)
- Connect Assistant mode to existing `generateChatDraft()` flow
- Ensure Auto-Reply is gated by contact permission check

### Phase 2: AI Identity + Global Settings Page
- Add AI Identity modes to prompt generation
- Create Settings → AI tab with Online/Offline toggles and Identity selector
- Store settings in `aiSettings.json`

### Phase 3: Per-Chat Permissions
- Add `ContactAiPreferences` storage
- Create Contact Info → AI Access panel
- Enforce AI Access Level in draft generation

### Phase 4: Rule Builder
- Add `AiRule` schema and storage
- Create Rule Builder UI with template rules
- Implement rule matching engine

### Phase 5: Context Injector + Vault Integration
- Build context injection from rules + contact prefs + vault data
- Integrate vault queries into rule actions
- End-to-end offline auto-reply flow

### Phase 6: Online/Offline Detection
- Implement activity-based detection (keyboard/mouse events)
- Add manual status override option
- Sync status changes to rule evaluation

---

## 9. Backward Compatibility

- Existing `autonomousKillSwitch` and `autonomousPolicies` remain functional
- New `aiSettings` is additive — if absent, system falls back to existing autonomous policy behavior
- Per-chat Assistant Switch defaults to **Manual** mode (safest)
- Existing `chatAssistEnabled` is effectively replaced by the more granular Assistant Switch, but the global toggle remains as a master kill switch for draft generation

---

## 10. Security Considerations

1. **Sensitivity ceiling enforcement**: Rules with vault queries must respect `knowledgeAccess` level
2. **Audit logging**: Every auto-reply is logged with rule ID, contact, and timestamp
3. **Kill switch**: `autonomousKillSwitch: true` still blocks ALL autonomous actions
4. **No auto-send without explicit contact permission**: Auto-Reply mode is only available when `aiAccessLevel === "full"`
5. **Private info rules**: Ship with strong defaults to prevent accidental disclosure
