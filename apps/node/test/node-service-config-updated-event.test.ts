/**
 * Regression: updateNodeConfig must emit `config:updated` so index.ts
 * runtime caches (auto-send, kill switch, model, contact AI prefs) refresh
 * without a process restart.
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoy-config-updated-"));
  vaultDir = await mkdtemp(join(tmpdir(), "envoy-vault-cfg-"));
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
  await rm(vaultDir, { recursive: true, force: true });
});

function createService(): NodeServiceImpl {
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  const svc = new NodeServiceImpl(
    undefined,
    trustStore,
    peerDirectory,
    human,
    profileDir,
    undefined,
    vaultDir,
  );
  svc.bindCliTaskStore(createLocalTaskStore(profileDir));
  return svc;
}

describe("updateNodeConfig emits config:updated", () => {
  it("emits config:updated with autoSendChat and contact prefs after toggle", async () => {
    const svc = createService();
    const seen: Array<Record<string, unknown>> = [];
    svc.on("config:updated", (data) => {
      seen.push(data as unknown as Record<string, unknown>);
    });

    await svc.updateNodeConfig({
      chatAssistEnabled: true,
      autonomousKillSwitch: false,
      autonomousPolicies: [
        {
          domain: "social",
          maxSensitivity: "friends",
          autoAnswer: false,
          autoSendChat: true,
        },
      ],
      contactAiPreferences: [
        {
          peerOwnerId: "envoy:owner:test",
          aiAccessLevel: "full",
          knowledgeAccess: "public",
          priority: "high",
        },
      ],
      trustModeEnabled: true,
    });

    expect(seen).toHaveLength(1);
    const payload = seen[0]!;
    expect(payload.chatAssistEnabled).toBe(true);
    expect(payload.autonomousKillSwitch).toBe(false);
    expect(payload.trustModeEnabled).toBe(true);
    const policies = payload.autonomousPolicies as Array<{ autoSendChat?: boolean }>;
    expect(policies.some((p) => p.autoSendChat === true)).toBe(true);
    const prefs = payload.contactAiPreferences as Array<{ peerOwnerId: string; aiAccessLevel: string }>;
    expect(prefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          peerOwnerId: "envoy:owner:test",
          aiAccessLevel: "full",
        }),
      ]),
    );
  });

  it("also emits home:config-updated with full config", async () => {
    const svc = createService();
    let homeConfig: { autonomousPolicies?: Array<{ autoSendChat?: boolean }> } | null = null;
    svc.on("home:config-updated", (data) => {
      homeConfig = data.config as typeof homeConfig;
    });

    await svc.updateNodeConfig({
      autonomousPolicies: [
        {
          domain: "social",
          maxSensitivity: "friends",
          autoAnswer: false,
          autoSendChat: true,
        },
      ],
    });

    expect(homeConfig).not.toBeNull();
    expect(homeConfig!.autonomousPolicies?.some((p) => p.autoSendChat === true)).toBe(true);
  });
});
