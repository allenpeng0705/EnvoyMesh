/**
 * P1: bridge execute-tool + libp2p discovery + async discovery.response → mesh.async_reply at agent URL.
 */
import * as http from "node:http";
import {
  createDeviceCertificate,
  deriveDeviceId,
  derivePeerId,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createDiscoveryResponsePayload,
  createUnsignedEnvelope,
} from "@envoymesh/protocol";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBridge } from "../src/bridge/index.js";
import { loadBridgeIdentity } from "../src/bridge/identity-store.js";
import { resetBridgeAsyncReplyRateLimitForTests } from "../src/bridge/async-mesh-reply.js";
import { handleInboundDiscoveryIntent } from "../src/discovery-inbound.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";
import { executeTool, listTools } from "../src/tool-registry.js";

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];
const servers: http.Server[] = [];

afterEach(async () => {
  resetBridgeAsyncReplyRateLimitForTests();
  await Promise.all(servers.splice(0).map((s) => new Promise<void>((r) => s.close(() => r()))));
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(profileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

interface TestNode {
  profileDir: string;
  vaultDir: string;
  profile: NodeProfile;
  mesh: EnvoyMesh;
  taskStore: ReturnType<typeof createLocalTaskStore>;
  trustStore: ReturnType<typeof createLocalTrustStore>;
  peerDirectory: ReturnType<typeof createLocalPeerDirectoryStore>;
  human: ReturnType<typeof createHumanProfileStore>;
  service: NodeServiceImpl;
}

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({ listen: ["/ip4/127.0.0.1/tcp/0"], enableMdns: false });
  await mesh.start();
  meshes.push(mesh);
  return mesh;
}

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send", "task.execute"],
    }),
  };
}

async function createTestNode(): Promise<TestNode> {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-bridge-disc-async-"));
  profileDirs.push(profileDir);
  const vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });

  const profile = testProfile();
  const mesh = await startMesh();
  const taskStore = createLocalTaskStore(profileDir);
  const trustStore = createLocalTrustStore(profileDir);
  const peerDirectory = createLocalPeerDirectoryStore(profileDir);
  const human = createHumanProfileStore(profileDir);
  const service = new NodeServiceImpl(
    mesh,
    trustStore,
    peerDirectory,
    human,
    profileDir,
    profile,
    vaultDir,
  );
  service.bindCliTaskStore(taskStore);
  service.bindExternalMesh(mesh);
  return { profileDir, vaultDir, profile, mesh, taskStore, trustStore, peerDirectory, human, service };
}

async function registerBondedPeer(
  local: TestNode,
  remote: TestNode,
  displayName: string,
): Promise<void> {
  await local.trustStore.setTrustRecord({
    peerOwnerId: remote.profile.owner.ownerId,
    level: "direct",
    displayName,
  });
  await writeFile(
    join(local.profileDir, "peer-directory.json"),
    JSON.stringify(
      {
        version: "0.1",
        records: [
          {
            version: "0.1",
            ownerId: remote.profile.owner.ownerId,
            peerId: remote.mesh.peerId,
            deviceId: deriveDeviceId(remote.profile.device.publicKeyPem),
            devicePublicKeyPem: remote.profile.device.publicKeyPem,
            lastSeenAt: new Date().toISOString(),
            listenAddrs: remote.mesh.multiaddrs.map(String),
          },
        ],
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
}

function wireDiscoveryHandler(node: TestNode): void {
  node.mesh.onMessage(async ({ envelope, remotePeerId, replyWithEnvelope }) => {
    if (!verifyInboundEnvelope(envelope)) return;
    if (envelope.intent !== "discovery.request" && envelope.intent !== "discovery.response") return;
    const discovery = await handleInboundDiscoveryIntent({
      envelope,
      profile: node.profile,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: envelope.correlationId,
      taskStore: node.taskStore,
      trustStore: node.trustStore,
      capabilityManifest: { version: "0.1", capabilities: [], topics: [] },
      anonymousDiscoveryMode: "off",
      vaultDir: node.vaultDir,
      profileDir: node.profileDir,
    });
    if (!discovery.ok || envelope.intent !== "discovery.request" || !discovery.responsePayload) return;
    if (!replyWithEnvelope) return;
    const unsignedResponse = createUnsignedEnvelope({
      senderPeerId: derivePeerId(node.profile.device.publicKeyPem),
      senderPublicKey: node.profile.device.publicKeyPem,
      recipientPeerId: envelope.senderPeerId,
      intent: "discovery.response",
      payload: createDiscoveryResponsePayload(discovery.responsePayload),
      correlationId: envelope.correlationId,
    });
    const signedResponse = signUnsignedEnvelope(unsignedResponse, node.profile.device.privateKeyPem);
    await replyWithEnvelope(signedResponse);
  });
}

async function sendAsyncDiscoveryResponseToAgent(input: {
  bob: TestNode;
  aliceMeshPeerId: string;
  agentPeerId: string;
  correlationId: string;
  responsePayload: ReturnType<typeof createDiscoveryResponsePayload>;
}): Promise<void> {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(input.bob.profile.device.publicKeyPem),
    senderPublicKey: input.bob.profile.device.publicKeyPem,
    recipientPeerId: input.agentPeerId,
    intent: "discovery.response",
    payload: input.responsePayload,
    correlationId: input.correlationId,
  });
  const signed = signUnsignedEnvelope(unsigned, input.bob.profile.device.privateKeyPem);
  await input.bob.mesh.send(input.aliceMeshPeerId, signed);
}

async function getFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for condition");
}

