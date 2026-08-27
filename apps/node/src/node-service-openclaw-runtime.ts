/**
 * OpenClaw runtime — gateway lifecycle, webhook ask/send, sync reply correlation.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ChildProcess } from "node:child_process";
import type {
  BondRecord,
  BridgeStatus,
  ChatMessage,
  NodeConfig,
  NodeProfile,
  OwnerAgentTurnResult,
} from "@envoymesh/api";
import {
  ENVOY_AI_THREAD_KEY,
  OWNER_FAMILY_PROFILE_ID,
  inferModelProviderPreset,
  resolveEnvoyLocalServerParams,
} from "@envoymesh/api";
import type {
  AgentIdentityStore,
  CapabilityManifestStore,
  HumanProfileStore,
  LocalChatLogStore,
  LocalTrustStore,
} from "@envoymesh/local-store";
import type { EnvoyMesh } from "@envoymesh/network";
import type { OpenClawRuntime } from "@envoymesh/openclaw-runtime";
import { resolveBundledSkillsDir } from "./bundled-paths.js";
import { resolveAssistantAgentUrl } from "./bridge/config.js";
import {
  loadBridgeConfigSkillApiKeys,
  loadBridgeConfigWebSearchEnabled,
} from "./node-service-clawhub.js";
import { BRIDGE_HTTP_PORT, OPENCLAW_GATEWAY_PORT, openClawGatewayWebhookUrl } from "./service-ports.js";
import { buildEnvoyMeshRetrievedContext } from "./openclaw-turn-context.js";
import {
  buildOpenClawGatewayAgentSection,
  buildOpenClawGatewayModelSection,
  buildOpenClawGatewaySearchEnv,
  buildOpenClawGatewaySkillEntries,
  isOpenClawEnvoymeshWebhookReady,
  resolveActiveWebSearchProvider,
} from "./openclaw-gateway-config.js";
import { reclaimAssistantGatewayPort } from "./openclaw-gateway-port.js";
import { spawnOpenClawGateway } from "./openclaw-gateway-spawn.js";
import { ensureOpenClawWorkspace, openClawGatewayStateDir } from "./openclaw-workspace.js";
import { getRpcCaller } from "./rpc-caller-context.js";
import type { RagService } from "./rag-service.js";
import type { PersistedNodeConfig } from "./node-config-store.js";

export const OPEN_CLAW_REPLY_TIMEOUT_MS = 180_000;
export const OPEN_CLAW_RETRIEVED_CONTEXT_TIMEOUT_MS = 25_000;
export const OPEN_CLAW_STARTUP_PROBE_ATTEMPTS = 90; // 90 × 1s = 90 seconds for cold start
export const OPEN_CLAW_WATCHDOG_INTERVAL_MS = 60_000; // 1 minute between watchdog checks
export const OPEN_CLAW_MAX_RESTART_ATTEMPTS = 5; // stop watchdog after 5 consecutive failures
export const OPEN_CLAW_RESTART_BACKOFF_BASE_MS = 10_000; // 10s after 1st failure, 20s after 2nd, … cap 60s
export const OPEN_CLAW_WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS = 4;
const OPEN_CLAW_WEBHOOK_RATE_LIMIT_BASE_MS = 1_000;

function parseRetryAfterMs(retryAfter: string | null): number | undefined {
  if (!retryAfter?.trim()) return undefined;
  const seconds = Number(retryAfter.trim());
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const dateMs = Date.parse(retryAfter.trim());
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return undefined;
}

async function sleepMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

/** POST the OpenClaw webhook with bounded retry on 429 / 503 (+ Retry-After). */
export async function postOpenClawWebhook(
  url: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? OPEN_CLAW_REPLY_TIMEOUT_MS;
  let lastResp: Response | undefined;
  for (let attempt = 0; attempt < OPEN_CLAW_WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS; attempt++) {
    const resp = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (resp.status !== 429 && resp.status !== 503) {
      return resp;
    }
    lastResp = resp;
    if (attempt + 1 >= OPEN_CLAW_WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS) break;
    const retryAfterMs =
      parseRetryAfterMs(resp.headers.get("retry-after")) ??
      OPEN_CLAW_WEBHOOK_RATE_LIMIT_BASE_MS * 2 ** attempt;
    console.warn(
      `[openclaw] webhook ${resp.status} — retry ${attempt + 1}/${OPEN_CLAW_WEBHOOK_RATE_LIMIT_MAX_ATTEMPTS - 1} in ${retryAfterMs}ms`,
    );
    await sleepMs(retryAfterMs);
  }
  return lastResp!;
}

export type OpenClawPendingReply = {
  resolve: (text: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export interface OpenClawRuntimeState {
  runtime: OpenClawRuntime | null;
  gatewayChild: ChildProcess | null;
  gatewayReady: boolean;
  startPromise: Promise<boolean> | null;
  assistantAgentUrl: string;
  assistantAgentSecret: string | undefined;
  pendingReplies: Map<string, OpenClawPendingReply>;
  activeTurnTools: string[] | null;
  askInFlight: number;
  gatewayRouteRegistered: boolean;
  lastProbeWarnAt: number;
  askChain: Promise<unknown>;
  watchdogTimer: ReturnType<typeof setTimeout> | null;
  watchdogRunning: boolean;
  /**
   * Optional filesystem path used to persist outstanding sync-reply
   * correlation ids. Set via `bindOpenClawPendingReplyPersistence` so the
   * node-host can decide where to write (typically `<profileDir>/openclaw-pending-replies.json`).
   */
  pendingRepliesPath: string | null;
  /**
   * Last stop/failure reason (port in use, spawn failure, probe fail, etc).
   * Cleared on a successful start. Surfaced via `getOpenClawStatus()` so the
   * AI → AI Engine settings page can show operators *why* the runtime is
   * "Stopped" instead of just displaying the status badge.
   */
  lastError: string | null;
  /** ISO timestamp of `lastError`. Cleared together with `lastError`. */
  lastErrorAt: string | null;
  /**
   * Consecutive restart attempts since the last successful start.
   * Reset to 0 on success. Lets the UI flag a watchdog that's in a fail loop.
   */
  consecutiveRestartFailures: number;
  /**
   * Set when the gateway exits immediately because its port is already in use
   * by another running instance. The watchdog checks this flag and stops the
   * restart loop to prevent an infinite EADDRINUSE cycle. Cleared on a
   * successful start or when a user explicitly requests a restart.
   */
  watchdogPortConflict: boolean;
  /**
   * Ring buffer of the last N stderr lines from the gateway child process.
   * Used in error diagnostics — when the startup probe times out or the
   * gateway crashes, the error message includes the gateway's stderr output
   * for immediate diagnosis instead of a generic "port may be in use".
   */
  lastGatewayStderr: string[];
  /**
   * Last gateway child exit observed (code/signal). Kept after `gatewayChild`
   * is cleared so the startup probe can report "exited code N" instead of the
   * misleading "Gateway child is null".
   */
  lastGatewayExit: { code: number | null; signal: NodeJS.Signals | null; at: number } | null;
}

/**
 * Module-level set of all currently-running OpenClaw gateway children that
 * THIS process has spawned. Used by the `process.on("exit", ...)` hook below
 * to guarantee the gateway is killed even when the parent process exits via
 * a path that bypasses `stopOpenClawViaRuntime` (e.g. an unhandled rejection
 * that calls `process.exit(1)`, or a Tauri-side SIGTERM that races with the
 * graceful shutdown chain).
 *
 * `process.on("exit")` is the right hook: it runs synchronously on every
 * normal exit (including `process.exit(0)`), and can only do sync work —
 * which is exactly what `child.kill("SIGKILL")` is. The OS reaps the child
 * asynchronously; the next-start orphan cleanup picks up any lock residue.
 * SIGKILL of the parent itself cannot be caught here, but Tauri is the
 * parent of node, not us, and Tauri already sends SIGTERM to node first.
 */
const activeOpenClawGatewayChildren = new Set<ChildProcess>();
let openClawExitHookInstalled = false;

function installOpenClawExitHookOnce(): void {
  if (openClawExitHookInstalled) return;
  openClawExitHookInstalled = true;
  process.on("exit", () => {
    for (const child of activeOpenClawGatewayChildren) {
      if (child.killed || child.exitCode != null || child.signalCode != null) continue;
      try {
        child.kill("SIGKILL");
      } catch {
        /* best-effort — child may have just exited, or we may lack permission */
      }
    }
  });
}

function trackOpenClawGatewayChild(child: ChildProcess): void {
  installOpenClawExitHookOnce();
  activeOpenClawGatewayChildren.add(child);
  child.once("exit", () => {
    activeOpenClawGatewayChildren.delete(child);
  });
}

export function createOpenClawRuntimeState(): OpenClawRuntimeState {
  return {
    runtime: null,
    gatewayChild: null,
    gatewayReady: false,
    startPromise: null,
    assistantAgentUrl: openClawGatewayWebhookUrl(),
    assistantAgentSecret: undefined,
    pendingReplies: new Map(),
    activeTurnTools: null,
    askInFlight: 0,
    gatewayRouteRegistered: false,
    lastProbeWarnAt: 0,
    askChain: Promise.resolve(),
    watchdogTimer: null,
    watchdogRunning: false,
    pendingRepliesPath: null,
    lastError: null,
    lastErrorAt: null,
    consecutiveRestartFailures: 0,
    watchdogPortConflict: false,
    lastGatewayStderr: [],
    lastGatewayExit: null,
  };
}

/**
 * Record a runtime-level failure so the settings UI can surface the *why*
 * alongside the "Stopped" badge. Idempotent — overwrites prior values so the
 * most recent cause wins, which is what an operator wants to see.
 */
export function recordOpenClawError(state: OpenClawRuntimeState, reason: string): void {
  state.lastError = reason;
  state.lastErrorAt = new Date().toISOString();
  state.consecutiveRestartFailures += 1;
}

/** Clear the recorded error — called when the gateway reaches a healthy state. */
export function clearOpenClawError(state: OpenClawRuntimeState): void {
  state.lastError = null;
  state.lastErrorAt = null;
  state.consecutiveRestartFailures = 0;
  state.watchdogPortConflict = false;
  state.lastGatewayStderr = [];
}

/**
 * Push stderr output into the ring buffer (last 10 lines).
 * Called by the stderr listener on the gateway child process.
 */
const GATEWAY_STDERR_RING_SIZE = 10;
export function pushGatewayStderr(state: OpenClawRuntimeState, text: string): void {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    state.lastGatewayStderr.push(trimmed);
    if (state.lastGatewayStderr.length > GATEWAY_STDERR_RING_SIZE) {
      state.lastGatewayStderr.shift();
    }
  }
}

/**
 * Compute backoff delay before the next restart attempt.
 * 10s after 1st failure, 20s after 2nd, … cap at 60s.
 */
export function restartBackoffMs(consecutiveFailures: number): number {
  return Math.min(consecutiveFailures * OPEN_CLAW_RESTART_BACKOFF_BASE_MS, 60_000);
}

/**
 * Classify a gateway exit/crash reason from stderr output into a
 * human-readable diagnostic string.  Returns null if no specific
 * classification is found.
 */
export function classifyGatewayError(stderrLines: string[]): string | null {
  const joined = stderrLines.join("\n");
  if (joined.includes("ERR_MODULE_NOT_FOUND")) {
    const match = joined.match(/Cannot find package '([^']+)'/);
    const pkg = match?.[1] ?? "unknown";
    return `Missing package '${pkg}' — reinstall the app or rebuild the desktop bundle.`;
  }
  if (joined.includes("EADDRINUSE") || joined.includes("EACCES") || joined.includes("listen EADDRINUSE")) {
    return `Port conflict — another process is using the gateway port. Set ENVOYMESH_PORT_OFFSET (e.g. 100) to shift all ports.`;
  }
  if (joined.includes("Cannot find module") && joined.includes("imported from")) {
    const match = joined.match(/Cannot find module '([^']+)'/);
    const mod = match?.[1] ?? "unknown";
    return `Missing module '${mod}' — the OpenClaw bundle is incomplete. Reinstall the app.`;
  }
  return null; // no specific classification
}

