/**
 * Phase 44 — Ext Agent sidecar integration: HomeClaw, Hermes, OpenHuman, Pi.
 *
 * Spawns reference sidecars in echo mode and verifies health probe + full
 * bridge round-trip (forwardToAgent → sidecar → /bridge/send → P2P reply).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyBridgeConfigResolution,
  BridgeConfigSchema,
  forwardToAgent,
  probeExtAgentHealth,
  resolveBridgeStatusAgentType,
} from "../src/bridge/index.js";
import { createAgentCredential, generateAgentIdentity, generateOwnerIdentity } from "@envoymesh/identity";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function getFreePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitForHealth(statusUrl: string, attempts = 40): Promise<void> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(statusUrl, { signal: AbortSignal.timeout(500) });
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`sidecar not ready: ${statusUrl} (${String(lastErr)})`);
}

interface SidecarHandle {
  url: string;
  close: () => Promise<void>;
}

async function startSidecar(
  scriptRel: string,
  env: Record<string, string>,
): Promise<SidecarHandle> {
  const port = await getFreePort();
  const scriptPath = path.join(REPO_ROOT, scriptRel);
  const proc: ChildProcess = spawn(process.execPath, [scriptPath], {
    env: { ...process.env, PORT: String(port), ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const statusUrl = `http://127.0.0.1:${port}/status`;
  await waitForHealth(statusUrl);
  return {
    url: `http://127.0.0.1:${port}/message`,
    close: () =>
      new Promise((resolve) => {
        proc.once("exit", () => resolve());
        proc.kill("SIGTERM");
        setTimeout(() => {
          try {
            proc.kill("SIGKILL");
          } catch {
            /* ignore */
          }
          resolve();
        }, 2000);
      }),
  };
}

const ADAPTERS = [
  {
    id: "homeclaw",
    script: "tools/ext-agent-adapters/homeclaw/server.mjs",
    echoPrefix: "[HomeClaw echo]",
    sidecarEnv: {} as Record<string, string>,
  },
  {
    id: "hermes",
    script: "tools/ext-agent-adapters/hermes/server.mjs",
    echoPrefix: "[Hermes echo]",
    sidecarEnv: {},
  },
  {
    id: "openhuman",
    script: "tools/ext-agent-adapters/openhuman/server.mjs",
    echoPrefix: "[OpenHuman echo]",
    sidecarEnv: {},
  },
  {
    id: "pi",
    script: "tools/ext-agent-adapters/pi/server.mjs",
    echoPrefix: "[Pi echo]",
    sidecarEnv: { PI_ECHO: "1" },
  },
] as const;

describe("Ext Agent sidecars (HomeClaw, Hermes, OpenHuman, Pi)", () => {
  const handles: Array<{ close: () => Promise<void> }> = [];

  afterEach(async () => {
    await Promise.all(handles.splice(0).map((h) => h.close()));
  });

  it("resolveBridgeStatusAgentType is always external", () => {
    expect(resolveBridgeStatusAgentType()).toBe("external");
  });

  for (const adapter of ADAPTERS) {
    it(`${adapter.id}: health probe passes`, async () => {
      const sidecar = await startSidecar(adapter.script, adapter.sidecarEnv);
      handles.push(sidecar);
      const ok = await probeExtAgentHealth(sidecar.url, "envoymesh-message");
      expect(ok).toBe(true);
    });

    it(`${adapter.id}: round-trip via bridge /bridge/send`, async () => {
      const { createBridge } = await import("../src/bridge/index.js");
      const owner = generateOwnerIdentity();
      const agent = generateAgentIdentity(owner.ownerId);
      const identity = {
        agentPeerId: agent.agentPeerId,
        agentPublicKeyPem: agent.publicKeyPem,
        agentPrivateKeyPem: agent.privateKeyPem,
        ownerId: owner.ownerId,
        agentCredential: createAgentCredential({ owner, agent, scope: ["chat.message"] }),
      };

      const bridgePort = await getFreePort();
      const bridgeSecret = "sidecar-test-secret";
      const senderPeerId = "12D3KooWSenderPeerForSidecarTest";

      const sendChat = vi.fn().mockResolvedValue(undefined);
      const bridge = createBridge({
        config: applyBridgeConfigResolution(
          BridgeConfigSchema.parse({
            enabled: true,
            listenPort: bridgePort,
            secret: bridgeSecret,
            activeExtAgent: adapter.id,
            extAgents: [],
            agentUrl: "http://127.0.0.1:1/message",
          }),
        ),
        identity,
        mesh: { peerId: "self", sendChat } as any,
        getRecipientPeerId: vi.fn().mockImplementation(async (id: string) => id),
      });
      handles.push({ close: () => bridge.stop() });

      const sidecar = await startSidecar(adapter.script, {
        ...adapter.sidecarEnv,
        BRIDGE_URL: `http://127.0.0.1:${bridgePort}/bridge/send`,
        BRIDGE_SECRET: bridgeSecret,
      });
      handles.push(sidecar);

      bridge.updateConfig(
        BridgeConfigSchema.parse({
          enabled: true,
          listenPort: bridgePort,
          secret: bridgeSecret,
          activeExtAgent: adapter.id,
          extAgents: [
            {
              id: adapter.id,
              name: adapter.id,
              adapter: "envoymesh-message",
              url: sidecar.url,
              enabled: true,
            },
          ],
        }),
      );

      await forwardToAgent(bridge.getConfig(), {
        senderPeerId,
        senderOwnerId: "envoy:owner:sender",
        text: "hello sidecar",
      });

      for (let i = 0; i < 50 && sendChat.mock.calls.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(sendChat).toHaveBeenCalledTimes(1);
      const envelope = sendChat.mock.calls[0]![1];
      expect(envelope.intent).toBe("chat.message");
      expect((envelope.payload as { text: string }).text).toBe(`${adapter.echoPrefix} hello sidecar`);
    });
  }
});
