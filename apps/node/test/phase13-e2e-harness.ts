/**
 * Shared helpers for Phase 13 E2E tests (NodeServiceImpl + EnvoyMesh).
 */
import {
  createAgentCredential,
  createDeviceCertificate,
  deriveDeviceId,
  derivePeerId,
  generateAgentIdentity,
  generateDeviceIdentity,
  generateOwnerIdentity,
  signUnsignedEnvelope,
  verifyInboundEnvelope,
} from "@envoymesh/identity";
import {
  createAgentCardStore,
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  createTaskRuntimeStateStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import {
  createChatMessagePayload,
  createUnsignedEnvelope,
  type EnvoyEnvelope,
} from "@envoymesh/protocol";
import { ApprovalQueue, isA2ATaskIntent } from "@envoymesh/api";
import { EnvoyMesh } from "@envoymesh/network";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadBridgeIdentity, saveBridgeIdentity } from "../src/bridge/identity-store.js";
import type { BridgeIdentity } from "../src/bridge/pipe.js";
import { handleDaemonAgentCardInbound } from "../src/daemon-agent-card-inbound.js";
import { handleDaemonTaskInbound } from "../src/daemon-task-inbound.js";
import { createInboundMessageGuard } from "../src/inbound-guard.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

export const phase13Meshes: EnvoyMesh[] = [];
export const phase13ProfileDirs: string[] = [];

export interface Phase13TestNode {
  profileDir: string;
  vaultDir: string;
  profile: NodeProfile;
  mesh: EnvoyMesh;
  taskStore: ReturnType<typeof createLocalTaskStore>;
  taskRuntimeStore: ReturnType<typeof createTaskRuntimeStateStore>;
  trustStore: ReturnType<typeof createLocalTrustStore>;
  peerDirectory: ReturnType<typeof createLocalPeerDirectoryStore>;
  human: ReturnType<typeof createHumanProfileStore>;
  service: NodeServiceImpl;
}

export async function startPhase13Mesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({ listen: ["/ip4/127.0.0.1/tcp/0"], enableMdns: false });
  await mesh.start();
  phase13Meshes.push(mesh);
  return mesh;
}

export function phase13TestProfile(): NodeProfile {
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

export async function createPhase13TestNode(): Promise<Phase13TestNode> {
  const profileDir = await mkdtemp(join(tmpdir(), "envoymesh-phase13-"));
  phase13ProfileDirs.push(profileDir);
  const vaultDir = join(profileDir, "vault");
  await mkdir(vaultDir, { recursive: true });

  const profile = phase13TestProfile();
  const mesh = await startPhase13Mesh();
  const taskStore = createLocalTaskStore(profileDir);
  const taskRuntimeStore = createTaskRuntimeStateStore(profileDir);
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
  return { profileDir, vaultDir, profile, mesh, taskStore, taskRuntimeStore, trustStore, peerDirectory, human, service };
}

export async function registerBondedPeer(
  local: Phase13TestNode,
  remote: Phase13TestNode,
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

/** Persist bridge agent identity (required for requestAgentCard / agent.card). */
export async function ensureBridgeIdentity(node: Phase13TestNode): Promise<BridgeIdentity> {
  const existing = await loadBridgeIdentity(node.profileDir);
  if (existing) return existing;
  const agent = generateAgentIdentity(node.profile.owner.ownerId);
  const identity: BridgeIdentity = {
    agentPeerId: agent.agentPeerId,
    agentPublicKeyPem: agent.publicKeyPem,
    agentPrivateKeyPem: agent.privateKeyPem,
    ownerId: node.profile.owner.ownerId,
    agentCredential: createAgentCredential({
      owner: node.profile.owner,
      agent,
      scope: [
        "message.send",
        "task.execute",
        "agent.card.request",
        "agent.card.response",
        "task.mandate",
        "task.propose",
        "task.negotiate",
        "task.accept",
        "task.result",
        "report.create",
      ],
    }),
  };
  await saveBridgeIdentity(node.profileDir, identity);
  return identity;
}

/** Mirror `apps/node/src/index.ts` agent.card inbound path on the test mesh. */
export function wireProductionAgentCardHandlers(
  node: Phase13TestNode,
  bridgeIdentity: BridgeIdentity,
): void {
  wireFullDaemonAgentCardHandlers(node, bridgeIdentity);
}

/** Daemon agent.card path with inbound guard (matches production `index.ts` wiring). */
export function wireFullDaemonAgentCardHandlers(
  node: Phase13TestNode,
  bridgeIdentity: BridgeIdentity,
  opts?: { inboundGuard?: ReturnType<typeof createInboundMessageGuard> },
): void {
  const agentCardStore = createAgentCardStore(node.profileDir);
  const guard = opts?.inboundGuard ?? createInboundMessageGuard();

  node.mesh.onMessage(async ({ envelope: inboundEnvelope, remotePeerId }) => {
    const guardDecision = guard.inspect(inboundEnvelope);
    if (guardDecision.action === "reject") return;
    const envelope = guardDecision.envelope;
    if (!verifyInboundEnvelope(envelope)) return;

    const result = await handleDaemonAgentCardInbound({
      envelope,
      profile: node.profile,
      remotePeerId,
      receivedAt: Date.now(),
      correlationId: envelope.correlationId,
      taskStore: node.taskStore,
      trustStore: node.trustStore,
      agentCardStore,
      humanProfileStore: node.human,
      bridgeIdentity,
      mesh: node.mesh,
      nodeService: node.service,
    });
    void result;
  });
}

export function wireNodeServiceInboundHandlers(
  node: Phase13TestNode,
  opts?: { approvalQueue?: ApprovalQueue },
): void {
  if (opts?.approvalQueue) {
    node.service.bindApprovalQueue(opts.approvalQueue);
  }
  const internal = node.service as NodeServiceImpl & {
    _inboundGuard?: ReturnType<typeof createInboundMessageGuard>;
    _wireMeshEvents?: () => void;
  };
  internal._inboundGuard = createInboundMessageGuard();
  internal._wireMeshEvents();
}

export async function deliverHumanChat(
  from: Phase13TestNode,
  to: Phase13TestNode,
  text: string,
  messageId?: string,
): Promise<void> {
  const envelope = signedHumanChatEnvelope(from, to.mesh, text, messageId);
  await from.mesh.sendChat(to.mesh.multiaddrs[0]!, envelope);
}

export async function deliverAgentChat(
  fromAgent: {
    agentPeerId: string;
    publicKeyPem: string;
    privateKeyPem: string;
    ownerId: string;
    credential: import("@envoymesh/protocol").AgentCredential;
  },
  fromMesh: EnvoyMesh,
  to: Phase13TestNode,
  text: string,
  messageId = "chat-agent-1",
): Promise<void> {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: fromAgent.agentPeerId,
    senderPublicKey: fromAgent.publicKeyPem,
    senderRole: "agent",
    recipientPeerId: to.mesh.peerId,
    recipientRole: "human",
    intent: "chat.message",
    payload: createChatMessagePayload({
      senderOwnerId: fromAgent.ownerId,
      text,
    }),
    agentCredential: fromAgent.credential,
    messageId,
    createdAt: new Date().toISOString(),
  });
  const signed = signUnsignedEnvelope(unsigned, fromAgent.privateKeyPem);
  await fromMesh.sendChat(to.mesh.multiaddrs[0]!, signed);
}