/**
 * Bind a filesystem path used to persist outstanding sync-reply correlation
 * ids. After a node restart, the bridge can return 410 for any replies
 * whose correlationId is no longer in `state.pendingReplies` — this is the
 * signal for the gateway side to retry the ask with a fresh cid.
 */
export function bindOpenClawPendingReplyPersistence(
  state: OpenClawRuntimeState,
  pendingRepliesPath: string | null,
): void {
  state.pendingRepliesPath = pendingRepliesPath;
}

function persistPendingReplies(state: OpenClawRuntimeState): void {
  const path = state.pendingRepliesPath;
  if (!path) {
    return;
  }
  try {
    const payload = {
      version: 1,
      savedAt: Date.now(),
      correlationIds: Array.from(state.pendingReplies.keys()),
    };
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(payload), "utf8");
  } catch (err) {
    // Persistence is best-effort. Failing to write should not break the
    // sync-ask path — we just lose crash-recovery for this entry.
    console.warn(
      `[openclaw] failed to persist pending reply state: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function clearPersistedPendingReplies(state: OpenClawRuntimeState): void {
  const path = state.pendingRepliesPath;
  if (!path) {
    return;
  }
  try {
    if (existsSync(path)) {
      unlinkSync(path);
    }
  } catch {
    /* ignore */
  }
}

/**
 * On node startup, look for a leftover pending-replies file. Any cid that
 * arrives after this point will get a 410 from the bridge (because the
 * in-memory `state.pendingReplies` is empty), and the gateway will retry.
 * We log a warning so operators can correlate "stale 410s" with node
 * restarts in their logs.
 */
export function loadAndReportOrphanedOpenClawPendingReplies(
  pendingRepliesPath: string | null,
): string[] {
  if (!pendingRepliesPath || !existsSync(pendingRepliesPath)) {
    return [];
  }
  let parsed: { version?: number; correlationIds?: string[] } | null = null;
  try {
    parsed = JSON.parse(readFileSync(pendingRepliesPath, "utf8"));
  } catch {
    return [];
  }
  const cids = Array.isArray(parsed?.correlationIds) ? parsed!.correlationIds : [];
  if (cids.length > 0) {
    console.warn(
      `[openclaw] ${cids.length} pending sync reply correlationId(s) were lost ` +
        `across the last restart. The gateway will see 410 for any replies to those ` +
        `cids and the original ask will be retried automatically.`,
    );
  }
  // Remove the stale file so we don't keep logging on every restart.
  try {
    unlinkSync(pendingRepliesPath);
  } catch {
    /* ignore */
  }
  return cids;
}

export interface EnvoyAiChatContext {
  getProfile(): NodeProfile | undefined;
  getReachableMesh(): EnvoyMesh | undefined;
  getChatLogStore(): LocalChatLogStore | null;
  getHumanProfileStore(): HumanProfileStore;
  getBridgeStatus(): BridgeStatus | undefined;
  persistChatMessage(threadKey: string, msg: ChatMessage): void;
  emitChatMessage(msg: ChatMessage): void;
  /** Phase 51 — caller family profile id (defaults to owner). */
  getCallerFamilyProfileId?(): string;
  /** Phase 51 — display name for the caller (family name or owner HumanProfile). */
  getCallerDisplayName?(): Promise<string>;
  /** Phase 51 — whether the RPC caller is the owner profile. */
  isCallerOwnerProfile?(): boolean;
}

export function recordEnvoyAiChatMessageViaRuntime(
  ctx: EnvoyAiChatContext,
  msg: ChatMessage,
  threadKey: string = ENVOY_AI_THREAD_KEY,
): void {
  ctx.persistChatMessage(threadKey, msg);
  ctx.emitChatMessage(msg);
}

/** Store the owner's outbound EnvoyAI turn (before OpenClaw/native reply). */
export async function recordEnvoyAiHumanOutgoingViaRuntime(
  ctx: EnvoyAiChatContext,
  userText: string,
  messageId: string,
): Promise<void> {
  const trimmed = userText.trim();
  if (!trimmed) return;

  const profile = ctx.getProfile();
  const mesh = ctx.getReachableMesh();
  if (!profile || !mesh || !ctx.getChatLogStore()) {
    return;
  }

  let displayName = profile.owner.ownerId;
  try {
    const human = await ctx.getHumanProfileStore().loadHumanProfile();
    if (human?.displayName?.trim()) {
      displayName = human.displayName.trim();
    }
  } catch {
    /* use ownerId */
  }

  const bridgeAgentPeerId = ctx.getBridgeStatus()?.agentPeerId?.trim() || ENVOY_AI_THREAD_KEY;
  recordEnvoyAiChatMessageViaRuntime(ctx, {
    messageId,
    sender: {
      nodeId: mesh.peerId,
      ownerId: profile.owner.ownerId,
      displayName,
      actorRole: "human",
    },
    recipient: {
      nodeId: bridgeAgentPeerId,
      ownerId: ENVOY_AI_THREAD_KEY,
      displayName: "EnvoyAI",
    },
    content: { text: trimmed },
    metadata: {
      timestamp: new Date().toISOString(),
      deliveryReceipt: "delivered",
      deliveryChannel: "ai",
    },
    signature: "",
  });
}

export async function loadEnvoyAiChatHistoryViaRuntime(
  ctx: EnvoyAiChatContext,
  limit?: number,
  threadKey: string = ENVOY_AI_THREAD_KEY,
): Promise<ChatMessage[]> {
  const chatLogStore = ctx.getChatLogStore();
  if (!chatLogStore) return [];
  const primary = await chatLogStore.listThread(threadKey, limit);
  // Owner profile: also merge legacy bare `__envoy_ai__` when reading namespaced key.
  if (threadKey !== ENVOY_AI_THREAD_KEY && threadKey.startsWith(`${ENVOY_AI_THREAD_KEY}:`)) {
    const legacy = await chatLogStore.listThread(ENVOY_AI_THREAD_KEY, limit);
    if (legacy.length > 0 && threadKey.endsWith(":owner")) {
      const byId = new Map<string, ChatMessage>();
      for (const row of legacy) byId.set(row.messageId, row as ChatMessage);
      for (const row of primary) byId.set(row.messageId, row as ChatMessage);
      return [...byId.values()].sort(
        (a, b) =>
          new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime(),
      );
    }
  }
  const legacyPeerId = ctx.getBridgeStatus()?.agentPeerId?.trim();
  if (!legacyPeerId || legacyPeerId === ENVOY_AI_THREAD_KEY || threadKey !== ENVOY_AI_THREAD_KEY) {
    return primary as ChatMessage[];
  }
  const legacy = await chatLogStore.listThread(legacyPeerId, limit);
  if (legacy.length === 0) {
    return primary as ChatMessage[];
  }
  const byId = new Map<string, ChatMessage>();
  for (const row of legacy) {
    const meta = (row as ChatMessage).metadata;
    if (meta?.deliveryChannel === "agent") continue;
    const senderOwnerId = (row as ChatMessage).sender?.ownerId?.trim();
    if (senderOwnerId && senderOwnerId !== legacyPeerId) continue;
    byId.set(row.messageId, row as ChatMessage);
  }
  for (const row of primary) {
    byId.set(row.messageId, row as ChatMessage);
  }
  return [...byId.values()].sort(
    (a, b) =>
      new Date(a.metadata.timestamp).getTime() - new Date(b.metadata.timestamp).getTime(),
  );
}

export async function persistEnvoyAiChatExchangeViaRuntime(
  ctx: EnvoyAiChatContext,
  userText: string,
  turn: OwnerAgentTurnResult,
  humanMessageId?: string,
  threadKey: string = ENVOY_AI_THREAD_KEY,
): Promise<void> {
  const profile = ctx.getProfile();
  const mesh = ctx.getReachableMesh();
  if (!profile || !mesh || !ctx.getChatLogStore()) {
    return;
  }

  const trimmed = userText.trim();
  const answer = turn.answer.trim();
  if (!trimmed && !answer) {
    return;
  }

  let selfHuman: Awaited<ReturnType<HumanProfileStore["loadHumanProfile"]>> | null = null;
  try {
    selfHuman = await ctx.getHumanProfileStore().loadHumanProfile();
  } catch {
    /* ignore */
  }

  const ownerId = profile.owner.ownerId;
  const callerProfileId =
    ctx.getCallerFamilyProfileId?.()?.trim() || OWNER_FAMILY_PROFILE_ID;
  const isOwnerCaller =
    ctx.isCallerOwnerProfile?.() ?? callerProfileId === OWNER_FAMILY_PROFILE_ID;
  let displayName = selfHuman?.displayName ?? ownerId;
  try {
    const callerName = await ctx.getCallerDisplayName?.();
    if (callerName?.trim()) displayName = callerName.trim();
  } catch {
    /* keep fallback */
  }
  // Family members are attributed by profile id so history / WS routing stay
  // profile-scoped; owner keeps the mesh ownerId (legacy Social behaviour).
  const humanSenderOwnerId = isOwnerCaller ? ownerId : callerProfileId;
  const humanTimestamp = new Date().toISOString();
  const aiTimestamp = new Date(Date.now() + 1).toISOString();
  const bridgeAgentPeerId = ctx.getBridgeStatus()?.agentPeerId?.trim() || ENVOY_AI_THREAD_KEY;
  const bridgeAgentId = ctx.getBridgeStatus()?.agentName?.trim();
  const assistantTurn: NonNullable<ChatMessage["metadata"]["assistantTurn"]> = {
    domain: turn.domain ?? "knowledge",
    intent: turn.intent,
    jobId: turn.jobId,
    correlationId: turn.correlationId,
    pendingApproval: turn.pendingApproval,
    routeId: turn.routeId,
    modelUsed: turn.modelUsed,
    format: turn.format,
    ...(turn.blocks?.length ? { blocks: turn.blocks } : {}),
  };

  if (trimmed && !humanMessageId) {
    recordEnvoyAiChatMessageViaRuntime(ctx, {
      messageId: randomUUID(),
      sender: {
        nodeId: mesh.peerId,
        ownerId: humanSenderOwnerId,
        displayName,
        actorRole: "human",
      },
      recipient: {
        nodeId: bridgeAgentPeerId,
        ownerId: threadKey,
        displayName: bridgeAgentId ?? "EnvoyAI",
      },
      content: { text: trimmed },
      metadata: {
        timestamp: humanTimestamp,
        deliveryReceipt: "delivered",
        deliveryChannel: "ai",
      },
      signature: "",
    }, threadKey);
  }

  if (answer) {
    recordEnvoyAiChatMessageViaRuntime(ctx, {
      messageId: randomUUID(),
      sender: {
        nodeId: bridgeAgentPeerId,
        ownerId: threadKey,
        displayName: "EnvoyAI",
        actorRole: "agent",
        agentVerified: true,
      },
      recipient: {
        nodeId: mesh.peerId,
        ownerId: humanSenderOwnerId,
        displayName,
      },
      content: { text: answer },
      metadata: {
        timestamp: aiTimestamp,
        deliveryReceipt: "delivered",
        deliveryChannel: "ai",
        assistantTurn,
      },
      signature: "",
    }, threadKey);
  }
}

export interface OpenClawRuntimeDeps extends EnvoyAiChatContext {
  getBonds(): Promise<BondRecord[]>;
  getNodeConfig(): Promise<NodeConfig>;
  /**
   * Cloud/Ollama from Settings, or Envoy Local when the sidecar is running.
   * Falls back to `getNodeConfig().modelProviders` when omitted.
   */
  getEffectiveModelProviders?: () => Promise<
    import("@envoymesh/api").ModelProviderConfig
  >;
  getRagService(): Promise<RagService | null>;
  loadBridgeConfigWebSearchEnabled(): Promise<boolean | undefined>;
  loadBridgeConfigSkillApiKeys(): Promise<Record<string, string> | undefined>;
  getProfileDir(): string;
  getProfileOwnerId(): string | undefined;
  getMeshPeerId(): string;
  getVaultDir(): string;
  humanProfileStore: HumanProfileStore;
  capabilityManifestStore: CapabilityManifestStore | null;
  agentIdentityStore: AgentIdentityStore | null;
  chatLogStore: LocalChatLogStore | null;
  trustStore: LocalTrustStore;
  loadConfig(): Promise<PersistedNodeConfig | undefined>;
}

export function buildOpenClawRuntimeDeps(host: any): OpenClawRuntimeDeps {
  return {
    getBonds: () => host.getBonds(),
    getNodeConfig: () => host.getNodeConfig(),
    getEffectiveModelProviders: () =>
      typeof host.getEffectiveModelProviders === "function"
        ? host.getEffectiveModelProviders()
        : host.getNodeConfig().then(
            (c: NodeConfig) =>
              c.modelProviders ?? { mode: "disabled" as const, presetId: "disabled" },
          ),
    getRagService: () => host._getRagService(),
    getReachableMesh: () => host._reachableMesh(),
    getChatLogStore: () => host._chatLogStore,
    getHumanProfileStore: () => host._humanProfileStore,
    getBridgeStatus: () => host._bridgeStatus ?? undefined,
    persistChatMessage: (threadKey, msg) => host._persistChatMessage(threadKey, msg),
    emitChatMessage: (msg) => host.emit("chat:message", msg),
    getCallerFamilyProfileId: () => host._callerFamilyProfileId(),
    getCallerDisplayName: () => host._callerFamilyDisplayName(),
    isCallerOwnerProfile: () => {
      const caller = getRpcCaller();
      if (caller) return caller.isOwnerProfile;
      return host._callerFamilyProfileId() === OWNER_FAMILY_PROFILE_ID;
    },
    loadBridgeConfigWebSearchEnabled: () => loadBridgeConfigWebSearchEnabled(),
    loadBridgeConfigSkillApiKeys: () => loadBridgeConfigSkillApiKeys(),
    getProfileDir: () => host._profileDir,
    getProfileOwnerId: () => host._profile?.owner?.ownerId,
    getProfile: () => host._profile,
    getMeshPeerId: () => host._mesh?.peerId ?? "",
    getVaultDir: () => host._vaultDir,
    humanProfileStore: host._humanProfileStore,
    capabilityManifestStore: host._capabilityManifestStore,
    agentIdentityStore: host._agentIdentityStore,
    chatLogStore: host._chatLogStore,
    trustStore: host._trustStore,
    loadConfig: () => host._configStore.load(),
  };
}

export function waitForOpenClawReply(
  state: OpenClawRuntimeState,
  correlationId: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const entry = state.pendingReplies.get(correlationId);
      if (!entry) return;
      clearTimeout(entry.timer);
      state.pendingReplies.delete(correlationId);
      persistPendingReplies(state);
      entry.reject(new Error(`OpenClaw reply timed out after ${OPEN_CLAW_REPLY_TIMEOUT_MS / 1000}s`));
    }, OPEN_CLAW_REPLY_TIMEOUT_MS);
    state.pendingReplies.set(correlationId, { resolve, reject, timer });
    persistPendingReplies(state);
  });
}

export function hasOpenClawPendingReply(
  state: OpenClawRuntimeState,
  correlationId: string,
): boolean {
  return state.pendingReplies.has(correlationId);
}

export function resolveOpenClawReply(
  state: OpenClawRuntimeState,
  correlationId: string,
  text: string,
): void {
  const entry = state.pendingReplies.get(correlationId);
  if (!entry) {
    console.warn(`[openclaw] sync reply for unknown correlationId=${correlationId}`);
    return;
  }
  clearTimeout(entry.timer);
  state.pendingReplies.delete(correlationId);
  if (state.pendingReplies.size === 0) {
    clearPersistedPendingReplies(state);
  } else {
    persistPendingReplies(state);
  }
  console.log(`[openclaw] sync reply resolved cid=${correlationId} len=${text.length}`);
  entry.resolve(text);
}

export function cancelOpenClawReply(
  state: OpenClawRuntimeState,
  correlationId: string,
  error: Error,
): void {
  const entry = state.pendingReplies.get(correlationId);
  if (!entry) return;
  clearTimeout(entry.timer);
  state.pendingReplies.delete(correlationId);
  if (state.pendingReplies.size === 0) {
    clearPersistedPendingReplies(state);
  } else {
    persistPendingReplies(state);
  }
  entry.reject(error);
}

export function rejectAllPendingOpenClawReplies(state: OpenClawRuntimeState, reason: string): void {
  for (const [, entry] of state.pendingReplies) {
    clearTimeout(entry.timer);
    entry.reject(new Error(reason));
  }
  state.pendingReplies.clear();
  clearPersistedPendingReplies(state);
}

function setOpenClawGatewayReady(state: OpenClawRuntimeState, ready: boolean): void {
  state.gatewayReady = ready;
  if (!ready) {
    state.gatewayRouteRegistered = false;
  }
}

/**
 * Wait for a spawned OpenClaw gateway child to fully exit, sending SIGKILL
 * if it has not exited within `graceMs`. Returns when the child has emitted
 * its `exit` event OR when the OS reaps the SIGKILL'd process. Does nothing
 * if the child is already exited or killed.
 *
 * Exported for unit testing — `apps/node/test/node-service-openclaw-runtime.test.ts`.
 */
export function waitForOpenClawChildExit(
  child: ChildProcess,
  options: { graceMs: number },
): Promise<void> {
  if (child.exitCode != null || child.signalCode != null || child.killed) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let resolved = false;
    let killGraceTimer: ReturnType<typeof setTimeout> | null = null;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(graceTimer);
      if (killGraceTimer) clearTimeout(killGraceTimer);
      resolve();
    };
    const graceTimer = setTimeout(() => {
      // Slow or stuck child — escalate to SIGKILL so the OS reaps it and
      // closes the listening socket. The next acquirer will reclaim the
      // gateway lock automatically (port-free + PID-dead → owner dead).
      try {
        child.kill("SIGKILL");
      } catch {
        /* already dead or permission denied */
      }
      // Brief settle so the OS reaps the zombie and the kernel releases
      // the listening port before the new child tries to bind it.
      killGraceTimer = setTimeout(finish, 250);
    }, options.graceMs);
    child.once("exit", finish);
  });
}

function assistantGatewayPort(state: OpenClawRuntimeState): number {
  try {
    const u = new URL(state.assistantAgentUrl);
    if (u.port) return Number(u.port);
    return u.protocol === "https:" ? 443 : 80;
  } catch {
    return OPENCLAW_GATEWAY_PORT;
  }
}

async function withOpenClawAskLock<T>(
  state: OpenClawRuntimeState,
  fn: () => Promise<T>,
): Promise<T> {
  state.askInFlight += 1;
  try {
    const run = state.askChain.then(fn, fn);
    state.askChain = run.then(
      () => undefined,
      () => undefined,
    );
    return await run;
  } finally {
    state.askInFlight = Math.max(0, state.askInFlight - 1);
  }
}

async function probeOpenClawWebhook(
  state: OpenClawRuntimeState,
  options?: { quiet?: boolean },
): Promise<boolean> {
  try {
    const resp = await fetch(state.assistantAgentUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(2000),
    });
    if (!isOpenClawEnvoymeshWebhookReady(resp.status)) {
      if (!options?.quiet) {
        const now = Date.now();
        if (now - state.lastProbeWarnAt > 10_000) {
          state.lastProbeWarnAt = now;
          console.warn(
            `[openclaw] webhook probe got ${resp.status} at ${state.assistantAgentUrl} — EnvoyMesh route not registered`,
          );
        }
      }
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function waitForOpenClawGatewayReady(state: OpenClawRuntimeState): Promise<boolean> {
  for (let attempt = 0; attempt < OPEN_CLAW_STARTUP_PROBE_ATTEMPTS; attempt++) {
    // Bail early if the gateway process exited mid-probe (avoids wasting
    // 90s probing a dead port). Prefer exitCode on the ChildProcess while it
    // is still referenced; fall back to lastGatewayExit after the exit
    // handler clears gatewayChild.
    if (state.gatewayChild?.exitCode !== null && state.gatewayChild !== null) {
      const code = state.gatewayChild.exitCode;
      console.warn("[openclaw] Gateway process exited during startup probe — stopping wait");
      recordOpenClawError(state, `Gateway process exited during startup probe (exit code ${code ?? "?"})`);
      return false;
    }
    if (!state.gatewayChild) {
      const exit = state.lastGatewayExit;
      const recent = exit != null && Date.now() - exit.at < 120_000;
      if (recent) {
        const detail = exit.signal
          ? `signal ${exit.signal}`
          : `exit code ${exit.code ?? "?"}`;
        console.warn(`[openclaw] Gateway process exited during startup probe (${detail}) — stopping wait`);
        recordOpenClawError(state, `Gateway process exited during startup probe (${detail})`);
      } else {
        console.warn("[openclaw] Gateway child is null during startup probe — stopping wait");
        recordOpenClawError(state, "Gateway child is null during startup probe");
      }
      return false;
    }
    if (await probeOpenClawWebhook(state, { quiet: true })) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  // The probe budget elapsed without the webhook coming up.  Include the
  // gateway's stderr output in the error for immediate diagnosis.
  const classification = classifyGatewayError(state.lastGatewayStderr);
  const stderrSummary =
    state.lastGatewayStderr.length > 0
      ? `\n  Last gateway output:\n    ${state.lastGatewayStderr.slice(-5).join("\n    ")}`
      : "";
  const diagnostic = classification ? ` ${classification}` : " — port may be in use or gateway failed to register";
  recordOpenClawError(
    state,
    `Gateway webhook not reachable after ${OPEN_CLAW_STARTUP_PROBE_ATTEMPTS}s${diagnostic}${stderrSummary}`,
  );
  return false;
}

function startOpenClawWatchdog(state: OpenClawRuntimeState, deps: OpenClawRuntimeDeps): void {
  if (state.watchdogRunning) return;
  state.watchdogRunning = true;
  const tick = async () => {
    if (!state.watchdogRunning) return;

    // Restart cap: if we've failed too many times consecutively, stop the
    // watchdog and surface a clear message. The user must fix the root cause
    // (reinstall, check config, free the port) before the gateway will start.
    if (state.consecutiveRestartFailures >= OPEN_CLAW_MAX_RESTART_ATTEMPTS) {
      console.warn(
        `[openclaw] Watchdog: ${OPEN_CLAW_MAX_RESTART_ATTEMPTS} consecutive failures — stopping watchdog.`,
      );
      if (state.lastError) {
        console.warn(`[openclaw] Last error: ${state.lastError}`);
      }
      console.warn(
        "[openclaw] Fix the issue and restart EnvoyMesh, or click 'Restart OpenClaw' in Settings.",
      );
      recordOpenClawError(
        state,
        `Gateway failed ${OPEN_CLAW_MAX_RESTART_ATTEMPTS} consecutive times — watchdog stopped. ` +
          `Fix the issue and restart.`,
      );
      state.watchdogRunning = false;
      stopOpenClawWatchdog(state);
      return;
    }

    // Case 1: Gateway process is alive but neither the stderr route-
    // registration signal nor the startup probe showed it ready → restart.
    //
    // `gatewayRouteRegistered` is set by the stderr listener at line ~1132,
    // which watches for the literal "Registered EnvoyMesh HTTP route"
    // message. openclaw's logger (tslog) writes that to a rolling log file
    // (default in `~/.cache/openclaw/openclaw-YYYY-MM-DD.log`), NOT to
    // stderr, so the signal can stay false even when the gateway is
    // actually serving. `gatewayReady` is set by `waitForOpenClawGatewayReady`
    // which probes the webhook URL directly — that's the source of truth.
    // Accept EITHER signal as positive, otherwise the watchdog restarts a
    // working gateway in a loop.
    if (
      state.gatewayChild &&
      !state.gatewayChild.killed &&
      !state.gatewayRouteRegistered &&
      !state.gatewayReady
    ) {
      const backoff = restartBackoffMs(state.consecutiveRestartFailures);
      if (backoff > 0) {
        console.warn(`[openclaw] Watchdog: backing off ${backoff / 1000}s before restart (attempt ${state.consecutiveRestartFailures + 1}/${OPEN_CLAW_MAX_RESTART_ATTEMPTS})`);
        await new Promise((r) => setTimeout(r, backoff));
        if (!state.watchdogRunning) return; // cancelled during backoff
      }
      console.warn("[openclaw] Watchdog: gateway process alive but route unregistered — restarting");
      recordOpenClawError(state, "Gateway process alive but HTTP route never registered — restarting");
      state.watchdogRunning = false;
      stopOpenClawWatchdog(state);
      await startOpenClawViaRuntime(state, deps).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[openclaw] Watchdog restart failed:", msg);
        recordOpenClawError(state, `Watchdog restart failed: ${msg}`);
      });
      return;
    }

    // Case 2: Gateway process died (crashed or was killed) → proactive restart.
    if (!state.gatewayChild || state.gatewayChild.killed) {
      // If the death was caused by a port conflict, don't enter an
      // infinite restart loop — the next spawn will fail identically.
      if (state.watchdogPortConflict) {
        console.warn(
          "[openclaw] Watchdog: port conflict detected — stopping watchdog. " +
            "Set ENVOYMESH_PORT_OFFSET to shift all ports (e.g. 100).",
        );
        state.watchdogRunning = false;
        stopOpenClawWatchdog(state);
        return;
      }
      const backoff = restartBackoffMs(state.consecutiveRestartFailures);
      if (backoff > 0) {
        console.warn(`[openclaw] Watchdog: backing off ${backoff / 1000}s before restart (attempt ${state.consecutiveRestartFailures + 1}/${OPEN_CLAW_MAX_RESTART_ATTEMPTS})`);
        await new Promise((r) => setTimeout(r, backoff));
        if (!state.watchdogRunning) return; // cancelled during backoff
      }
      console.warn("[openclaw] Watchdog: gateway process died — restarting");
      recordOpenClawError(state, "Gateway process died — restarting");
      state.watchdogRunning = false;
      stopOpenClawWatchdog(state);
      setOpenClawGatewayReady(state, false);
      await startOpenClawViaRuntime(state, deps).catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[openclaw] Watchdog restart failed:", msg);
        recordOpenClawError(state, `Watchdog restart failed: ${msg}`);
      });
      return;
    }

    // Case 3: Gateway ready (set by the startup probe at waitForOpenClawGatewayReady)
    // → periodically probe to confirm it's still responding. If the probe
    // fails, mark unready so the next turn triggers a re-spawn. Key on
    // `gatewayReady` rather than `gatewayRouteRegistered` because openclaw's
    // tslog writes the registration message to a file, not stderr — see the
    // Case 1 comment for details.
    if (state.gatewayReady) {
      const ok = await probeOpenClawWebhook(state, { quiet: true }).catch(() => false);
      if (!ok) {
        console.warn("[openclaw] Watchdog: gateway alive but probe failed — marking unready");
        recordOpenClawError(state, "Gateway alive but webhook probe failed — marking unready");
        setOpenClawGatewayReady(state, false);
      }
    }

    if (!state.watchdogRunning) return;
    state.watchdogTimer = setTimeout(tick, OPEN_CLAW_WATCHDOG_INTERVAL_MS);
  };
  state.watchdogTimer = setTimeout(tick, OPEN_CLAW_WATCHDOG_INTERVAL_MS);
}

function stopOpenClawWatchdog(state: OpenClawRuntimeState): void {
  state.watchdogRunning = false;
  if (state.watchdogTimer) {
    clearTimeout(state.watchdogTimer);
    state.watchdogTimer = null;
  }
}

export function beginOpenClawToolTracking(state: OpenClawRuntimeState): void {
  state.activeTurnTools = [];
}

export function endOpenClawToolTracking(state: OpenClawRuntimeState): string[] {
  const tools = state.activeTurnTools ?? [];
  state.activeTurnTools = null;
  return tools;
}

export function recordOpenClawToolCallViaRuntime(state: OpenClawRuntimeState, toolName: string): void {
  if (state.activeTurnTools && !state.activeTurnTools.includes(toolName)) {
    state.activeTurnTools.push(toolName);
  }
}

export function isOpenClawReadyViaRuntime(state: OpenClawRuntimeState): boolean {
  return state.gatewayReady && state.gatewayChild != null && !state.gatewayChild.killed;
}

export async function isOpenClawEnabledViaRuntime(deps: OpenClawRuntimeDeps): Promise<boolean> {
  const cfg = await deps.loadConfig();
  return cfg?.openclawEnabled ?? true;
}

export async function buildOpenClawTurnContextViaRuntime(deps: OpenClawRuntimeDeps): Promise<{
  ownerDisplayName?: string;
  bonds?: Array<{ name: string; level: string; dormantDays?: number }>;
  interests?: string[];
  capabilities?: string[];
  permissions?: { bondAutonomy: boolean; maxBondsPerDay: number; autoCircleContacts: boolean; maxSensitivity: string };
  model?: { provider: string; baseUrl?: string; model?: string };
}> {
  const config = await deps.loadConfig();
  const nodeConfig = await deps.getNodeConfig();
  const bonds = await deps.getBonds();
  let interests: string[] = [];
  let ownerDisplayName: string | undefined;
  try {
    const profile = await deps.humanProfileStore?.loadHumanProfile();
    if (profile) {
      ownerDisplayName = profile.displayName?.trim() || undefined;
      interests = [...(profile.hobbies ?? []), ...(profile.knowledge ?? [])];
    }
  } catch { /* no profile yet */ }

  let capabilities: string[] | undefined;
  if (deps.capabilityManifestStore) {
    const manifest = await deps.capabilityManifestStore.loadManifest();
    capabilities = manifest?.capabilities;
  }

  const providers =
    (await deps.getEffectiveModelProviders?.()) ?? nodeConfig.modelProviders;
  const model =
    providers?.mode && providers.mode !== "disabled"
      ? {
          provider: providers.mode,
          baseUrl: providers.endpoint,
          model: providers.modelName,
        }
      : { provider: "disabled" };

  return {
    ownerDisplayName,
    bonds: bonds.map((b) => ({
      name: b.displayName ?? b.peerOwnerId,
      level: b.level,
    })),
    interests,
    capabilities,
    permissions: {
      bondAutonomy: config?.bondAutonomyEnabled ?? false,
      maxBondsPerDay: 0,
      autoCircleContacts: false,
      maxSensitivity: "public",
    },
    model,
  };
}

async function withOpenClawTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`[openclaw] operation timed out after ${timeoutMs / 1000}s — continuing without full context`);
          resolve(fallback);
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function buildEnvoyMeshOpenClawPrompts(
  deps: OpenClawRuntimeDeps,
  message: string,
  options?: {
    retrievedContext?: {
      knowledgeAccess?: import("./ai-context.js").KnowledgeAccessLevel;
      knowledgeScope?: import("@envoymesh/api").AiKnowledgeBaseScope;
      contactThreadOwnerId?: string;
    };
  },
): Promise<{
  policyPrompt: string;
  retrievedContext: string;
}> {
  const turnContext = await buildOpenClawTurnContextViaRuntime(deps);
  const owner = deps.getProfile()?.owner;
  let displayName = turnContext.ownerDisplayName ?? owner?.ownerId ?? "unknown";
  try {
    const callerName = await deps.getCallerDisplayName?.();
    if (callerName?.trim()) displayName = callerName.trim();
  } catch {
    /* keep fallback */
  }
  const isOwnerCaller = deps.isCallerOwnerProfile?.() ?? true;
  const webSearchEnabled = (await deps.loadBridgeConfigWebSearchEnabled()) ?? true;
  const skillApiKeys = (await deps.loadBridgeConfigSkillApiKeys()) ?? {};
  const webSearch = resolveActiveWebSearchProvider({ webSearchEnabled, skillApiKeys });
  const { buildAgentConfig, buildOpenClawSystemPrompt } = await import(
    "@envoymesh/openclaw-runtime/tool-bridge"
  );
  const agentConfig = buildAgentConfig({
    owner: {
      ownerId: owner?.ownerId ?? "unknown",
      displayName,
      interests: isOwnerCaller ? (turnContext.interests ?? []) : [],
      capabilities: isOwnerCaller ? (turnContext.capabilities ?? []) : [],
    },
    permissions: turnContext.permissions ?? {
      bondAutonomy: false,
      maxBondsPerDay: 0,
      autoCircleContacts: false,
      maxSensitivity: "public",
    },
    bonds: isOwnerCaller
      ? (turnContext.bonds ?? []).map((b) => ({
          displayName: b.name,
          level: b.level,
          dormantDays: b.dormantDays,
        }))
      : [],
    model: turnContext.model ?? { provider: "disabled" },
    webSearch,
  });
  const policyPrompt = buildOpenClawSystemPrompt(displayName, agentConfig);

  const nodeConfig = await deps.getNodeConfig();
  const bonds = await deps.getBonds();
  let retrievedContext = "";
  // Family members must not inherit owner vault / bond chat RAG.
  if (owner?.ownerId && isOwnerCaller) {
    try {
      const effectiveProviders =
        (await deps.getEffectiveModelProviders?.()) ?? nodeConfig.modelProviders;
      const retrievedProfile =
        inferModelProviderPreset(effectiveProviders).id === "envoy-local"
          ? "local"
          : "cloud";
      const scope = options?.retrievedContext;
      retrievedContext = await withOpenClawTimeout(
        buildEnvoyMeshRetrievedContext({
          message,
          ownerId: owner.ownerId,
          bonds: bonds.map((b) => ({
            peerOwnerId: b.peerOwnerId,
            displayName: b.displayName,
          })),
          chatLogStore: deps.chatLogStore,
          trustStore: deps.trustStore,
          humanProfileStore: deps.humanProfileStore,
          agentIdentityStore: deps.agentIdentityStore,
          vaultDir: deps.getVaultDir(),
          ragService: await deps.getRagService(),
          knowledgeBase: nodeConfig.aiSettings?.knowledgeBase,
          profile: retrievedProfile,
          profileDir: deps.getProfileDir(),
          knowledgeAccess: scope?.knowledgeAccess,
          knowledgeScope: scope?.knowledgeScope,
          contactThreadOwnerId: scope?.contactThreadOwnerId,
        }),
        OPEN_CLAW_RETRIEVED_CONTEXT_TIMEOUT_MS,
        "",
      );
    } catch (err) {
      console.warn(
        "[openclaw] retrieved context build failed:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { policyPrompt, retrievedContext };
}

async function askOpenClawViaWebhook(
  state: OpenClawRuntimeState,
  deps: OpenClawRuntimeDeps,
  prompt: string,
  envoyContext?: { policyPrompt?: string; retrievedContext?: string },
): Promise<string> {
  const ownerId = deps.getProfileOwnerId();
  if (!ownerId) {
    throw new Error("Owner profile not loaded");
  }

  const correlationId = `oc-ask-${randomUUID()}`;
  console.log(`[openclaw] ask start cid=${correlationId} promptLen=${prompt.length}`);
  const replyPromise = waitForOpenClawReply(state, correlationId);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (state.assistantAgentSecret) {
    headers.Authorization = `Bearer ${state.assistantAgentSecret}`;
  }

  let fromName = ownerId;
  try {
    const callerName = await deps.getCallerDisplayName?.();
    if (callerName?.trim()) {
      fromName = callerName.trim();
    } else {
      const profile = await deps.humanProfileStore?.loadHumanProfile();
      if (profile?.displayName?.trim()) fromName = profile.displayName.trim();
    }
  } catch { /* use ownerId */ }

  const body = JSON.stringify({
    from: deps.getMeshPeerId(),
    fromOwnerId: ownerId,
    fromName,
    text: prompt,
    ...(envoyContext?.policyPrompt?.trim() ? { policyPrompt: envoyContext.policyPrompt.trim() } : {}),
    ...(envoyContext?.retrievedContext?.trim()
      ? { retrievedContext: envoyContext.retrievedContext.trim() }
      : {}),
    correlationId,
  });

  try {
    const [text] = await Promise.all([
      replyPromise,
      (async () => {
        const resp = await postOpenClawWebhook(state.assistantAgentUrl, {
          method: "POST",
          headers,
          body,
          timeoutMs: OPEN_CLAW_REPLY_TIMEOUT_MS,
        });

        if (!resp.ok) {
          const detail = await resp.text().catch(() => "");
          const err = new Error(
            `OpenClaw webhook returned ${resp.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
          );
          if (resp.status === 404 || resp.status >= 500) {
            // 404 = route gone; 5xx = gateway erroring → mark unready so
            // the next turn triggers a re-spawn.
            setOpenClawGatewayReady(state, false);
          }
          throw err;
        }
      })(),
    ]);
    console.log(`[openclaw] ask complete cid=${correlationId} answerLen=${text.length}`);
    return text;
  } catch (err) {
    if (state.pendingReplies.has(correlationId)) {
      cancelOpenClawReply(
        state,
        correlationId,
        err instanceof Error ? err : new Error(String(err)),
      );
      void replyPromise.catch(() => {});
    }
    throw err;
  }
}

