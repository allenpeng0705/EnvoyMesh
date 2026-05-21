/**
 * ADB-C: mesh.library_request_share tool — discover metadata then chat request (no auto-download).
 */
import { createLocalTaskStore } from "@envoymesh/local-store";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeTool, type MeshToolContext } from "../src/tool-registry.js";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-adb-c-"));
  await mkdir(profileDir, { recursive: true });
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function minimalContext(overrides: Partial<MeshToolContext>): MeshToolContext {
  const taskStore = createLocalTaskStore(profileDir);
  return {
    trustStore: {} as MeshToolContext["trustStore"],
    peerDirectoryStore: {} as MeshToolContext["peerDirectoryStore"],
    taskStore,
    agentIdentity: {
      agentId: "agent-1",
      agentPeerId: "envoy_agent_test",
      privateKeyPem: "pk",
      publicKeyPem: "pub",
    },
    ownerIdentity: { ownerId: "envoy:owner:self" },
    agentCredential: {} as MeshToolContext["agentCredential"],
    ...overrides,
  };
}

describe("mesh.library_request_share", () => {
  it("discovers published metadata and sends chat without downloading bytes", async () => {
    const sendChat = vi.fn(async () => {});
    const discoverPublishedLibrary = vi.fn(async () => [
      {
        peerOwnerId: "envoy:owner:peer",
        displayName: "Peer",
        bondLevel: "direct",
        files: [
          {
            title: "parity.md",
            relativePath: "docs/parity.md",
            contentHash: "cafebabe0000",
            byteLength: 50,
            documentId: "doc-1",
          },
        ],
      },
    ]);

    const result = await executeTool(
      "mesh.library_request_share",
      { targetOwnerHint: "Peer", fileTitleQuery: "parity" },
      minimalContext({
        getBonds: async () => [{ peerOwnerId: "envoy:owner:peer", level: "direct", displayName: "Peer" }],
        discoverPublishedLibrary,
        sendChat,
      }),
    );

    expect(result.ok).toBe(true);
    expect(discoverPublishedLibrary).toHaveBeenCalled();
    expect(sendChat).toHaveBeenCalledWith("envoy:owner:peer", expect.stringContaining("parity.md"));
    const payload = result.result as { matches?: unknown[] };
    expect(payload.matches?.length).toBe(1);
  });
});
