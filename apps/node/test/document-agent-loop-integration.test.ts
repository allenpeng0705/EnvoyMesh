/**
 * Integration: native Envoy AI document turn via ToolRegistry + NodeServiceImpl.
 */
import {
  createDeviceCertificate,
  generateDeviceIdentity,
  generateOwnerIdentity,
} from "@envoymesh/identity";
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
} from "@envoymesh/local-store";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NodeServiceImpl } from "../src/node-service-impl.js";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-doc-agent-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(join(vaultDir, "docs"), { recursive: true });
  await writeFile(join(vaultDir, "docs/report.txt"), "hello-doc-agent", { mode: 0o600 });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function testProfile() {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send"],
    }),
  };
}

describe("NodeServiceImpl.runDocumentAgentTurn", () => {
  it("lists vault library through native tool context", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectory = createLocalPeerDirectoryStore(profileDir);
    const human = createHumanProfileStore(profileDir);
    const fakeMesh = { peerId: "local-peer" };

    const node = new NodeServiceImpl(
      fakeMesh as any,
      trustStore,
      peerDirectory,
      human,
      profileDir,
      profile,
      vaultDir,
    );
    node.bindCliTaskStore(taskStore);

    const turn = await node.runDocumentAgentTurn("list my library files");
    expect(turn.intent).toBe("list_library");
    expect(turn.toolsUsed).toContain("mesh.library_list");
    expect(turn.answer).toContain("report.txt");
  });

  it("getToolExecutionContext works without pre-existing bridge identity file", async () => {
    const profile = testProfile();
    const taskStore = createLocalTaskStore(profileDir);
    const node = new NodeServiceImpl(
      undefined,
      createLocalTrustStore(profileDir),
      createLocalPeerDirectoryStore(profileDir),
      createHumanProfileStore(profileDir),
      profileDir,
      profile,
      vaultDir,
    );
    node.bindCliTaskStore(taskStore);
    const ctx = await node.getToolExecutionContext();
    expect(ctx).not.toBeNull();
    expect(ctx!.ownerIdentity.ownerId).toBe(profile.owner.ownerId);
    expect(ctx!.listLibraryItems).toBeTypeOf("function");
    expect(ctx!.setLibraryItemPublished).toBeTypeOf("function");
    expect(ctx!.submitAgentShareProposal).toBeTypeOf("function");
    expect(ctx!.sendChat).toBeTypeOf("function");
    expect(ctx!.getBonds).toBeTypeOf("function");
  });
});