async function startOpenClawInner(
  state: OpenClawRuntimeState,
  deps: OpenClawRuntimeDeps,
): Promise<boolean> {
  if (state.gatewayChild && !state.gatewayChild.killed && state.gatewayReady) {
    return true;
  }
  if (state.gatewayChild && !state.gatewayChild.killed) {
    const oldChild = state.gatewayChild;
    state.gatewayChild = null;
    setOpenClawGatewayReady(state, false);
    try { oldChild.kill("SIGTERM"); } catch { /* ignore */ }
    // Wait for the old child to actually exit before spawning the new one.
    // Without this, the gateway lock is still held by the dying child —
    // openclaw only releases the lock AFTER its `params.start({...})` server
    // startup completes (run-loop.ts:855 `finally` → releaseLockIfHeld →
    // exitProcess). When the watchdog fires because startup is slow or
    // stuck, the new child can't acquire the lock within the 5s budget
    // (`acquireGatewayLock` polls, then throws `lock timeout after 5000ms`),
    // exits, and the watchdog restart-loops. SIGKILL at 1.5s forces the
    // process out so the OS closes the listening socket and the next
    // acquirer reclaims the lock (port-free + PID-dead → owner dead →
    // fs.rm(lockPath) → retry succeeds).
    await waitForOpenClawChildExit(oldChild, { graceMs: 1500 });
  }

  const { existsSync, mkdirSync, writeFileSync, readFileSync } = await import("node:fs");
  const { join, resolve } = await import("node:path");
  const nodeCwd = process.cwd();
  const bundledSkillsDir = resolveBundledSkillsDir(nodeCwd);

  const profileDir = deps.getProfileDir();
  const profileDirAbs =
    profileDir && profileDir !== "/tmp/unknown"
      ? resolve(nodeCwd, profileDir)
      : null;
  const cfgPath = profileDirAbs
    ? join(profileDirAbs, "bridge-config.json")
    : join(nodeCwd, "data", "default", "bridge-config.json");
  const defaultAssistantUrl = openClawGatewayWebhookUrl();
  let assistantUrl = defaultAssistantUrl;
  let bridgeSecret: string | undefined;
  let bridgeListenPort = BRIDGE_HTTP_PORT;
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
      bridgeSecret = typeof cfg?.secret === "string" && cfg.secret.trim() ? cfg.secret.trim() : undefined;
      // Resolve assistantAgentUrl: if the config has an explicit one that
      // points at /webhook/envoymesh, respect it (custom port). Otherwise
      // always use the env-aware default from service-ports.ts. We NEVER let
      // a stale persisted URL override the current ENVOYMESH_GATEWAY_PORT.
      const explicit = cfg.assistantAgentUrl?.trim();
      if (explicit && explicit.includes("/webhook/envoymesh")) {
        assistantUrl = explicit;
      } else {
        assistantUrl = defaultAssistantUrl;
      }
    } catch { /* use default */ }
  }
  bridgeListenPort = BRIDGE_HTTP_PORT;
  state.assistantAgentUrl = assistantUrl;
  state.assistantAgentSecret = bridgeSecret;
  console.log(`[openclaw] Assistant webhook URL: ${assistantUrl} (port: ${assistantGatewayPort(state)})`);
  const bridgeUrl = `http://127.0.0.1:${bridgeListenPort}/bridge/send`;

  const gwStateDir = profileDirAbs
    ? openClawGatewayStateDir(profileDirAbs)
    : join((await import("node:os")).tmpdir(), `envoymesh-gateway-${process.pid}`);
  mkdirSync(gwStateDir, { recursive: true });
  const gwConfigPath = join(gwStateDir, "openclaw.json");

  let workspaceDir = gwStateDir;
  if (profileDirAbs) {
    const ownerId = deps.getProfileOwnerId() ?? "unknown";
    let displayName: string | undefined;
    let interests: string[] = [];
    let capabilities: string[] = [];
    try {
      const profile = await deps.humanProfileStore?.loadHumanProfile();
      if (profile) {
        displayName = profile.displayName?.trim() || undefined;
        interests = [...(profile.hobbies ?? []), ...(profile.knowledge ?? [])];
      }
    } catch { /* no profile */ }
    if (deps.capabilityManifestStore) {
      try {
        const manifest = await deps.capabilityManifestStore.loadManifest();
        capabilities = manifest?.capabilities ?? [];
      } catch { /* no manifest */ }
    }
    let agentIdentitySnippet: string | undefined;
    if (deps.agentIdentityStore) {
      try {
        const doc = await deps.agentIdentityStore.load();
        const trimmed = doc.content?.trim();
        if (trimmed) agentIdentitySnippet = trimmed.slice(0, 4000);
      } catch { /* no identity doc */ }
    }
    let bondCount = 0;
    try {
      bondCount = (await deps.getBonds()).length;
    } catch { /* ignore */ }
    workspaceDir = ensureOpenClawWorkspace(profileDirAbs, {
      ownerId,
      displayName,
      interests,
      capabilities,
      agentIdentitySnippet,
      bondCount,
    }, {
      legacySkillsDir: bundledSkillsDir,
    });
  }
  workspaceDir = resolve(workspaceDir);
  const gwStateDirAbs = resolve(gwStateDir);
  const gwConfigPathAbs = resolve(gwConfigPath);

  let modelProviderCfg: import("@envoymesh/api").ModelProviderConfig | undefined
  try {
    const effective = deps.getEffectiveModelProviders
      ? await deps.getEffectiveModelProviders()
      : (await deps.getNodeConfig())?.modelProviders;
    if (effective?.mode && effective.mode !== "disabled") {
      modelProviderCfg = effective
    }
  } catch { /* use defaults */ }

  let skillApiKeys: Record<string, string> = {};
  let webSearchEnabled = true;
  let clawhubToken: string | undefined;
  try {
    const bridgeCfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
    if (bridgeCfg?.skillApiKeys && typeof bridgeCfg.skillApiKeys === "object") {
      skillApiKeys = bridgeCfg.skillApiKeys as Record<string, string>;
    }
    if (typeof bridgeCfg?.webSearchEnabled === "boolean") webSearchEnabled = bridgeCfg.webSearchEnabled;
    if (typeof bridgeCfg?.clawhubToken === "string" && bridgeCfg.clawhubToken.trim()) {
      clawhubToken = bridgeCfg.clawhubToken.trim();
    }
  } catch { /* use defaults */ }
  const skillEntries = buildOpenClawGatewaySkillEntries(skillApiKeys);
  const agentSection = buildOpenClawGatewayAgentSection({ webSearchEnabled, skillApiKeys });
  const gatewaySearchEnv = buildOpenClawGatewaySearchEnv(skillApiKeys);
  let localContextWindow: number | undefined;
  if (inferModelProviderPreset(modelProviderCfg).id === "envoy-local") {
    try {
      const nodeCfg = await deps.getNodeConfig();
      localContextWindow = resolveEnvoyLocalServerParams(
        nodeCfg?.envoyLocal?.serverParams,
      ).ctxSize;
    } catch {
      /* keep undefined — OpenClaw uses its own default */
    }
  }
  const modelSection = buildOpenClawGatewayModelSection(
    modelProviderCfg,
    localContextWindow != null ? { contextWindow: localContextWindow } : undefined,
  );

  writeFileSync(gwConfigPathAbs, JSON.stringify({
    gateway: { auth: { mode: "none" } },
    agents: {
      defaults: {
        skipBootstrap: true,
        workspace: workspaceDir,
        ...(modelSection.defaultsModel ? { model: modelSection.defaultsModel } : {}),
      },
    },
    channels: {
      envoymesh: {
        enabled: true,
        bridgeUrl,
        webhookPath: "/webhook/envoymesh",
        dmPolicy: "open",
        allowedOwnerIds: ["*"],
      },
    },
    ...(Object.keys(skillEntries).length > 0 ? {
      skills: { entries: skillEntries },
    } : {}),
    tools: agentSection.tools,
    plugins: agentSection.plugins,
    ...(modelSection.models ? { models: modelSection.models } : {}),
  }, null, 2), "utf-8");

  const gatewayPort = assistantGatewayPort(state);
  state.gatewayRouteRegistered = false;
  state.lastProbeWarnAt = 0;
  await reclaimAssistantGatewayPort({
    port: gatewayPort,
    webhookUrl: assistantUrl,
    excludePid: state.gatewayChild?.pid ?? undefined,
    log: (message) => console.warn(message),
  });

  const child = spawnOpenClawGateway({
    nodeCwd,
    gatewayPort,
    gatewayEnv: {
      ...gatewaySearchEnv,
      OPENCLAW_STATE_DIR: gwStateDirAbs,
      OPENCLAW_CONFIG_PATH: gwConfigPathAbs,
      ENVOYMESH_BRIDGE_URL: bridgeUrl,
      ENVOYMESH_ALLOWED_OWNER_IDS: deps.getProfileOwnerId() ?? "*",
      CLAWHUB_WORKDIR: workspaceDir,
      ...(clawhubToken ? { CLAWHUB_TOKEN: clawhubToken } : {}),
    },
  });
  console.log(`[openclaw] Gateway process spawned (pid=${child.pid}), waiting for webhook at ${assistantUrl}...`);
  child.stderr?.on("data", (d: Buffer) => {
    const t = d.toString();
    pushGatewayStderr(state, t);
    if (t.includes("Registered EnvoyMesh HTTP route")) {
      state.gatewayRouteRegistered = true;
    }
    const trimmed = t.trim();
    if (trimmed) {
      for (const line of trimmed.split("\n")) {
        if (line) process.stderr.write(`[gateway] ${line}\n`);
      }
    }
  });
  child.on("error", (err) => {
    // Spawn-time failures (ENOENT, EACCES, EPERM, …) surface here. The
    // runtime will record the cause so the settings page can show it.
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[openclaw] gateway spawn error: ${msg}`);
    recordOpenClawError(state, `Gateway spawn error: ${msg}`);
  });
  child.on("exit", (code, signal) => {
    state.lastGatewayExit = {
      code: code ?? null,
      signal: signal ?? null,
      at: Date.now(),
    };
    // Only clear state when THIS child is still the active one. A late exit
    // from a previous gateway (killed for reload) must not null out a newer
    // spawn — that surfaces as "Gateway child is null" while the new process
    // is still alive on the port.
    if (state.gatewayChild !== child) {
      return;
    }
    if (code) {
      console.warn(`[openclaw] gateway exited code ${code}`);
      recordOpenClawError(state, `Gateway process exited with code ${code}`);
    } else if (signal) {
      console.warn(`[openclaw] gateway exited signal ${signal}`);
      recordOpenClawError(state, `Gateway process exited with signal ${signal}`);
    }
    state.gatewayChild = null;
    setOpenClawGatewayReady(state, false);
    state.gatewayRouteRegistered = false;
    rejectAllPendingOpenClawReplies(state, "OpenClaw gateway stopped");
    // NOTE: Do NOT stop the watchdog here. The watchdog's Case 2 will detect
    // the null gatewayChild on its next tick and proactively restart it.
    // Previously this stopped the watchdog entirely, meaning a crashed gateway
    // stayed dead until the next user message.
  });
  state.gatewayChild = child;
  state.lastGatewayExit = null;
  // Register the child with the module-level tracker so the `process.on("exit")`
  // hook can SIGKILL it if the node process exits via a path that bypasses
  // `stopOpenClawViaRuntime` (e.g. a Tauri SIGTERM that races with the graceful
  // shutdown chain, or an unhandled rejection that calls `process.exit(1)`).
  trackOpenClawGatewayChild(child);
  setOpenClawGatewayReady(state, false);

  let gatewayReady = false;
  if (child.exitCode == null) {
    gatewayReady = await waitForOpenClawGatewayReady(state);
  } else {
    const code = child.exitCode;
    const portMsg =
      `Port ${gatewayPort} is in use by another OpenClaw instance. ` +
      `Set ENVOYMESH_PORT_OFFSET (e.g. 100) to shift all ports, or stop the other node first.`;
    console.warn(
      `[openclaw] Gateway process exited before webhook was ready (code ${code}). ${portMsg}`,
    );
    recordOpenClawError(
      state,
      `Gateway exited before webhook was ready (code ${code}). ${portMsg}`,
    );
    state.watchdogPortConflict = true;
  }

  if (gatewayReady) {
    // Healthy start — clear any prior recorded error so the settings page
    // doesn't show stale failure text after recovery.
    clearOpenClawError(state);
  }

  if (!gatewayReady) {
    console.warn(
      `[openclaw] Gateway not reachable after ${OPEN_CLAW_STARTUP_PROBE_ATTEMPTS}s at ${assistantUrl}. ` +
        `Check [gateway] logs for "Registered EnvoyMesh HTTP route".`,
    );
  }

  setOpenClawGatewayReady(state, gatewayReady);

  if (gatewayReady) {
    startOpenClawWatchdog(state, deps);
  }

  state.runtime = {
    isReady: () => isOpenClawReadyViaRuntime(state),
    ask: async (prompt: string, envoyContext?: { policyPrompt?: string; retrievedContext?: string }) => {
      return await askOpenClawViaWebhook(state, deps, prompt, envoyContext);
    },
    stop: async () => {
      await stopOpenClawViaRuntime(state, deps);
    },
  } as OpenClawRuntime;

  console.log("[openclaw] Built-in OpenClaw gateway at", assistantUrl);
  console.log("[openclaw] Gateway config:", gwConfigPathAbs);
  if (modelProviderCfg && modelProviderCfg.mode && modelProviderCfg.mode !== "disabled") {
    const { apiKey: _secret, ...safeCfg } = modelProviderCfg;
    console.log(
      "[openclaw] Model config:",
      JSON.stringify({
        ...safeCfg,
        ...(_secret ? { apiKey: "[redacted]" } : {}),
      }),
    );
  }
  return gatewayReady;
}

export async function ensureOpenClawReadyViaRuntime(
  state: OpenClawRuntimeState,
  deps: OpenClawRuntimeDeps,
): Promise<boolean> {
  // Fast path: if we believe we're ready, verify with a quick probe.
  // This catches the case where the gateway process is alive but hung
  // (not responding to HTTP) — a common failure mode after running for
  // hours or days. Without this probe, a hung gateway would cause every
  // message to time out at the 180s reply timeout.
  if (isOpenClawReadyViaRuntime(state)) {
    const ok = await probeOpenClawWebhook(state, { quiet: true }).catch(() => false);
    if (ok) return true;
    // Gateway was "ready" but probe failed — it's hung or crashed.
    console.warn("[openclaw] Gateway was marked ready but probe failed — re-evaluating");
    setOpenClawGatewayReady(state, false);
    state.gatewayRouteRegistered = false;
    // Kill the stale process so startOpenClawInner spawns a fresh one.
    if (state.gatewayChild && !state.gatewayChild.killed) {
      try { state.gatewayChild.kill("SIGTERM"); } catch { /* ignore */ }
      state.gatewayChild = null;
    }
    // Fall through to restart logic below.
  }

  if (state.gatewayChild && !state.gatewayChild.killed) {
    if (await waitForOpenClawGatewayReady(state)) {
      setOpenClawGatewayReady(state, true);
      startOpenClawWatchdog(state, deps);
      return true;
    }
    console.warn("[openclaw] Gateway process alive but webhook not responding");
    return false;
  }

  console.log("[openclaw] Gateway not ready — starting...");
  return await startOpenClawViaRuntime(state, deps);
}

export async function startOpenClawViaRuntime(
  state: OpenClawRuntimeState,
  deps: OpenClawRuntimeDeps,
): Promise<boolean> {
  if ((await isOpenClawEnabledViaRuntime(deps)) === false) return false;
  if (isOpenClawReadyViaRuntime(state)) return true;
  if (state.startPromise) return state.startPromise;

  state.startPromise = startOpenClawInner(state, deps).finally(() => {
    state.startPromise = null;
  });
  return state.startPromise;
}

export async function stopOpenClawViaRuntime(
  state: OpenClawRuntimeState,
  _deps: OpenClawRuntimeDeps,
): Promise<void> {
  rejectAllPendingOpenClawReplies(state, "OpenClaw stopped");
  setOpenClawGatewayReady(state, false);
  stopOpenClawWatchdog(state);
  // If startOpenClawInner is mid-probe, kill the child first so the probe
  // exits quickly, then await the in-flight start so we don't race a second
  // spawn on top of a half-finished one.
  const inflightStart = state.startPromise;
  const proc = state.gatewayChild;
  state.gatewayChild = null;
  if (proc && !proc.killed) {
    // Actually wait for the child to exit. The previous implementation
    // scheduled SIGKILL via setTimeout(3000) but did not await — if the
    // parent called `process.exit()` before the 3s elapsed, the SIGKILL
    // never fired and the openclaw child was orphaned holding the
    // gateway lock, breaking the next start. We bound the wait at
    // ~3.25s (3s grace + 250ms OS-reap settle); if the child still
    // hasn't exited after that, the process.on("exit") hook fires
    // SIGKILL synchronously when this function returns and the parent
    // eventually exits.
    try { proc.kill("SIGTERM"); } catch { /* ignore */ }
    await waitForOpenClawChildExit(proc, { graceMs: 3000 });
  }
  if (inflightStart) {
    await inflightStart.catch(() => undefined);
  }
  state.runtime = null;
}

/**
 * Force-restart the built-in OpenClaw gateway. Used by the AI → AI Engine
 * settings page's "Restart now" button and by the chat view's banner — gives
 * the user a way to recover from a "Stopped" state without bouncing the
 * whole home node. Kills any existing child, waits briefly for the OS to
 * release the webhook port, then spawns a fresh gateway.
 *
 * Returns the new runtime status so the caller can update its UI without
 * a follow-up poll.
 */
export async function restartOpenClawViaRuntime(
  state: OpenClawRuntimeState,
  deps: OpenClawRuntimeDeps,
): Promise<OpenClawStatusShape> {
  await stopOpenClawViaRuntime(state, deps);
  // Clear port-conflict flag so the watchdog restart loop is reset.
  state.watchdogPortConflict = false;
  // Brief settle so the OS releases the webhook port and any half-closed
  // sockets are reaped. 250ms is enough on Linux/macOS; shorter would risk
  // EADDRINUSE on the spawn immediately below.
  await new Promise((r) => setTimeout(r, 250));
  const ready = await startOpenClawViaRuntime(state, deps);
  const child = state.gatewayChild;
  return {
    enabled: true,
    running: ready,
    url: state.assistantAgentUrl,
    childPid: child && !child.killed ? child.pid : undefined,
    lastError: state.lastError,
    lastErrorAt: state.lastErrorAt,
    consecutiveRestartFailures: state.consecutiveRestartFailures,
  };
}

/** Minimal status shape returned by {@link restartOpenClawViaRuntime}. */
export type OpenClawStatusShape = {
  enabled: boolean;
  running: boolean;
  url: string;
  childPid?: number;
  lastError: string | null;
  lastErrorAt: string | null;
  consecutiveRestartFailures: number;
};

export async function askOpenClawViaRuntime(
  state: OpenClawRuntimeState,
  deps: OpenClawRuntimeDeps,
  prompt: string,
  context?: {
    ownerDisplayName?: string;
    bonds?: Array<{ name: string; level: string; dormantDays?: number }>;
    interests?: string[];
    capabilities?: string[];
    permissions?: { bondAutonomy: boolean; maxBondsPerDay: number; autoCircleContacts: boolean; maxSensitivity: string };
    model?: { provider: string; baseUrl?: string; model?: string };
    /** Contact-facing Agent Mode drafts: limit vault/chat RAG scope. */
    retrievedContext?: {
      knowledgeAccess?: import("./ai-context.js").KnowledgeAccessLevel;
      knowledgeScope?: import("@envoymesh/api").AiKnowledgeBaseScope;
      contactThreadOwnerId?: string;
    };
  },
): Promise<string> {
  if (!(await ensureOpenClawReadyViaRuntime(state, deps))) {
    throw new Error("OpenClaw not available");
  }
  const { policyPrompt, retrievedContext } = await buildEnvoyMeshOpenClawPrompts(deps, prompt, {
    retrievedContext: context?.retrievedContext,
  });
  return withOpenClawAskLock(state, () =>
    askOpenClawViaWebhook(state, deps, prompt, { policyPrompt, retrievedContext }),
  );
}

export async function sendToOpenClawViaRuntime(
  state: OpenClawRuntimeState,
  deps: OpenClawRuntimeDeps,
  text: string,
  threadKey: string = ENVOY_AI_THREAD_KEY,
): Promise<void> {
  const ownerId = deps.getProfileOwnerId() ?? "";
  const callerProfileId =
    deps.getCallerFamilyProfileId?.()?.trim() || OWNER_FAMILY_PROFILE_ID;
  const isOwnerCaller =
    deps.isCallerOwnerProfile?.() ?? callerProfileId === OWNER_FAMILY_PROFILE_ID;
  let displayName = ownerId;
  try {
    const callerName = await deps.getCallerDisplayName?.();
    if (callerName?.trim()) displayName = callerName.trim();
  } catch {
    /* keep ownerId */
  }
  const humanSenderOwnerId = isOwnerCaller ? ownerId : callerProfileId;
  const now = new Date().toISOString();
  const messageId = crypto.randomUUID();

  const outboundMsg: ChatMessage = {
    messageId,
    sender: {
      nodeId: deps.getMeshPeerId(),
      ownerId: humanSenderOwnerId,
      displayName,
      actorRole: "human",
    },
    recipient: {
      nodeId: ENVOY_AI_THREAD_KEY,
      ownerId: threadKey,
      displayName: "EnvoyAI",
    },
    content: { text },
    metadata: {
      timestamp: now,
      deliveryReceipt: "sent",
      deliveryChannel: "ai",
    },
    signature: "",
  };
  recordEnvoyAiChatMessageViaRuntime(deps, outboundMsg, threadKey);

  let policyPrompt: string | undefined;
  let retrievedContext: string | undefined;
  try {
    const prompts = await buildEnvoyMeshOpenClawPrompts(deps, text);
    policyPrompt = prompts.policyPrompt;
    retrievedContext = prompts.retrievedContext;
  } catch {
    /* best-effort context */
  }

  const correlationId = `oc-openclaw-${randomUUID()}`;
  const replyPromise = waitForOpenClawReply(state, correlationId);

  const fromName = displayName || ownerId;

  const body = JSON.stringify({
    from: deps.getMeshPeerId(),
    fromOwnerId: ownerId,
    fromName,
    text,
    ...(policyPrompt?.trim() ? { policyPrompt: policyPrompt.trim() } : {}),
    ...(retrievedContext?.trim() ? { retrievedContext: retrievedContext.trim() } : {}),
    correlationId,
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (state.assistantAgentSecret) {
    headers.Authorization = `Bearer ${state.assistantAgentSecret}`;
  }

  const [answer] = await Promise.all([
    replyPromise,
    (async () => {
      const resp = await postOpenClawWebhook(state.assistantAgentUrl, {
        method: "POST",
        headers,
        body,
        timeoutMs: 300_000,
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        console.warn(`[openclaw] webhook returned ${resp.status}: ${detail.slice(0, 200)}`);
        cancelOpenClawReply(state, correlationId, new Error(`OpenClaw webhook ${resp.status}`));
      }
    })(),
  ]);

  await persistEnvoyAiChatExchangeViaRuntime(deps, text, {
    answer,
    domain: "knowledge",
    intent: "knowledge",
    toolsUsed: [],
    approvalItems: [],
    modelUsed: "openclaw",
  }, messageId, threadKey);
}