describe("E2E bridge discovery async reply (ADB-E)", () => {
  it("execute-tool discovery.search + async discovery.response shares correlationId at agent URL", async () => {
    const agentPosts: Array<Record<string, unknown>> = [];
    const agentPort = await getFreePort();
    const agentServer = http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        try {
          agentPosts.push(JSON.parse(body) as Record<string, unknown>);
        } catch {
          agentPosts.push({ raw: body });
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("{}");
      });
    });
    servers.push(agentServer);
    await new Promise<void>((resolve) => agentServer.listen(agentPort, "127.0.0.1", resolve));

    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(alice, bob, "Bob");
    await registerBondedPeer(bob, alice, "Alice");

    await mkdir(join(bob.vaultDir, "docs"), { recursive: true });
    await writeFile(join(bob.vaultDir, "docs/bridge-findme.txt"), "bridge async e2e", { mode: 0o600 });
    const bobDoc = (await bob.service.listLibraryItems()).find((i) => i.relativePath.includes("bridge-findme"));
    await bob.service.setLibraryItemPublished(bobDoc!.documentId, true);

    await alice.service.getToolExecutionContext();
    const bridgeIdentity = await loadBridgeIdentity(alice.profileDir);
    expect(bridgeIdentity).not.toBeNull();

    wireDiscoveryHandler(bob);

    const bridgePort = await getFreePort();
    const bridge = createBridge({
      config: {
        enabled: true,
        agentUrl: `http://127.0.0.1:${agentPort}/message`,
        listenPort: bridgePort,
        secret: "bridge-secret",
      },
      identity: bridgeIdentity!,
      mesh: alice.mesh,
      getRecipientPeerId: async (ownerOrPeerId) => {
        const records = await alice.peerDirectory.listPeerRecords();
        const rec = records.find((r) => r.ownerId === ownerOrPeerId || r.peerId === ownerOrPeerId);
        return rec?.peerId ?? null;
      },
      executeTool: async (toolName, params) => {
        const ctx = await alice.service.getToolExecutionContext();
        if (!ctx) throw new Error("tool context unavailable");
        return executeTool(toolName, params, ctx);
      },
      listTools: () => listTools(),
    });

    alice.mesh.onMessage(({ envelope, remotePeerId }) => {
      if (envelope.recipientPeerId !== bridge.agentPeerId) return;
      void bridge._handleMessage(envelope, remotePeerId);
    });

    await alice.mesh.dial(bob.mesh.multiaddrs[0]!);

    try {
      const discRes = await fetch(`http://127.0.0.1:${bridgePort}/bridge/execute-tool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer bridge-secret",
        },
        body: JSON.stringify({
          toolName: "discovery.search",
          params: {
            targetOwnerId: bob.profile.owner.ownerId,
            fileTitleQuery: "bridge-findme",
          },
        }),
      });
      expect(discRes.ok).toBe(true);
      const discJson = (await discRes.json()) as {
        ok: boolean;
        result: {
          ok: boolean;
          correlationId?: string;
          result?: { matches?: Array<{ libraryMatches?: unknown[] }> };
        };
      };
      expect(discJson.result.ok).toBe(true);
      expect(discJson.result.result?.matches?.some((m) => (m.libraryMatches?.length ?? 0) > 0)).toBe(true);
      const correlationId = discJson.result.correlationId;
      expect(correlationId).toBeTruthy();

      await sendAsyncDiscoveryResponseToAgent({
        bob,
        aliceMeshPeerId: alice.mesh.peerId,
        agentPeerId: bridgeIdentity!.agentPeerId,
        correlationId: correlationId!,
        responsePayload: createDiscoveryResponsePayload(discJson.result.result!),
      });

      await waitFor(() =>
        agentPosts.some(
          (p) => p.type === "mesh.async_reply" && p.correlationId === correlationId,
        ),
      );

      const asyncReply = agentPosts.find(
        (p) => p.type === "mesh.async_reply" && p.correlationId === correlationId,
      );
      expect(asyncReply?.intent).toBe("discovery.response");
    } finally {
      await bridge.stop();
    }
  }, 45_000);
});
