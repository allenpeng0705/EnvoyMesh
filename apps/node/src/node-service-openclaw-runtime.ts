/**
 * OpenClaw runtime — gateway lifecycle, webhook ask/send, sync reply correlation.
 */
import { randomUUID } from "node:crypto";
import type { ChildProcess } from "node:child_process";
import type {
  BondRecord,
  ChatMessage,
  NodeConfig,
  NodeProfile,
  OwnerAgentTurnResult,
} from "@envoymesh/api";
import { ENVOY_AI_THREAD_KEY } from "@envoymesh/api";
import type {
  AgentIdentityStore,
  CapabilityManifestStore,
  HumanProfileStore,
  LocalChatLogStore,
  LocalTrustStore,
} from "@envoymesh/local-store";
import type { OpenClawRuntime } from "../../../packages/openclaw-runtime/src/index.js";
import { resolveBundledSkillsDir } from "./bundled-paths.js";
import { resolveAssistantAgentUrl } from "./bridge/config.js";
import { buildEnvoyMeshRetrievedContext } from "./openclaw-turn-context.js";
import {
  buildOpenClawGatewayAgentSection,
  buildOpenClawGatewaySearchEnv,
  buildOpenClawGatewaySkillEntries,
  isOpenClawEnvoymeshWebhookReady,
  resolveActiveWebSearchProvider,
} from "./openclaw-gateway-config.js";
import { reclaimAssistantGatewayPort } from "./openclaw-gateway-port.js";
import { spawnOpenClawGateway } from "./openclaw-gateway-spawn.js";
import { ensureOpenClawWorkspace, openClawGatewayStateDir } from "./openclaw-workspace.js";
import type { RagService } from "./rag-service.js";
import type { PersistedNodeConfig } from "./node-config-store.js";

export const OPEN_CLAW_REPLY_TIMEOUT_MS = 180_000;
export const OPEN_CLAW_RETRIEVED_CONTEXT_TIMEOUT_MS = 25_000;
export const OPEN_CLAW_STARTUP_PROBE_ATTEMPTS = 300; // 300 × 1s = 5 minutes for cold start
export const OPEN_CLAW_WATCHDOG_INTERVAL_MS = 60_000; // 1 minute between watchdog checks

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
}

export function createOpenClawRuntimeState(): OpenClawRuntimeState {
  return {
    runtime: null,
    gatewayChild: null,
    gatewayReady: false,
    startPromise: null,
    assistantAgentUrl: "http://127.0.0.1:18789/webhook/envoymesh",
    assistantAgentSecret: undefined,
    pendingReplies: new Map(),
    activeTurnTools: null,
    askInFlight: 0,
    gatewayRouteRegistered: false,
    lastProbeWarnAt: 0,
    askChain: Promise.resolve(),
    watchdogTimer: null,
    watchdogRunning: false,
  };
}

export interface OpenClawRuntimeDeps {
  getBonds(): Promise<BondRecord[]>;
  getNodeConfig(): Promise<NodeConfig>;
  getRagService(): Promise<RagService | null>;
  recordEnvoyAiChatMessage(msg: ChatMessage): void;
  persistEnvoyAiChatExchange(
    userText: string,
    turn: OwnerAgentTurnResult,
    humanMessageId?: string,
  ): Promise<void>;
  loadBridgeConfigWebSearchEnabled(): Promise<boolean | undefined>;
  loadBridgeConfigSkillApiKeys(): Promise<Record<string, string> | undefined>;
  getProfileDir(): string;
  getProfileOwnerId(): string | undefined;
  getProfile(): NodeProfile | null | undefined;
  getMeshPeerId(): string;
  getVaultDir(): string;
  humanProfileStore: HumanProfileStore;
  capabilityManifestStore: CapabilityManifestStore | null;
  agentIdentityStore: AgentIdentityStore | null;
  chatLogStore: LocalChatLogStore | null;
  trustStore: LocalTrustStore;
  loadConfig(): Promise<PersistedNodeConfig | undefined>;
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
      entry.reject(new Error(`OpenClaw reply timed out after ${OPEN_CLAW_REPLY_TIMEOUT_MS / 1000}s`));
    }, OPEN_CLAW_REPLY_TIMEOUT_MS);
    state.pendingReplies.set(correlationId, { resolve, reject, timer });
  });
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
  entry.reject(error);
}

export function rejectAllPendingOpenClawReplies(state: OpenClawRuntimeState, reason: string): void {
  for (const [, entry] of state.pendingReplies) {
    clearTimeout(entry.timer);
    entry.reject(new Error(reason));
  }
  state.pendingReplies.clear();
}

function setOpenClawGatewayReady(state: OpenClawRuntimeState, ready: boolean): void {
  state.gatewayReady = ready;
  if (!ready) {
    state.gatewayRouteRegistered = false;
  }
}

