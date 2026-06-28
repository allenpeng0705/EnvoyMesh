/**
 * E2E Phase 18 — native owner agent (`runOwnerAgentTurn`) exit criteria.
 * Uses configured MiniMax (openai-compatible) from .env or node-config.json — not mock.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupPhase13Node,
  createPhase13TestNode,
  ensureBridgeIdentity,
  registerBondedPeer,
  wireDiscoveryAndShareForAcquisition,
  wireFullDaemonAgentCardHandlers,
  wireFullDaemonTaskInboundHandler,
  wireNodeServiceInboundHandlers,
  type Phase13TestNode,
} from "./phase13-e2e-harness.js";
import {
  getPhase18ModelProviders,
  isPhase18LiveModelConfigured,
  phase18MinimaxSkipMessage,
} from "./phase18-minimax-config.js";

const nodes: Phase13TestNode[] = [];

afterEach(async () => {
  await Promise.all(nodes.splice(0).map((n) => cleanupPhase13Node(n)));
});

describe.sequential.skipIf(!isPhase18LiveModelConfigured())(
  `E2E Phase 18 owner agent exit criteria (${phase18MinimaxSkipMessage()})`,
  () => {
    const modelProviders = getPhase18ModelProviders();

    it("Friends: social route starts proxy pass and intro broadcast under enabled postures", async () => {
      const alice = await createPhase13TestNode();
      nodes.push(alice);
      wireNodeServiceInboundHandlers(alice);

      await alice.service.updateNodeConfig({
        trustModeEnabled: true,
        socialProxyEnabled: true,
        modelProviders,
      });

      const turn = await alice.service.runOwnerAgentTurn(
        "help me find friends interested in hiking",
      );
      expect(turn.domain).toBe("social");
      expect(turn.routeId).toBe("social.intro-bond");
      expect(turn.answer).toMatch(/social proxy|Social proxy/i);
      expect(turn.toolsUsed).toContain("runSocialProxyPass");
      expect(turn.toolsUsed).toContain("mesh.intro.broadcast_search");

      const activity = await alice.service.listAgentActivity({ limit: 20 });
      expect(activity.some((a) => a.summary.includes("H2A social"))).toBe(true);
    });

    it("Documents: document hunt starts acquisition job despite competing social route score", async () => {
      const alice = await createPhase13TestNode();
      const bob = await createPhase13TestNode();
      nodes.push(alice, bob);
      await registerBondedPeer(alice, bob, "Bob");
      wireDiscoveryAndShareForAcquisition(bob, alice);
      wireNodeServiceInboundHandlers(alice);

      await alice.service.updateNodeConfig({
        documentAcquisitionEnabled: true,
        modelProviders,
      });

      const turn = await alice.service.runOwnerAgentTurn(
        "find the golden checklist document on the mesh",
      );
      expect(turn.domain).toBe("document");
      expect(turn.jobId).toBeDefined();
      expect(turn.toolsUsed).toContain("startDocumentAcquisitionJob");

      const job = await alice.service.getDocumentAcquisitionJob(turn.jobId!);
      expect(job).toBeDefined();

      const activity = await alice.service.listAgentActivity({ limit: 20 });
      const row = activity.find((a) => a.summary.includes("H2A document"));
      expect(row?.taskId).toBe(turn.jobId);
      expect(row?.evidence?.some((e) => e.type === "route")).toBe(true);
    });

    it("Documents: explicit list library command uses ToolRegistry", async () => {
      const alice = await createPhase13TestNode();
      nodes.push(alice);
      await mkdir(join(alice.vaultDir, "docs"), { recursive: true });
      await writeFile(join(alice.vaultDir, "docs/phase18.txt"), "phase18 library", { mode: 0o600 });
      wireNodeServiceInboundHandlers(alice);

      const turn = await alice.service.runOwnerAgentTurn("list my library files");
      expect(turn.intent).toBe("list_library");
      expect(turn.answer).toContain("phase18.txt");
    });

    it("Capabilities: service route starts capability provider job", async () => {
      const alice = await createPhase13TestNode();
      const bob = await createPhase13TestNode();
      nodes.push(alice, bob);
      await registerBondedPeer(alice, bob, "Bob");
      await registerBondedPeer(bob, alice, "Alice");
      const bobBridge = await ensureBridgeIdentity(bob);
      wireFullDaemonAgentCardHandlers(bob, bobBridge);
      wireFullDaemonTaskInboundHandler(bob);
      wireNodeServiceInboundHandlers(alice);

      await alice.service.updateNodeConfig({
        capabilityProviderEnabled: true,
        modelProviders,
      });

      const turn = await alice.service.runOwnerAgentTurn(
        "negotiate service task with peer for rust deployment help",
      );
      expect(turn.domain).toBe("service");
      expect(turn.jobId).toBeDefined();
      expect(turn.toolsUsed).toContain("mesh.capability_provider.start");

      const job = await alice.service.getCapabilityProviderJob(turn.jobId!);
      expect(job).toBeDefined();
    });

    it("Services: bonded task propose via natural language", async () => {
      const alice = await createPhase13TestNode();
      const bob = await createPhase13TestNode();
      nodes.push(alice, bob);
      await registerBondedPeer(alice, bob, "Bob");
      await ensureBridgeIdentity(bob);
      wireFullDaemonTaskInboundHandler(bob);
      wireNodeServiceInboundHandlers(alice);

      await alice.mesh.dial(bob.mesh.multiaddrs[0]!);
      await bob.mesh.dial(alice.mesh.multiaddrs[0]!);

      await alice.service.updateNodeConfig({ modelProviders });

      const turn = await alice.service.runOwnerAgentTurn("ask Bob to review the staging contract");
      expect(turn.domain).toBe("service");
      expect(turn.toolsUsed).toContain("mesh.task.propose");
      expect(turn.answer).toMatch(/task\.propose|Task ID/i);
    });

    it("Security: kill switch blocks autonomous job starts from owner agent turn", async () => {
      const alice = await createPhase13TestNode();
      nodes.push(alice);
      wireNodeServiceInboundHandlers(alice);

      await alice.service.updateNodeConfig({
        trustModeEnabled: true,
        socialProxyEnabled: true,
        documentAcquisitionEnabled: true,
        capabilityProviderEnabled: true,
        autonomousKillSwitch: true,
        modelProviders,
      });

      const social = await alice.service.runOwnerAgentTurn(
        "help me find friends interested in hiking",
      );
      expect(social.answer).toMatch(/kill switch/i);
      expect(social.toolsUsed).not.toContain("runSocialProxyPass");

      const doc = await alice.service.runOwnerAgentTurn(
        "acquire golden checklist pdf document from library",
      );
      expect(doc.answer).toMatch(/kill switch/i);
      expect(doc.jobId).toBeUndefined();

      const cap = await alice.service.runOwnerAgentTurn(
        "negotiate service task with peer for rust deployment help",
      );
      expect(cap.answer).toMatch(/kill switch/i);
      expect(cap.jobId).toBeUndefined();
    });

    it("Planner: live MiniMax tool loop with audit trail", async () => {
      const alice = await createPhase13TestNode();
      nodes.push(alice);
      await mkdir(join(alice.vaultDir, "docs"), { recursive: true });
      await writeFile(join(alice.vaultDir, "docs/planner.txt"), "planner e2e content", {
        mode: 0o600,
      });
      wireNodeServiceInboundHandlers(alice);

      await alice.service.updateCapabilityManifest({ capabilities: [] });
      await alice.service.updateNodeConfig({ modelProviders });

      const turn = await alice.service.runOwnerAgentTurn(
        "xyzzy plugh qwerty mesh topology overview",
      );
      expect(turn.answer.trim().length).toBeGreaterThan(0);
      expect(
        turn.intent === "planner_answer" ||
          turn.intent === "planner_exhausted" ||
          turn.toolsUsed.length > 0,
      ).toBe(true);

      if (turn.toolsUsed.length > 0) {
        const audits = await alice.service.listAuditEvents({ limit: 50 });
        expect(audits.some((row) => row.summary.includes("owner agent planner round"))).toBe(true);
      }
    }, 120_000);
  },
);
