# Envoy Harness UX Design and Implementation Plan

Status: Proposed  
Owners: EnvoyMesh + envoy-harness maintainers  
Scope: Social desktop, EnvoyGo mobile, Envoy Terminal, and the standalone harness TUI

## 1. Objective

Deliver a coherent coding-agent experience across every Envoy surface. Users
must always understand:

1. What the agent is doing.
2. Whether it needs input.
3. What changed.
4. Whether verification passed.
5. Which model, device, or peer did the work.
6. Where detailed evidence can be inspected.

The target quality bar is the clarity and responsiveness of Codex and Claude
Code, adapted for EnvoyMesh's local-first, multi-device, and peer-execution
model.

## 2. Product principles

- Conversation first: final answers and decisions remain readable.
- Progressive disclosure: tools and logs begin compact and expand on demand.
- Safe by construction: approvals expose scope, risk, and permission lifetime.
- One behavior, many renderers: every client consumes the same semantic model.
- Mobile is a control surface: monitoring, approval, review, and redirection are
  more important than reproducing a desktop IDE.
- Distributed work is attributable: device, peer, model, authority, and shared
  data are inspectable.
- Recovery is visible: reconnecting and restored work are explicit states.

## 3. Shared UX contract

### 3.1 Semantic timeline

Introduce `EhTimelineItem` in `@envoymesh/api`. Persist stable IDs and use the
same schema for history snapshots and live events.

```ts
type EhTimelineItem =
  | EhMessageItem
  | EhActivityGroupItem
  | EhApprovalItem
  | EhQuestionItem
  | EhChangeSetItem
  | EhCompletionItem
  | EhErrorItem;

interface EhTimelineBase {
  id: string;
  chatId: string;
  turnId?: string;
  createdAt: string;
  updatedAt?: string;
}
```

Required item semantics:

| Item | Purpose | Default presentation |
|---|---|---|
| Message | User or assistant content | Expanded |
| Activity group | Tool calls, progress, output | Compact, expandable |
| Approval | Permission decision | Expanded and blocking |
| Question | Agent request for user input | Expanded and blocking |
| Change set | Files and diff statistics | Compact summary |
| Completion | Result, verification, cost/duration | Expanded summary |
| Error | Failure, cancellation, disconnection | Expanded with recovery |

History must return the same items the live stream produces. Renderers must not
reconstruct relationships from array indexes or display text.

### 3.2 Agent state machine

Use one state model everywhere:

```text
ready
  -> submitting
  -> thinking
  -> running_tool
  -> waiting_for_approval | waiting_for_answer
  -> thinking | running_tool
  -> verifying
  -> completed | failed | cancelled

Any active state -> reconnecting -> restored active state | failed
```

State includes a short label, optional activity summary, elapsed time, and the
current execution identity.

### 3.3 Command behavior

- Send while idle: start immediately.
- Send while busy: queue by default.
- Inject: cancel the current turn and send the new instruction.
- Cancel: stop the current turn without clearing queued items.
- Clear queue: explicit action with no effect on the active turn.
- Reset chat: creates a new persisted session after confirmation.
- Delete turn: removes a logical exchange and dependent tool records.

These rules apply identically in Social, EnvoyGo, and TUI.

## 4. Interaction design

### 4.1 Persistent context bar

Display:

```text
Envoy Harness · project · branch · model · execution location · state
```

On narrow screens show project and state; reveal the remaining fields in a
details sheet. Never rely on color alone.

### 4.2 Tool activity cards

Group consecutive activities by tool invocation:

```text
✓ Read 4 files
⚙ Running npm test · 18s
✗ Build failed                         View output
```

Expanded details include tool name, sanitized arguments, start/end time,
output, exit status, peer/device, and retry action. Streaming progress updates
the existing item rather than adding rows.

### 4.3 Approval cards

Every approval shows:

- Human-readable action.
- Exact command or affected paths.
- Workspace and execution device.
- Network requirement.
- Risk explanation.
- Permission lifetime.

Actions:

```text
Deny | Allow once | Allow for this turn
```

Persistent policy changes remain in Settings and require confirmation.
`Always approve` uses warning styling and cannot be selected accidentally from
a compact menu.

### 4.4 User questions

Questions support two to three recommended choices plus free-form input. The
card stays visible after navigation and reconnection. Submitting disables the
card until acknowledged; delivery errors restore the input.

### 4.5 Changes and completion

Each completed coding turn ends with:

```text
Completed · 3 files changed · +18 −4 · 31 tests passed
[Review changes] [Continue] [Revert turn]
```

`Revert turn` is enabled only when an exact change set/checkpoint exists and
must preview affected paths before execution.

### 4.6 Errors and recovery

Distinguish model failure, tool failure, cancellation, transport loss, and host
shutdown. A reconnecting client shows the last known activity and polls the
turn status. On restoration it merges by stable item ID, never duplicates
messages, and announces `Reconnected · work still running`.

## 5. Surface-specific design

### 5.1 Social desktop

- Main transcript contains messages, blocking cards, and completion summaries.
- Tool details live in collapsible timeline groups.
- Diff panel supports file navigation, side-by-side/unified modes, and copy
  path.
- Keyboard shortcuts: command palette, cancel, changed files, jobs, transcript
  search, and tool expansion.
- Desktop may show transcript and diff simultaneously.

### 5.2 EnvoyGo mobile

- Optimize for approve, answer, monitor, review, queue, cancel, and notify.
- Keep blocking cards above the composer and keyboard.
- Replace horizontal command-chip overload with a single action/command menu.
- Use bottom sheets for tool details, peer attribution, and large diffs.
- Add haptics and local notifications for approval, question, failure, and
  completion.
