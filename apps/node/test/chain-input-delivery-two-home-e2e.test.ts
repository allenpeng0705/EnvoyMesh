/**
 * Phase 59E — two-home job-input workspace bytes + GC.
 *
 * Uses the proven two-node data-channel pattern (same voucher +
 * `/envoymesh/data` path as award delivery) then deletes
 * `imports/team-jobs/<chainId>/` via `gcChainInputWorkspace`.
 */

import {
  createDeviceCertificate,
  deriveDeviceId,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store";
import { EnvoyMesh } from "@envoymesh/network";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { chainInputDeliveredRelativePath, chainInputJobWorkspaceDir } from "@envoymesh/api";
import { installEnvoyDataTransferReceiver } from "../src/data-transfer-inbound.js";
import { sendVaultFileViaDataTransfer } from "../src/node-file-share.js";
import { gcChainInputWorkspace } from "../src/chain-input-delivery-runtime.js";
import { cleanupTempDir } from "./test-cleanup.js";
import { NodeServiceImpl } from "../src/node-service-impl.js";

const meshes: EnvoyMesh[] = [];
const profileDirs: string[] = [];

afterEach(async () => {
  await Promise.all(meshes.splice(0).map((m) => m.stop().catch(() => {})));
  await Promise.all(profileDirs.splice(0).map((d) => cleanupTempDir(d)));
});

interface TestNode {
  profileDir: string;
  vaultDir: string;
  profile: NodeProfile;
  mesh: EnvoyMesh;
  taskStore: ReturnType<typeof createLocalTaskStore>;
  trustStore: ReturnType<typeof createLocalTrustStore>;
  peerDirectory: ReturnType<typeof createLocalPeerDirectoryStore>;
  service: NodeServiceImpl;
}

async function startMesh(): Promise<EnvoyMesh> {
  const mesh = new EnvoyMesh({
    listen: ["/ip4/127.0.0.1/tcp/0"],
    enableMdns: false,
  });
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
  const profileDir = await mkdtemp(join(tmpdir(), "envoy-59e-"));
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
  return { profileDir, vaultDir, profile, mesh, taskStore, trustStore, peerDirectory, service };
}

async function registerBondedPeer(local: TestNode, remote: TestNode): Promise<void> {
  await local.trustStore.setTrustRecord({
    peerOwnerId: remote.profile.owner.ownerId,
    level: "direct",
    displayName: "Bonded peer",
  });
  const file = {
    version: "0.1" as const,
    records: [
      {
        version: "0.1" as const,
        ownerId: remote.profile.owner.ownerId,
        peerId: remote.mesh.peerId,
        deviceId: deriveDeviceId(remote.profile.device.publicKeyPem),
        devicePublicKeyPem: remote.profile.device.publicKeyPem,
        lastSeenAt: new Date().toISOString(),
        listenAddrs: remote.mesh.multiaddrs.map(String),
      },
    ],
  };
  await writeFile(join(local.profileDir, "peer-directory.json"), JSON.stringify(file, null, 2), {
    mode: 0o600,
  });
}

function installReceiver(node: TestNode): void {
  installEnvoyDataTransferReceiver({
    mesh: node.mesh,
    peerDirectoryStore: node.peerDirectory,
    taskStore: node.taskStore,
    vaultDir: node.vaultDir,
    resolveInboundRelativePath: (remotePeerId, voucherRelativePath) =>
      node.service.resolveInboundDataTransferRelativePath(remotePeerId, voucherRelativePath),
    onInboundVaultWriteCommitted: (remotePeerId, voucherSourceRelativePath) =>
      node.service.consumeInboundDataTransferSaveMapping(remotePeerId, voucherSourceRelativePath),
  });
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 15_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("Timed out waiting for condition");
}

describe("E2E two-home job input workspace + GC (Phase 59E)", () => {
  it("delivers bytes to imports/team-jobs/<chainId>/in then GCs the workspace", async () => {
    const alice = await createTestNode();
    const bob = await createTestNode();
    await registerBondedPeer(bob, alice);
    installReceiver(bob);

    const chainId = "chain_59e_e2e";
    const briefBody = "PHASE59E_TWO_HOME_BYTES\n";
    const sourceRel = "imports/team-jobs/tj_59e/brief.txt";
    await mkdir(join(alice.vaultDir, "imports/team-jobs/tj_59e"), { recursive: true });
    await writeFile(join(alice.vaultDir, sourceRel), briefBody, { mode: 0o600 });

    const voucherRel = chainInputDeliveredRelativePath(chainId, "brief.txt");
    await alice.mesh.probePeer(bob.mesh.multiaddrs[0]!);

    await sendVaultFileViaDataTransfer({
      mesh: alice.mesh,
      profile: alice.profile,
      taskStore: alice.taskStore,
      vaultDir: alice.vaultDir,
      relativePath: sourceRel,
      voucherRelativePath: voucherRel,
      toPeerId: bob.mesh.multiaddrs[0]!,
    });

    const bobFile = join(bob.vaultDir, voucherRel);
    await waitFor(async () => {
      try {
        return (await readFile(bobFile, "utf8")) === briefBody;
      } catch {
        return false;
      }
    });
    expect(await readFile(bobFile, "utf8")).toBe(briefBody);

    const gc = await gcChainInputWorkspace({ vaultDir: bob.vaultDir, chainId });
    expect(gc).toEqual({
      ok: true,
      removed: true,
      relativePath: chainInputJobWorkspaceDir(chainId),
    });
    await expect(access(join(bob.vaultDir, chainInputJobWorkspaceDir(chainId)))).rejects.toThrow();
  }, 30_000);
});