export function signedHumanChatEnvelope(
  sender: Phase13TestNode,
  recipientMesh: EnvoyMesh,
  text: string,
  messageId = "chat-human-1",
): EnvoyEnvelope {
  const unsigned = createUnsignedEnvelope({
    senderPeerId: derivePeerId(sender.profile.device.publicKeyPem),
    senderPublicKey: sender.profile.device.publicKeyPem,
    senderRole: "human",
    recipientPeerId: recipientMesh.peerId,
    recipientRole: "human",
    intent: "chat.message",
    payload: createChatMessagePayload({
      senderOwnerId: sender.profile.owner.ownerId,
      text,
    }),
    messageId,
    createdAt: new Date().toISOString(),
  });
  return signUnsignedEnvelope(unsigned, sender.profile.device.privateKeyPem);
}

/** Production A2A task inbound path (runtime gate + Activity hooks). */
export async function simulateDaemonTaskInbound(
  receiver: Phase13TestNode,
  envelope: EnvoyEnvelope,
  remotePeerId: string,
): Promise<void> {
  await handleDaemonTaskInbound({
    envelope,
    remotePeerId,
    receivedAt: Date.now(),
    correlationId: envelope.correlationId,
    taskStore: receiver.taskStore,
    taskRuntimeStore: receiver.taskRuntimeStore,
    nodeService: receiver.service,
    senderOwnerId: envelope.agentCredential?.ownerId,
  });
}

/** Wire production task inbound handler on the test mesh. */
export function wireFullDaemonTaskInboundHandler(receiver: Phase13TestNode): void {
  receiver.mesh.onMessage(async ({ envelope, remotePeerId }) => {
    if (!isA2ATaskIntent(envelope.intent)) return;
    await simulateDaemonTaskInbound(receiver, envelope, remotePeerId);
  });
}

/** @deprecated Use wireFullDaemonTaskInboundHandler */
export function wireDaemonTaskInboundHandler(receiver: Phase13TestNode): void {
  wireFullDaemonTaskInboundHandler(receiver);
}

export async function waitForPhase13(
  check: () => boolean | Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("waitForPhase13 timeout");
}

export async function cleanupPhase13Harness(): Promise<void> {
  await Promise.all(phase13Meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(
    phase13ProfileDirs.splice(0).map((d) => rm(d, { recursive: true, force: true }).catch(() => {})),
  );
}

export function chatAssistApprovalConfig(ownerId: string, peerOwnerId: string) {
  return {
    chatAssistEnabled: true,
    autonomousKillSwitch: true,
    autonomousPolicies: [
      { domain: "social" as const, maxSensitivity: "friends" as const, autoAnswer: true, autoSendChat: true },
    ],
    contactAiPreferences: [{ peerOwnerId, aiAccessLevel: "full" as const }],
    modelProviders: { mode: "mock" as const },
    aiSettings: {
      status: { onlineAssistantEnabled: true, offlineAgentEnabled: false, statusMode: "automatic" as const },
      identity: { mode: "transparent" as const },
      defaultModeForNewContacts: "manual" as const,
      rules: [
        {
          id: "greet",
          enabled: true,
          name: "Greet",
          category: "availability" as const,
          priority: 1,
          trigger: { isGreeting: true },
          action: { type: "draft" as const, template: "Hi there, thanks for your message!" },
        },
      ],
    },
  };
}