- Persist drafts and queued prompts per `chatId`.
- Show `Running on <device>` and offline/reconnecting state.
- Provide code copy, file list, focused diff hunks, and open-on-desktop actions.

### 5.3 Envoy Terminal

- Terminal remains raw execution output.
- Native overlay owns approvals, questions, state, follow-ups, and EHUI panels.
- Events are scoped by explicit `chatId`/terminal session ID before rendering.
- The overlay can collapse to a one-line state bar.

### 5.4 Standalone TUI

Detailed behavior is specified in the companion envoy-harness document:
`packages/envoy-harness-tui/docs/ux-design.md`.

## 6. Distributed execution UX

Every remote activity records:

- Executor peer/device and owner label.
- Model/runtime.
- Trust relationship.
- Authority or mandate used.
- Data categories shared.
- Verification status.

Compact attribution:

```text
Reviewed by Alice's Mac · DeepSeek V3 · Direct trust · verified
```

Multi-agent work uses an execution graph with status per node. The transcript
still shows one synthesized completion; the graph is evidence, not the primary
conversation.

## 7. Architecture

```text
envoy-harness ACP events
        |
EnvoyMesh host normalizer
        |
EhTimelineItem store + snapshot
        |
WebSocket events with stable IDs
        |
  +-----+----------+-------------+
  |                |             |
Social renderer  EnvoyGo       TUI adapter
```

Rules:

- Normalize once at the host boundary.
- Persist before broadcasting completion-critical items.
- Event delivery is at-least-once; clients deduplicate by item ID.
- Updates carry `updatedAt` and replace prior versions.
- Sensitive arguments/output are redacted before transport.
- UI components never parse provider-specific payloads.

## 8. Implementation plan

### Phase 0 — Contract and safety foundation

Deliverables:

- Define timeline, state, activity, approval, question, change, and completion
  schemas.
- Add stable IDs and chat/turn scoping to all events.
- Provide snapshot + incremental-event parity tests.
- Define redaction and payload-size limits.

Exit criteria:

- Social and EnvoyGo render a recorded fixture identically in meaning.
- Replaying events twice creates no duplicates.
- Cross-chat approval tests prove isolation.

### Phase 1 — Blocking interactions and recovery

Deliverables:

- Shared approval and question controllers.
- Reconnection/status restoration.
- Consistent queue/inject/cancel semantics.
- Draft and queue persistence on mobile.

Exit criteria:

- A turn can disconnect during approval, reconnect, answer, and finish.
- Navigating between five chats never leaks events.

### Phase 2 — Tool timeline and completion summary

Deliverables:

- Collapsible activity groups.
- Elapsed progress and output details.
- Change-set and verification summaries.
- Structured error/retry actions.

Exit criteria:

- Long tool runs update one row.
- Completion accurately reports files and tests.

### Phase 3 — Review workflow

Deliverables:

- File list and focused diffs on every surface.
- Open/copy/share-on-desktop actions.
- Checkpoint-backed revert-turn flow.
- Transcript search and turn actions.

Exit criteria:

- Users can inspect every changed hunk before approving or reverting.

### Phase 4 — Distributed execution

Deliverables:

- Peer/device attribution.
- Authority and shared-data disclosure.
- Execution graph and verification badges.
- Remote cancellation/retry behavior.

Exit criteria:

- Every remote result is attributable and its authorization inspectable.

### Phase 5 — Polish and accessibility

Deliverables:

- Keyboard map, screen-reader labels, high contrast, reduced motion.
- CJK/emoji/RTL and dynamic-type coverage.
- Mobile haptics/notifications.
- Performance budgets and virtualization.

## 9. Test strategy

Maintain one cross-surface fixture suite covering:

1. Resume a persisted conversation.
2. Stream assistant content.
3. Run a tool with progress.
4. Request and grant approval.
5. Ask and answer a question.
6. Produce file changes and test results.
7. Queue a follow-up.
8. Disconnect and reconnect.
9. Cancel or inject.
10. Complete through a remote peer.

Required layers:

- Schema and reducer unit tests.
- Renderer golden/snapshot tests.
- Social component tests.
- EnvoyGo widget and semantics tests.
- TUI layout/keymap tests across terminal sizes.
- Host-to-client integration tests.
- Two-device reconnect and notification smoke tests.

## 10. Metrics and performance budgets

- Input-to-local-echo: under 100 ms.
- Streaming update cadence: 50–150 ms batching.
- Approval display after host event: under 500 ms on LAN.
- Reconnect state visible: under 1 second.
- Restored timeline after reconnect: under 3 seconds for 1,000 items.
- No dropped drafts or duplicate completion cards.
- Track approval abandonment, cancellation success, recovery success, time to
  first visible activity, and time from completion to diff review.

Telemetry must exclude prompt content, commands, paths, and tool output unless
the owner explicitly enables diagnostic capture.

## 11. Recommended first implementation slice

Implement Phase 0 and the smallest Phase 1 vertical slice together:

1. Add `EhTimelineItem` and `EhAgentState` schemas.
2. Normalize current ACP events into the new contract.
3. Implement a shared reducer in TypeScript and a Dart equivalent validated by
   common JSON fixtures.
4. Migrate approval/question rendering in Social and EnvoyGo.
5. Add reconnect replay and deduplication.
6. Keep the current transcript APIs behind an adapter during migration.

This slice reduces correctness risk before visual polish and gives every later
feature a stable foundation.

