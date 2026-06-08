/**
 * Integration: native owner agent turn via NodeServiceImpl + ToolRegistry (Phase 18A/18B).
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
import {
  getPhase18ModelProviders,
  isPhase18LiveModelConfigured,
  phase18MinimaxSkipMessage,
} from "./phase18-minimax-config.js";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-owner-agent-"));
  vaultDir = join(profileDir, "vault");
  await mkdir(join(vaultDir, "docs"), { recursive: true });
  await writeFile(join(vaultDir, "docs/report.txt"), "hello-owner-agent", { mode: 0o600 });
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

function createTestNode() {
  const profile = testProfile();
  const taskStore = createLocalTaskStore(profileDir);
  const node = new NodeServiceImpl(
    { peerId: "local-peer" } as never,
    createLocalTrustStore(profileDir),
    createLocalPeerDirectoryStore(profileDir),
    createHumanProfileStore(profileDir),
    profileDir,
    profile,
    vaultDir,
  );
  node.bindCliTaskStore(taskStore);
  return node;
}

describe.skipIf(process.env.ENVOY_PHASE18_LIVE_TESTS !== "1")(
  "NodeServiceImpl.runOwnerAgentTurn",
  () => {
    it("lists vault library through explicit document command path", async () => {
      const node = createTestNode();
      const turn = await node.runOwnerAgentTurn("list my library files");
      expect(turn.intent).toBe("list_library");
      expect(turn.toolsUsed).toContain("mesh.library_list");
      expect(turn.answer).toContain("report.txt");
    });

  it("returns posture guidance when social proxy is disabled", async () => {
    const node = createTestNode();
    await node.updateNodeConfig({
      trustModeEnabled: true,
      socialProxyEnabled: false,
    });
    const turn = await node.runOwnerAgentTurn("help me find friends interested in hiking");
    expect(turn.domain).toBe("social");
    expect(turn.answer).toMatch(/Social proxy|social proxy/i);
  });

  it("records Activity with jobId when document acquisition starts", async () => {
    const node = createTestNode();
    await node.updateNodeConfig({ documentAcquisitionEnabled: true });
    const turn = await node.runOwnerAgentTurn("find the golden checklist document on the mesh");
    expect(turn.jobId).toBeDefined();
    expect(turn.domain).toBe("document");
    const activity = await node.listAgentActivity({ limit: 10 });
    const row = activity.find((a) => a.summary.includes("H2A document"));
    expect(row?.taskId).toBe(turn.jobId);
    expect(row?.evidence?.some((e) => e.type === "route")).toBe(true);
  });

});

describe.skipIf(!isPhase18LiveModelConfigured())(
  `NodeServiceImpl.runOwnerAgentTurn live MiniMax (${phase18MinimaxSkipMessage()})`,
  () => {
    it("planner via live MiniMax with optional audit trail", async () => {
      const node = createTestNode();
      await node.updateCapabilityManifest({ capabilities: [] });
      await node.updateNodeConfig({ modelProviders: getPhase18ModelProviders() });
      const turn = await node.runOwnerAgentTurn("xyzzy plugh qwerty mesh topology overview");
      expect(turn.answer.trim().length).toBeGreaterThan(0);
      expect(
        turn.toolsUsed.length > 0 ||
          turn.intent === "planner_answer" ||
          turn.intent === "planner_exhausted",
      ).toBe(true);
      if (turn.toolsUsed.length > 0) {
        const audits = await node.listAuditEvents({ limit: 50 });
        expect(audits.some((row) => row.summary.includes("owner agent planner round"))).toBe(true);
      }
    }, 120_000);
  },
);
