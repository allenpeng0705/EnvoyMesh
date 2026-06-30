/**
 * Step 20b tests — agent-setup runtime (initNode / ensureAgentStores /
 * requireToolExecutionContext).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadOrCreateNodeProfile: vi.fn(async (dir: string) => ({
    owner: { ownerId: "owner-1" },
    device: {
      deviceId: "device-1",
      publicKeyPem: "-----BEGIN PUBLIC KEY-----\nPK\n-----END PUBLIC KEY-----",
      privateKeyPem: "-----BEGIN PRIVATE KEY-----\nPRIV\n-----END PRIVATE KEY-----",
    },
  })),
  createLocalTaskStore: vi.fn(() => ({ id: "task-store" })),
  pushNotificationService: { init: vi.fn(async () => undefined) },
  defaultBootstrapPresetsForDiscoveryProfile: vi.fn(() => ["preset-1"]),
}));

vi.mock("@envoymesh/local-store", () => ({
  loadOrCreateNodeProfile: mocks.loadOrCreateNodeProfile,
  createLocalTaskStore: mocks.createLocalTaskStore,
}));

vi.mock("@envoymesh/api", async () => {
  const actual = await vi.importActual("@envoymesh/api");
  return {
    ...actual,
    defaultBootstrapPresetsForDiscoveryProfile:
      mocks.defaultBootstrapPresetsForDiscoveryProfile,
  };
});

vi.mock("../src/push-notification.js", () => ({
  pushNotificationService: mocks.pushNotificationService,
}));

import {
  ensureAgentStoresViaRuntime,
  initNodeViaRuntime,
  requireToolExecutionContextViaRuntime,
  type AgentSetupContext,
} from "../src/node-service-agent-setup.js";

function makeCtx(
  overrides: Partial<AgentSetupContext> = {},
): AgentSetupContext {
  // Stateful profile + task-store so we can verify set*() takes effect.
  // Use a shared holder so overrides can still observe writes.
  const holder: { profile: unknown; store: unknown } = { profile: undefined, store: undefined };
  return {
    saveConfig: async () => {},
    loadConfig: async () => undefined,
    getProfileDir: () => "/profile",
    getProfile: () => holder.profile as never,
    setProfile: (p) => { holder.profile = p; },
    getTaskStore: () => holder.store,
    setTaskStore: (s) => { holder.store = s; },
    getNodeStatus: () => "running",
    getToolExecutionContext: async () => null,
    ...overrides,
  };
}

describe("initNodeViaRuntime", () => {
  beforeEach(() => {
    mocks.loadOrCreateNodeProfile.mockClear();
    mocks.createLocalTaskStore.mockClear();
    mocks.pushNotificationService.init.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it("returns owner/device identifiers and saves config", async () => {
    let saved: unknown;
    const out = await initNodeViaRuntime(
      makeCtx({ saveConfig: async (c) => { saved = c; } }),
      "/profile",
    );
    expect(out.profileDir).toBe("/profile");
    expect(out.ownerId).toBe("owner-1");
    expect(out.deviceId).toBe("device-1");
    expect(saved).toBeTruthy();
    expect((saved as { discoveryProfile: string }).discoveryProfile).toBe("lan-fast");
  });

  it("kicks off push notification init in the background", async () => {
    await initNodeViaRuntime(makeCtx(), "/profile");
    expect(mocks.pushNotificationService.init).toHaveBeenCalledWith("/profile");
  });

  it("uses the discovery-profile override when provided", async () => {
    let saved: { discoveryProfile: string; bootstrapPresets: string[] } | undefined;
    await initNodeViaRuntime(
      makeCtx({ saveConfig: async (c) => { saved = c as never; } }),
      "/profile",
      { discoveryProfile: "internet" },
    );
    expect(saved?.discoveryProfile).toBe("internet");
    expect(saved?.bootstrapPresets).toEqual(["preset-1"]);
  });
});

describe("ensureAgentStoresViaRuntime", () => {
  beforeEach(() => {
    mocks.loadOrCreateNodeProfile.mockClear();
    mocks.createLocalTaskStore.mockClear();
  });
  afterEach(() => vi.clearAllMocks());

  it("returns true when profile+store already set and config has no profileDir", async () => {
    const out = await ensureAgentStoresViaRuntime(
      makeCtx({
        loadConfig: async () => ({ profileDir: undefined }) as never,
        getProfile: () => ({ owner: { ownerId: "x" } }) as never,
        getTaskStore: () => ({ id: "s" }),
      }),
    );
    expect(out).toBe(true);
    expect(mocks.createLocalTaskStore).not.toHaveBeenCalled();
  });

  it("returns false when profile+store both missing and no config profileDir", async () => {
    const out = await ensureAgentStoresViaRuntime(
      makeCtx({ loadConfig: async () => undefined }),
    );
    expect(out).toBe(false);
  });

  it("loads profile + creates store when config has profileDir", async () => {
    const out = await ensureAgentStoresViaRuntime(
      makeCtx({
        loadConfig: async () => ({ profileDir: "/profile" }) as never,
      }),
    );
    expect(out).toBe(true);
    expect(mocks.loadOrCreateNodeProfile).toHaveBeenCalledWith("/profile");
    expect(mocks.createLocalTaskStore).toHaveBeenCalledWith("/profile");
  });
});

describe("requireToolExecutionContextViaRuntime", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns the tool context when stores are ready", async () => {
    const ctx = { id: "ctx" };
    const out = await requireToolExecutionContextViaRuntime(
      makeCtx({
        getProfile: () => ({ owner: { ownerId: "x" } }) as never,
        getTaskStore: () => ({ id: "s" }),
        getToolExecutionContext: async () => ctx as never,
      }),
    );
    expect(out).toBe(ctx);
  });

  it("throws 'still starting' when status is starting and stores are missing", async () => {
    await expect(
      requireToolExecutionContextViaRuntime(
        makeCtx({ getNodeStatus: () => "starting" }),
      ),
    ).rejects.toThrow(/still starting/);
  });

  it("throws 'offline' when status is offline and stores are missing", async () => {
    await expect(
      requireToolExecutionContextViaRuntime(
        makeCtx({ getNodeStatus: () => "offline" }),
      ),
    ).rejects.toThrow(/offline/);
  });

  it("throws 'not set up' when no config is available", async () => {
    await expect(
      requireToolExecutionContextViaRuntime(
        makeCtx({ loadConfig: async () => undefined }),
      ),
    ).rejects.toThrow(/not set up/);
  });

  it("throws 'agent identity' when getToolExecutionContext returns null", async () => {
    await expect(
      requireToolExecutionContextViaRuntime(
        makeCtx({
          getProfile: () => ({ owner: { ownerId: "x" } }) as never,
          getTaskStore: () => ({ id: "s" }),
          getToolExecutionContext: async () => null,
        }),
      ),
    ).rejects.toThrow(/agent identity/);
  });
});