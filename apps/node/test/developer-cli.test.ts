import { createTaskJournalEntry } from "@envoymesh/protocol";
import {
  createDiscoveryEvent,
  createLocalPeerDirectoryStore,
  createApprovalRequest,
  createAuditEvent,
  createLocalTaskStore,
  createLocalTrustStore,
  buildRelayManagerSnapshot,
  serializeRelayManagerSnapshot,
} from "@envoymesh/local-store";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeDeveloperCliArgv, parseDeveloperCliArgs, runDeveloperCli } from "../src/developer-cli.js";
import { kuboIpfsCliAvailableSync } from "../src/kubo-ipfs-export.js";
import { createNodeConfigStore } from "../src/node-config-store.js";

let profileDir: string;
let vaultDir: string;

beforeEach(async () => {
  const root = await mkdtemp(join(tmpdir(), "envoymesh-developer-cli-"));
  profileDir = join(root, "profile");
  vaultDir = join(root, "shared_vault");
  await mkdir(vaultDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
  await rm(vaultDir, { recursive: true, force: true });
});

describe("developer CLI", () => {
  it("parses commands and shared options", () => {
    expect(
      parseDeveloperCliArgs([
        "vault-search",
        "--profile",
        "./data/alice",
        "--vault",
        "./shared_vault",
        "--query",
        "distributed systems",
        "--limit",
        "5",
      ]),
    ).toMatchObject({
      command: "vault-search",
      profileDir: "./data/alice",
      vaultDir: "./shared_vault",
      query: "distributed systems",
      limit: 5,
    });

    expect(
      parseDeveloperCliArgs([
        "vault-ipfs-fingerprint",
        "--vault",
        "./shared_vault",
        "--relative-path",
        "docs/readme.md",
      ]),
    ).toMatchObject({
      command: "vault-ipfs-fingerprint",
      vaultRelativePath: "docs/readme.md",
      vaultDir: "./shared_vault",
    });

    expect(
      parseDeveloperCliArgs(["vault-ipfs-fingerprint", "--file", "/tmp/export.bin"]),
    ).toMatchObject({
      command: "vault-ipfs-fingerprint",
      ipfsFingerprintFile: "/tmp/export.bin",
    });
  });

  it("parses pairing and smoke-checklist commands", () => {
    expect(parseDeveloperCliArgs(["pairing", "retry", "12D3KooWPeer"])).toMatchObject({
      command: "pairing",
      pairingAction: "retry",
      pairingIdOrPeer: "12D3KooWPeer",
    });
    expect(parseDeveloperCliArgs(["smoke-checklist", "--machine-a", "alpha", "--machine-b", "beta"])).toMatchObject({
      command: "smoke-checklist",
      machineAName: "alpha",
      machineBName: "beta",
    });
    expect(parseDeveloperCliArgs(["pairing", "timeline", "--format", "json"])).toMatchObject({
      command: "pairing",
      pairingAction: "timeline",
      outputFormat: "json",
    });
    expect(
      parseDeveloperCliArgs(["pairing", "timeline", "--status", "deferred", "--query", "peer-a"]),
    ).toMatchObject({
      command: "pairing",
      pairingAction: "timeline",
      pairingStatusFilter: "deferred",
      pairingQuery: "peer-a",
    });
    expect(parseDeveloperCliArgs(["connectivity-status", "--profile", "./data/alice"])).toMatchObject({
      command: "connectivity-status",
      profileDir: "./data/alice",
    });
    expect(
      parseDeveloperCliArgs(["connectivity-status", "C:\\Users\\PS\\envoymesh\\win_profile"]),
    ).toMatchObject({
      command: "connectivity-status",
      profileDir: "C:\\Users\\PS\\envoymesh\\win_profile",
    });
    expect(
      parseDeveloperCliArgs(["connectivity-status", "--profile", "C:\\Users\\PS\\envoymesh\\win_profile", "rich"]),
    ).toMatchObject({
      command: "connectivity-status",
      profileDir: "C:\\Users\\PS\\envoymesh\\win_profile",
      connectivityRich: true,
    });
    expect(normalizeDeveloperCliArgv(["audit", "--profile", "./x"])).toEqual(["audit", "--profile", "./x"]);
    expect(parseDeveloperCliArgs(["relay-status", "--profile", "./data/relay", "--format", "json"])).toMatchObject({
      command: "relay-status",
      profileDir: "./data/relay",
      outputFormat: "json",
    });
  });

  it("parses audit filtering flags", () => {
    expect(
      parseDeveloperCliArgs([
        "audit",
        "--profile",
        "./data/alice",
        "--audit-correlation",
        "task-9",
        "--include-p2p-trace",
      ]),
    ).toMatchObject({
      command: "audit",
      profileDir: "./data/alice",
      auditCorrelationId: "task-9",
      includeP2pTraceInAudit: true,
    });
  });

  it("shows a profile summary", async () => {
    const result = await runDeveloperCli(["profile", "--profile", profileDir]);

    expect(result.exitCode).toBe(0);
    expect(result.lines[0]).toBe("Profile");
    expect(result.lines.some((line) => line.startsWith("Owner ID:"))).toBe(true);
    expect(result.lines.some((line) => line.startsWith("Device ID:"))).toBe(true);
  });

  it("lists audit events and observed peers", async () => {
    const store = createLocalTaskStore(profileDir);
    await store.appendAuditEvent(
      createAuditEvent({
        eventId: "audit-1",
        type: "message.verified",
        intent: "system.ping",
        remotePeerId: "peer-a",
        outcome: "allow",
        summary: "Verified ping.",
        createdAt: "2026-04-27T10:00:00.000Z",
      }),
    );
    await store.appendAuditEvent(
      createAuditEvent({
        eventId: "audit-2",
        type: "message.rejected",
        intent: "task.propose",
        correlationId: "corr-task-proposal",
        remotePeerId: "peer-a",
        outcome: "deny",
        summary: "Rejected task.",
        createdAt: "2026-04-27T10:01:00.000Z",
      }),
    );
    await store.appendAuditEvent(
      createAuditEvent({
        eventId: "audit-3",
        type: "p2p.trace",
        remotePeerId: "peer-a",
        outcome: "record",
        summary: "p2p stream:open",
        createdAt: "2026-04-27T10:02:00.000Z",
      }),
    );

    const audit = await runDeveloperCli(["audit", "--profile", profileDir]);
    const peers = await runDeveloperCli(["peer-list", "--profile", profileDir]);

    expect(audit.lines).toContain("Audit events (2 of 3)");
    expect(audit.lines.join("\n")).toContain("Rejected task.");
    expect(audit.lines.join("\n")).not.toContain("p2p.trace");
    expect(peers.lines).toContain("Observed peers (1)");
    expect(peers.lines.join("\n")).toContain("peer-a messages=2");

    const withTrace = await runDeveloperCli(["audit", "--profile", profileDir, "--include-p2p-trace"]);
    expect(withTrace.lines).toContain("Audit events (3 of 3)");
    expect(withTrace.lines.join("\n")).toContain("p2p.trace");

    const correlationFilter = await runDeveloperCli([
      "audit",
      "--profile",
      profileDir,
      "--include-p2p-trace",
      "--audit-correlation",
      "corr-task",
    ]);
    expect(correlationFilter.lines).toContain("Audit events (1 of 3)");
    expect(correlationFilter.lines.join("\n")).toContain("task.propose");
  });

  it("shows connectivity status diagnostics", async () => {
    const store = createLocalTaskStore(profileDir);
    await store.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        protocol: "connectivity.profile",
        outcome: "record",
        summary: "connectivity profile=wan-default mdns=true dht=true relay=true autonat=true dcutr=true bootstrap=2",
        createdAt: "2026-04-27T10:00:00.000Z",
      }),
    );
    await store.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        protocol: "peer.discovery",
        remotePeerId: "peer-a",
        outcome: "record",
        summary: "discovery peer=peer-a source=relay addrs=1",
        createdAt: "2026-04-27T10:00:01.000Z",
      }),
    );
    await store.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        protocol: "connectivity.warning",
        outcome: "record",
        summary: "wan-default selected without bootstrap peers",
        createdAt: "2026-04-27T10:00:02.000Z",
      }),
    );
    await store.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        protocol: "connectivity.bootstrap.fail",
        remotePeerId: "peer-b",
        outcome: "record",
        summary: "bootstrap probe failed peer=peer-b error=timeout",
        createdAt: "2026-04-27T10:00:03.000Z",
      }),
    );
    await store.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        protocol: "connectivity.reprobe.fail",
        remotePeerId: "peer-c",
        outcome: "record",
        summary: "bootstrap reprobe failed peer=peer-c error=timeout",
        createdAt: "2026-04-27T10:00:04.000Z",
      }),
    );
    const result = await runDeveloperCli(["connectivity-status", "--profile", profileDir]);
    expect(result.exitCode).toBe(0);
    const statusIdx = result.lines.indexOf("Connectivity status");
    expect(statusIdx).toBeGreaterThanOrEqual(0);
    expect(result.lines[statusIdx + 1]).toContain("Persisted node-config:");
    const dense = result.lines.find(
      (line) => line.startsWith("profile=") && line.includes("discoveredPeers="),
    );
    expect(dense).toBeDefined();
    expect(dense).toContain("profile=wan-default");
    expect(dense).toContain("discoveredPeers=1");
    expect(dense).toContain("bootstrapFail=1");
    expect(dense).toContain("reprobeFail=1");
    expect(result.lines.join("\n")).toContain("warning 2026-04-27T10:00:02.000Z");
    expect(result.lines.join("\n")).toContain("bootstrapFail 2026-04-27T10:00:03.000Z");
    expect(result.lines.join("\n")).toContain("reprobeFail 2026-04-27T10:00:04.000Z");
    expect(result.lines.join("\n")).toContain("Libp2p peers reported");
    expect(result.lines.join("\n")).toContain("peer=peer-a");
    expect(result.lines.join("\n")).toContain("discovery-seeds.json");
  });

  it("connectivity-status shows persisted bootstrapPresets from node-config.json", async () => {
    await createNodeConfigStore(profileDir).save({
      version: "0.1",
      profileDir,
      discoveryProfile: "wan-default",
      relayEnabled: true,
      relayServerEnabled: false,
      advertiseAddrs: [],
      bootstrapPeers: ["/ip4/198.51.100.2/tcp/4001/p2p/12D3KooWTestBootstrap"],
      bootstrapPresets: ["public-libp2p", "cn-relay"],
      configuredRelays: [],
      modelProviders: { mode: "mock" },
      chatAssistEnabled: false,
      contactAiPreferences: [],
      updatedAt: new Date().toISOString(),
    });
    const store = createLocalTaskStore(profileDir);
    await store.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        protocol: "connectivity.profile",
        outcome: "record",
        summary: "connectivity profile=wan-default mdns=true dht=true relay=true autonat=true dcutr=true bootstrap=2",
        createdAt: "2026-04-27T10:00:00.000Z",
      }),
    );
    const result = await runDeveloperCli(["connectivity-status", "--profile", profileDir]);
    expect(result.exitCode).toBe(0);
    const joined = result.lines.join("\n");
    expect(joined).toContain("bootstrapPresets=public-libp2p,cn-relay");
    expect(joined).toContain("explicitBootstrapPeers=1");
    expect(joined).toContain("relay=true");
    expect(joined).toContain("relayServer=false");
  });

  it("connectivity-status --rich prepends ascii Stage D panel", async () => {
    const store = createLocalTaskStore(profileDir);
    await store.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        protocol: "connectivity.profile",
        outcome: "record",
        summary: "connectivity profile=wan-default mdns=true dht=true relay=true autonat=true dcutr=true bootstrap=2",
        createdAt: "2026-04-27T10:00:00.000Z",
      }),
    );
    await store.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        protocol: "peer.discovery",
        remotePeerId: "peer-a",
        outcome: "record",
        summary: "discovery peer=peer-a source=relay addrs=1",
        createdAt: "2026-04-27T10:00:01.000Z",
      }),
    );
    const result = await runDeveloperCli(["connectivity-status", "--profile", profileDir, "--rich"]);
    expect(result.exitCode).toBe(0);
    expect(result.lines.some((line) => line.startsWith("+---"))).toBe(true);
    expect(result.lines.some((line) => line.includes("Stage D connectivity snapshot"))).toBe(true);
    expect(result.lines).toContain("Connectivity status");
  });

  it("shows relay manager status from snapshot audit events", async () => {
    const store = createLocalTaskStore(profileDir);
    const snapshot = buildRelayManagerSnapshot({
      runtime: {
        enabled: true,
        relayServerEnabled: true,
        peerId: "relay-a",
        listenAddrs: ["/ip4/127.0.0.1/tcp/4001/p2p/relay-a"],
        rosterEntries: [],
        relayBook: [
          {
            relayId: "relay-b",
            relation: "sibling",
            state: "verified",
            addrs: ["/ip4/127.0.0.1/tcp/4002/p2p/relay-b"],
            lastVerifiedAt: Date.parse("2026-04-27T10:00:00.000Z"),
            expiresAt: Date.parse("2026-04-27T10:05:00.000Z"),
            failureCount: 0,
          },
        ],
        summaries: [],
        routing: {
          forwardedLookupCount: 3,
          duplicateQueryDropCount: 1,
          negativeCacheSize: 0,
          selectedForwardTargetCount: 3,
          failedForwardCount: 0,
          collectedForwardResponseCount: 2,
        },
        health: {
          status: "degraded",
          checkedAt: "2026-04-27T10:01:00.000Z",
          reasons: ["recent bootstrap probes all failed"],
          actions: ["reprobe-neighbors"],
          recoveryCounters: {
            healthChecks: 2,
            degraded: 1,
            unhealthy: 0,
            critical: 0,
            softRepair: 1,
            restartRequested: 0,
            exitRequested: 0,
          },
        },
      },
      now: () => Date.parse("2026-04-27T10:01:00.000Z"),
    });
    await store.appendAuditEvent(
      createAuditEvent({
        type: "p2p.trace",
        protocol: "relay.manager.snapshot",
        outcome: "record",
        summary: serializeRelayManagerSnapshot(snapshot),
        createdAt: "2026-04-27T10:01:00.000Z",
      }),
    );

    const text = await runDeveloperCli(["relay-status", "--profile", profileDir]);
    expect(text.lines).toContain("Relay manager status");
    expect(text.lines.join("\n")).toContain("relayBook total=1");
    expect(text.lines.join("\n")).toContain("health status=degraded");
    expect(text.lines.join("\n")).toContain("healthReason recent bootstrap probes all failed");
    expect(text.lines.join("\n")).toContain("forwarded=3");

    const json = await runDeveloperCli(["relay-status", "--profile", profileDir, "--format", "json"]);
    expect(JSON.parse(json.lines.join("\n")).relay.peerId).toBe("relay-a");
    expect(JSON.parse(json.lines.join("\n")).health.status).toBe("degraded");
  });

  it("shows a helpful relay-status hint when no snapshot exists", async () => {
    const result = await runDeveloperCli(["relay-status", "--profile", profileDir]);

    expect(result.lines.join("\n")).toContain("source=empty");
    expect(result.lines.join("\n")).toContain("no relay.manager.snapshot found");
  });

  it("lists tasks and pending approvals", async () => {
    const store = createLocalTaskStore(profileDir);
    await store.appendTaskJournalEntry(
      createTaskJournalEntry({
        eventId: "event-1",
        taskId: "task-1",
        eventType: "proposed",
        state: "negotiating",
        summary: "Proposed a task.",
        createdAt: "2026-04-27T10:00:00.000Z",
      }),
    );
    await store.appendApprovalRequest(
      createApprovalRequest({
        approvalId: "approval-1",
        ownerId: "owner-1",
        taskId: "task-1",
        requestedAction: "purchase",
        reason: "Owner approval required.",
        status: "pending",
        createdAt: "2026-04-27T10:01:00.000Z",
      }),
    );

    const tasks = await runDeveloperCli(["tasks", "--profile", profileDir]);
    const approvals = await runDeveloperCli([
      "approvals",
      "--profile",
      profileDir,
      "--status",
      "pending",
    ]);

    expect(tasks.lines).toContain("Task journal entries (1)");
    expect(tasks.lines.join("\n")).toContain("task-1 proposed/negotiating");
    expect(approvals.lines).toContain("Approval requests (1)");
    expect(approvals.lines.join("\n")).toContain("approval-1 status=pending");

    const approved = await runDeveloperCli([
      "approvals",
      "approve",
      "approval-1",
      "--profile",
      profileDir,
    ]);

    expect(approved.lines).toContain("Approval approved");
    expect(approved.lines.join("\n")).toContain("approval-1 status=approved");
  });

  it("lists pairing approvals and provides retry hint", async () => {
    const store = createLocalTaskStore(profileDir);
    await store.appendApprovalRequest(
      createApprovalRequest({
        approvalId: "approval-pair-1",
        ownerId: "owner-1",
        taskId: "pairing:pair-1",
        requestedAction: "device.sync",
        reason: "Pairing request from satellite",
        status: "pending",
        createdAt: "2026-04-27T10:01:00.000Z",
      }),
    );
    await store.appendAuditEvent(
      createAuditEvent({
        type: "message.verified",
        intent: "device.pair.deferred",
        remotePeerId: "12D3KooWPeer",
        outcome: "record",
        summary: "Pairing request pair-1 deferred: Primary unavailable",
        createdAt: "2026-04-27T10:02:00.000Z",
      }),
    );

    const listed = await runDeveloperCli(["pairing", "list", "--profile", profileDir]);
    expect(listed.lines[0]).toContain("Pairing approvals (1)");
    expect(listed.lines.join("\n")).toContain("approval-pair-1");

    const retry = await runDeveloperCli(["pairing", "retry", "12D3KooWPeer", "--profile", profileDir]);
    expect(retry.lines[0]).toContain("Pairing retry hint");
    expect(retry.lines.join("\n")).toContain("--pair-request");

    const timeline = await runDeveloperCli(["pairing", "timeline", "--profile", profileDir]);
    expect(timeline.lines[0]).toContain("Pairing timeline");
    expect(timeline.lines.join("\n")).toContain("status=");

    const timelineJson = await runDeveloperCli([
      "pairing",
      "timeline",
      "--profile",
      profileDir,
      "--format",
      "json",
    ]);
    expect(() => JSON.parse(timelineJson.lines.join("\n"))).not.toThrow();

    const timelineFiltered = await runDeveloperCli([
      "pairing",
      "timeline",
      "--profile",
      profileDir,
      "--status",
      "deferred",
      "--query",
      "Primary unavailable",
    ]);
    expect(timelineFiltered.lines[0]).toContain("Pairing timeline (1)");
  });

  it("indexes and searches the shared vault", async () => {
    await writeFile(
      join(vaultDir, "notes.md"),
      "Distributed systems need secure peer discovery and local-first audit logs.",
    );

    const index = await runDeveloperCli(["vault-index", "--vault", vaultDir]);
    const search = await runDeveloperCli([
      "vault-search",
      "--vault",
      vaultDir,
      "--query",
      "peer discovery",
    ]);

    expect(index.lines).toContain("Documents: 1");
    expect(index.lines.join("\n")).toContain("notes.md");
    expect(search.lines).toContain("Vault search results (1)");
    expect(search.lines.join("\n")).toContain("notes.md#0");
  });

  it("writes a vault content manifest", async () => {
    await writeFile(join(vaultDir, "notes.md"), "Manifest test content.");
    const outputPath = join(vaultDir, "manifest.json");

    const result = await runDeveloperCli([
      "vault-manifest",
      "--vault",
      vaultDir,
      "--output",
      outputPath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.lines.join("\n")).toContain("Wrote manifest");
    const manifest = JSON.parse(await readFile(outputPath, "utf8")) as { documents: Array<{ relativePath: string }> };
    expect(manifest.documents.some((doc) => doc.relativePath === "notes.md")).toBe(true);
  });

  it("vault-ipfs-fingerprint requires --file or --relative-path", async () => {
    await expect(runDeveloperCli(["vault-ipfs-fingerprint", "--vault", vaultDir])).rejects.toThrow(/--file|relative-path/);
  });

  it("vault-ipfs-fingerprint rejects --file combined with --relative-path", async () => {
    await expect(
      runDeveloperCli(["vault-ipfs-fingerprint", "--vault", vaultDir, "--relative-path", "x.md", "--file", "/x"]),
    ).rejects.toThrow(/either --file|not both/);
  });

  it("vault-ipfs-fingerprint errors when vault-relative path is missing", async () => {
    await expect(
      runDeveloperCli(["vault-ipfs-fingerprint", "--vault", vaultDir, "--relative-path", "missing.txt"]),
    ).rejects.toThrow(/not found/i);
  });

  it("vault-ipfs-fingerprint rejects vault-relative path outside vault root", async () => {
    await expect(
      runDeveloperCli(["vault-ipfs-fingerprint", "--vault", vaultDir, "--relative-path", "../outside.txt"]),
    ).rejects.toThrow(/outside the shared vault root/i);
  });

  it.skipIf(process.env.ENVOYMESH_IPFS_CLI_TEST !== "1")(
    "vault-ipfs-fingerprint prints Kubo CID when integration env is enabled",
    async () => {
      await writeFile(join(vaultDir, "interop.txt"), "envoymesh ipfs recipe v1 smoke");
      if (!kuboIpfsCliAvailableSync()) {
        throw new Error("ENVOYMESH_IPFS_CLI_TEST=1 expects `ipfs` on PATH");
      }

      const result = await runDeveloperCli([
        "vault-ipfs-fingerprint",
        "--vault",
        vaultDir,
        "--relative-path",
        "interop.txt",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.lines.join("\n")).toMatch(/cid=[a-zA-Z0-9]+/);
      expect(result.lines.some((line) => line.startsWith("ipfsInteropRecipe="))).toBe(true);
    },
  );

  it("sets, lists, and removes trust records", async () => {
    const saved = await runDeveloperCli([
      "trust",
      "set",
      "envoy:owner:alice",
      "--profile",
      profileDir,
      "--level",
      "direct",
      "--name",
      "Alice",
      "--note",
      "Met in local test.",
    ]);
    const listed = await runDeveloperCli(["trust", "list", "--profile", profileDir]);
    const removed = await runDeveloperCli([
      "trust",
      "remove",
      "envoy:owner:alice",
      "--profile",
      profileDir,
    ]);

    expect(saved.lines).toContain("Trust record saved");
    expect(saved.lines.join("\n")).toContain("level=direct");
    expect(listed.lines).toContain("Trust records (1)");
    expect(listed.lines.join("\n")).toContain("envoy:owner:alice");
    expect(removed.lines).toContain("Trust record removed");
  });

  it("builds a ranked morning report", async () => {
    const taskStore = createLocalTaskStore(profileDir);
    const trustStore = createLocalTrustStore(profileDir);
    const peerStore = createLocalPeerDirectoryStore(profileDir);
    await trustStore.setTrustRecord({ peerOwnerId: "envoy:owner:alice", level: "direct" });
    await peerStore.upsertPeerFromSignal({
      peerId: "peer-a",
      payload: {
        ownerId: "envoy:owner:alice",
        ownerPublicKeyPem: "owner-pem",
        deviceId: "envoy:device:alice",
        deviceCertificate: {
          version: "0.1",
          certificateId: "cert-1",
          ownerId: "envoy:owner:alice",
          deviceId: "envoy:device:alice",
          devicePublicKeyPem: "device-key",
          deviceProfile: "primary",
          capabilities: ["mesh.discovery"],
          issuedAt: "2026-04-27T10:00:00.000Z",
          expiresAt: null,
          signature: "sig",
        },
        deviceProfile: "primary",
        capabilities: ["mesh.discovery"],
        supportedProtocolVersions: ["emp/0.1"],
        listenAddrs: [],
        publicTopics: [],
        status: "online",
      },
    });
    await taskStore.appendDiscoveryEvent(
      createDiscoveryEvent({
        direction: "inbound",
        intent: "discovery.response",
        ownerId: "envoy:owner:alice",
        matchCount: 2,
        outcome: "record",
        summary: "matches",
      }),
    );

    const report = await runDeveloperCli(["morning-report", "--profile", profileDir]);
    expect(report.lines[0]).toBe("Morning report (1)");
    expect(report.lines.join("\n")).toContain("owner=envoy:owner:alice");
  });

  it("generates smoke checklist and can write output file", async () => {
    const outputPath = join(vaultDir, "smoke-checklist.md");
    const printed = await runDeveloperCli(["smoke-checklist", "--machine-a", "alpha", "--machine-b", "beta"]);
    expect(printed.lines[0]).toBe("# EnvoyMesh Multi-Machine Smoke Checklist");
    expect(printed.lines.join("\n")).toContain("On alpha");
    expect(printed.lines.join("\n")).toContain("auto-generated correlation IDs");
    expect(printed.lines.join("\n")).toContain("--correlation-id");

    const written = await runDeveloperCli(["smoke-checklist", "--output", outputPath]);
    expect(written.lines[0]).toContain("Wrote smoke checklist");
    const file = await readFile(outputPath, "utf8");
    expect(file).toContain("EnvoyMesh Multi-Machine Smoke Checklist");
  });

  it("encodes and decodes WAN join invites", async () => {
    const encoded = await runDeveloperCli([
      "invite",
      "encode",
      "--bootstrap-peer",
      "/ip4/10.0.0.1/tcp/4001/p2p/peer-a",
      "--invite-bootstrap-preset",
      "public-libp2p-am6",
      "--invite-target-peer",
      "12D3KooWPeer",
    ]);
    expect(encoded.exitCode).toBe(0);
    const tokenLine = encoded.lines.find((line) => line.startsWith("token="));
    expect(tokenLine).toBeTruthy();
    const token = tokenLine!.slice("token=".length);

    const decodedPositional = await runDeveloperCli(["invite", "decode", token]);
    expect(decodedPositional.exitCode).toBe(0);
    expect(decodedPositional.lines.join("\n")).toContain("\"bootstrapPeers\"");

    const decodedFlag = await runDeveloperCli(["invite", "decode", "--invite-token", token]);
    expect(decodedFlag.exitCode).toBe(0);
    expect(decodedFlag.lines.join("\n")).toContain("\"bootstrapPresets\"");
  });
});