function assistantGatewayPort(state: OpenClawRuntimeState): number {
  try {
    const u = new URL(state.assistantAgentUrl);
    if (u.port) return Number(u.port);
    return u.protocol === "https:" ? 443 : 80;
  } catch {
    return 18789;
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
    if (await probeOpenClawWebhook(state, { quiet: true })) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

function startOpenClawWatchdog(state: OpenClawRuntimeState, deps: OpenClawRuntimeDeps): void {
  if (state.watchdogRunning) return;
  state.watchdogRunning = true;
  const tick = async () => {
    if (!state.watchdogRunning) return;
    if (
      state.gatewayChild &&
      !state.gatewayChild.killed &&
      !state.gatewayRouteRegistered
    ) {
      console.warn("[openclaw] Watchdog: gateway process alive but route unregistered — restarting");
      state.watchdogRunning = false;
      stopOpenClawWatchdog(state);
      await startOpenClawViaRuntime(state, deps);
      return;
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

  const providers = nodeConfig.modelProviders;
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
): Promise<{
  policyPrompt: string;
  retrievedContext: string;
}> {
  const turnContext = await buildOpenClawTurnContextViaRuntime(deps);
  const owner = deps.getProfile()?.owner;
  const displayName = turnContext.ownerDisplayName ?? owner?.ownerId ?? "unknown";
  const webSearchEnabled = (await deps.loadBridgeConfigWebSearchEnabled()) ?? true;
  const skillApiKeys = (await deps.loadBridgeConfigSkillApiKeys()) ?? {};
  const webSearch = resolveActiveWebSearchProvider({ webSearchEnabled, skillApiKeys });
  const { buildAgentConfig, buildOpenClawSystemPrompt } = await import(
    "../../../packages/openclaw-runtime/src/tool-bridge.js"
  );
  const agentConfig = buildAgentConfig({
    owner: {
      ownerId: owner?.ownerId ?? "unknown",
      displayName,
      interests: turnContext.interests ?? [],
      capabilities: turnContext.capabilities ?? [],
    },
    permissions: turnContext.permissions ?? {
      bondAutonomy: false,
      maxBondsPerDay: 0,
      autoCircleContacts: false,
      maxSensitivity: "public",
    },
    bonds: (turnContext.bonds ?? []).map((b) => ({
      displayName: b.name,
      level: b.level,
      dormantDays: b.dormantDays,
    })),
    model: turnContext.model ?? { provider: "disabled" },
    webSearch,
  });
  const policyPrompt = buildOpenClawSystemPrompt(displayName, agentConfig);

  const nodeConfig = await deps.getNodeConfig();
  const bonds = await deps.getBonds();
  let retrievedContext = "";
  if (owner?.ownerId) {
    try {
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
    const profile = await deps.humanProfileStore?.loadHumanProfile();
    if (profile?.displayName?.trim()) fromName = profile.displayName.trim();
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
        const resp = await fetch(state.assistantAgentUrl, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(OPEN_CLAW_REPLY_TIMEOUT_MS),
        });

        if (!resp.ok) {
          const detail = await resp.text().catch(() => "");
          const err = new Error(
            `OpenClaw webhook returned ${resp.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
          );
          if (resp.status === 404) {
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
    try { state.gatewayChild.kill("SIGTERM"); } catch { /* ignore */ }
    state.gatewayChild = null;
    setOpenClawGatewayReady(state, false);
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
  const defaultAssistantUrl = "http://127.0.0.1:18789/webhook/envoymesh";
  let assistantUrl = defaultAssistantUrl;
  let bridgeSecret: string | undefined;
  let bridgeListenPort = 3031;
  if (existsSync(cfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(cfgPath, "utf-8"));
      assistantUrl = resolveAssistantAgentUrl(cfg);
      bridgeSecret = typeof cfg?.secret === "string" && cfg.secret.trim() ? cfg.secret.trim() : undefined;
      if (typeof cfg?.listenPort === "number") bridgeListenPort = cfg.listenPort;
    } catch { /* use default */ }
  }
  state.assistantAgentUrl = assistantUrl;
  state.assistantAgentSecret = bridgeSecret;
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

  let modelProvider: Record<string, unknown> = {};
  try {
    const nodeCfg = await deps.getNodeConfig();
    if (nodeCfg?.modelProviders?.mode && nodeCfg.modelProviders.mode !== "disabled") {
      modelProvider = {
        provider: nodeCfg.modelProviders.mode,
        ...(nodeCfg.modelProviders.endpoint ? { baseUrl: nodeCfg.modelProviders.endpoint } : {}),
        ...(nodeCfg.modelProviders.apiKey ? { apiKey: nodeCfg.modelProviders.apiKey } : {}),
        ...(nodeCfg.modelProviders.modelName ? { model: nodeCfg.modelProviders.modelName } : {}),
      };
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

  writeFileSync(gwConfigPathAbs, JSON.stringify({
    gateway: { auth: { mode: "none" } },
    agents: {
      defaults: {
        skipBootstrap: true,
        workspace: workspaceDir,
        ...(modelProvider.provider && modelProvider.model
          ? { model: `${modelProvider.provider as string}/${modelProvider.model as string}` }
          : {}),
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
    ...(modelProvider.provider ? {
      models: {
        providers: {
          [modelProvider.provider as string]: {
            api: "openai-completions",
            ...(modelProvider.baseUrl ? { baseUrl: modelProvider.baseUrl } : {}),
            ...(modelProvider.apiKey ? { apiKey: modelProvider.apiKey } : {}),
            ...(modelProvider.model ? { models: [{ id: modelProvider.model, name: modelProvider.model, api: "openai-completions" }] } : {}),
          },
        },
      },
    } : {}),
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
  child.stderr?.on("data", (d: Buffer) => {
    const t = d.toString();
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
  child.on("exit", (code) => {
    if (code) console.warn(`[openclaw] gateway exited code ${code}`);
    state.gatewayChild = null;
    setOpenClawGatewayReady(state, false);
    stopOpenClawWatchdog(state);
    rejectAllPendingOpenClawReplies(state, "OpenClaw gateway stopped");
  });
  state.gatewayChild = child;
  setOpenClawGatewayReady(state, false);

  let gatewayReady = false;
  if (child.exitCode == null) {
    gatewayReady = await waitForOpenClawGatewayReady(state);
  } else {
    console.warn(
      `[openclaw] Gateway process exited before webhook was ready (code ${child.exitCode}). ` +
        `If port ${gatewayPort} is already in use by another OpenClaw instance, stop it first.`,
    );
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
  if (modelProvider.provider) {
    console.log("[openclaw] Model config:", JSON.stringify(modelProvider));
  }
  return gatewayReady;
}

export async function ensureOpenClawReadyViaRuntime(
  state: OpenClawRuntimeState,
  deps: OpenClawRuntimeDeps,
): Promise<boolean> {
  if (isOpenClawReadyViaRuntime(state)) return true;

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
  const proc = state.gatewayChild;
  state.gatewayChild = null;
  if (proc && !proc.killed) {
    try {
      proc.kill("SIGTERM");
      setTimeout(() => { if (!proc.killed) proc.kill("SIGKILL"); }, 3000);
    } catch { /* ignore */ }
  }
  state.runtime = null;
}

export async function askOpenClawViaRuntime(
  state: OpenClawRuntimeState,
  deps: OpenClawRuntimeDeps,
  prompt: string,
  _context?: {
    ownerDisplayName?: string;
    bonds?: Array<{ name: string; level: string; dormantDays?: number }>;
    interests?: string[];
    capabilities?: string[];
    permissions?: { bondAutonomy: boolean; maxBondsPerDay: number; autoCircleContacts: boolean; maxSensitivity: string };
    model?: { provider: string; baseUrl?: string; model?: string };
  },
): Promise<string> {
  if (!(await ensureOpenClawReadyViaRuntime(state, deps))) {
    throw new Error("OpenClaw not available");
  }
  const { policyPrompt, retrievedContext } = await buildEnvoyMeshOpenClawPrompts(deps, prompt);
  return withOpenClawAskLock(state, () =>
    askOpenClawViaWebhook(state, deps, prompt, { policyPrompt, retrievedContext }),
  );
}

export async function sendToOpenClawViaRuntime(
  state: OpenClawRuntimeState,
  deps: OpenClawRuntimeDeps,
  text: string,
): Promise<void> {
  const ownerId = deps.getProfileOwnerId() ?? "";
  const now = new Date().toISOString();
  const messageId = crypto.randomUUID();

  const outboundMsg: ChatMessage = {
    messageId,
    sender: {
      nodeId: deps.getMeshPeerId(),
      ownerId,
      displayName: ownerId,
      actorRole: "human",
    },
    recipient: {
      nodeId: ENVOY_AI_THREAD_KEY,
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
  deps.recordEnvoyAiChatMessage(outboundMsg);

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

  let fromName = ownerId;
  try {
    const profile = await deps.humanProfileStore?.loadHumanProfile();
    if (profile?.displayName?.trim()) fromName = profile.displayName.trim();
  } catch { /* use ownerId */ }

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
      const resp = await fetch(state.assistantAgentUrl, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(300_000),
      });
      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        console.warn(`[openclaw] webhook returned ${resp.status}: ${detail.slice(0, 200)}`);
        cancelOpenClawReply(state, correlationId, new Error(`OpenClaw webhook ${resp.status}`));
      }
    })(),
  ]);

  await deps.persistEnvoyAiChatExchange(text, {
    answer,
    domain: "knowledge",
    intent: "knowledge",
    toolsUsed: [],
    approvalItems: [],
    modelUsed: "openclaw",
  }, messageId);
}
