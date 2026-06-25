/**
 * Agent adapter tests for Phase 8G — OpenClaw/HomeClaw adapter boundary.
 *
 * These tests verify that external agents (OpenClaw/HomeClaw) can only interact
 * with EnvoyMesh through the constrained tool API, and cannot bypass policy.
 *
 * Key invariants:
 * - Tools never expose raw peer IDs or listen addresses to external agents
 * - mesh_findCapability only returns bonded contacts
 * - mesh_requestKnowledge and mesh_sendChat require a direct bond
 * - External agents are treated as "private" sensitivity callers
 * - All outbound EMP messages are signed by EnvoyMesh
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLocalTaskStore,
  createLocalTrustStore,
  createLocalPeerDirectoryStore,
} from "@envoymesh/local-store";
import {
  evaluateToolPolicy,
  LocalToolRegistry,
  MESH_FIND_CAPABILITY_TOOL,
  MESH_REQUEST_KNOWLEDGE_TOOL,
  MESH_SEND_CHAT_TOOL,
  MESH_LIST_CONTACTS_TOOL,
  VAULT_SEARCH_TOOL,
  type ToolImplementation,
} from "@envoymesh/models";
import { generateOwnerIdentity, generateDeviceIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-adapter-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

// ─── Mock EnvoyMesh ────────────────────────────────────────────────────────────

/** Minimal mock EnvoyMesh for testing tool implementations. */
function createMockMesh() {
  const conn = { connected: true, direct: true };
  return {
    send: vi.fn().mockResolvedValue(undefined),
    sendExpectReply: vi.fn().mockResolvedValue({
      payload: {
        answer: "Mock knowledge response.",
        matchScore: 0.8,
      },
    }),
    peerId: "QmMockPeer",
    getPeerConnectionInfo: vi.fn().mockReturnValue(conn),
    ensurePeerReachable: vi.fn().mockResolvedValue(conn),
    closeConnectionsToPeer: vi.fn().mockResolvedValue(undefined),
    getPeerStoreDialHints: vi.fn().mockResolvedValue([]),
  };
}

// ─── Helper: create test profile ───────────────────────────────────────────────

function makeTestProfile() {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: [],
    }),
    profile: {
      owner,
      device,
    },
  };
}

// ─── Test: tool descriptors exist and have correct sensitivity ──────────────────

describe("agent adapter tool descriptors", () => {
  it("MESH_FIND_CAPABILITY_TOOL has public minSensitivity", () => {
    expect(MESH_FIND_CAPABILITY_TOOL.minSensitivity).toBe("public");
    expect(MESH_FIND_CAPABILITY_TOOL.requiresApproval).toBe(false);
    expect(MESH_FIND_CAPABILITY_TOOL.capabilityTags).toContain("mesh.findCapability");
  });

  it("MESH_REQUEST_KNOWLEDGE_TOOL has public minSensitivity", () => {
    expect(MESH_REQUEST_KNOWLEDGE_TOOL.minSensitivity).toBe("public");
    expect(MESH_REQUEST_KNOWLEDGE_TOOL.requiresApproval).toBe(false);
    expect(MESH_REQUEST_KNOWLEDGE_TOOL.capabilityTags).toContain("mesh.requestKnowledge");
  });

  it("MESH_SEND_CHAT_TOOL has public minSensitivity", () => {
    expect(MESH_SEND_CHAT_TOOL.minSensitivity).toBe("public");
    expect(MESH_SEND_CHAT_TOOL.requiresApproval).toBe(false);
    expect(MESH_SEND_CHAT_TOOL.capabilityTags).toContain("mesh.sendChat");
  });

  it("MESH_LIST_CONTACTS_TOOL has public minSensitivity", () => {
    expect(MESH_LIST_CONTACTS_TOOL.minSensitivity).toBe("public");
    expect(MESH_LIST_CONTACTS_TOOL.requiresApproval).toBe(false);
    expect(MESH_LIST_CONTACTS_TOOL.capabilityTags).toContain("mesh.listContacts");
  });

  it("all agent tools have mesh.* capability tags", () => {
    for (const tool of [MESH_FIND_CAPABILITY_TOOL, MESH_REQUEST_KNOWLEDGE_TOOL, MESH_SEND_CHAT_TOOL, MESH_LIST_CONTACTS_TOOL]) {
      expect(tool.capabilityTags?.some((t) => t.startsWith("mesh."))).toBe(true);
    }
  });
});

// ─── Test: mesh_findCapability — bonded-only results ────────────────────────────

describe("MESH_FIND_CAPABILITY_TOOL", () => {
  it("returns bonded contacts matched by keyword", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const mockMesh = createMockMesh();

    // Set up bonded contact
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:bob",
      displayName: "Bob",
      level: "direct",
      now: new Date().toISOString(),
    });

    const { buildMeshFindCapabilityTool } = await import("../src/tool-impl.js");
    const toolImpl = buildMeshFindCapabilityTool({ trustStore });
    const result = (await toolImpl({ keywords: ["bob"], maxResults: 5 })) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    const contacts = result.contacts as Array<Record<string, unknown>>;
    expect(contacts.length).toBeGreaterThan(0);
    expect(contacts[0].ownerId).toBe("envoy:owner:bob");
    expect(contacts[0].displayName).toBe("Bob");
    expect(contacts[0].trustLevel).toBe("direct");
    // No raw peer IDs exposed
    expect(contacts[0]).not.toHaveProperty("peerId");
    expect(contacts[0]).not.toHaveProperty("listenAddrs");
  });

  it("does not return non-bonded (public) contacts", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const { buildMeshFindCapabilityTool } = await import("../src/tool-impl.js");

    // Set up a public-level record (no bond)
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:stranger",
      displayName: "Stranger",
      level: "public",
      now: new Date().toISOString(),
    });

    const toolImpl = buildMeshFindCapabilityTool({ trustStore });
    const result = (await toolImpl({ keywords: ["stranger"], maxResults: 5 })) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    const contacts = result.contacts as Array<Record<string, unknown>>;
    expect(contacts.length).toBe(0);
  });

  it("returns empty array when no keywords match", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const { buildMeshFindCapabilityTool } = await import("../src/tool-impl.js");

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:alice",
      displayName: "Alice",
      level: "direct",
      now: new Date().toISOString(),
    });

    const toolImpl = buildMeshFindCapabilityTool({ trustStore });
    const result = (await toolImpl({ keywords: ["nonexistent"], maxResults: 5 })) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    const contacts = result.contacts as Array<Record<string, unknown>>;
    expect(contacts.length).toBe(0);
  });

  it("returns error when no keywords provided", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const { buildMeshFindCapabilityTool } = await import("../src/tool-impl.js");

    const toolImpl = buildMeshFindCapabilityTool({ trustStore });
    const result = (await toolImpl({ keywords: [] })) as Record<string, unknown>;

    expect(result.error).toBe("keywords or capabilityIds parameter is required");
  });

  it("matches bonded contact by Agent Card capability tag", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:dana",
      displayName: "Dana",
      level: "direct",
      now: new Date().toISOString(),
    });

    const { buildMeshFindCapabilityTool } = await import("../src/tool-impl.js");
    const toolImpl = buildMeshFindCapabilityTool({
      trustStore,
      listBondedAgentCapabilities: async () => [
        { ownerId: "envoy:owner:dana", capabilities: ["envoymesh.published-library"] },
      ],
    });
    const result = (await toolImpl({
      capabilityIds: ["envoymesh.published-library"],
      maxResults: 5,
    })) as Record<string, unknown>;

    const contacts = result.contacts as Array<Record<string, unknown>>;
    expect(contacts.length).toBe(1);
    expect(contacts[0]?.capabilityTags).toContain("envoymesh.published-library");
    expect(contacts[0]?.suggestedRouteId).toBe("document.published-library");
  });

  it("redacts all sensitive metadata from results", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const { buildMeshFindCapabilityTool } = await import("../src/tool-impl.js");

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:carol",
      displayName: "Carol",
      level: "referred",
      now: new Date().toISOString(),
    });

    const toolImpl = buildMeshFindCapabilityTool({ trustStore });
    const result = (await toolImpl({ keywords: ["carol"], maxResults: 5 })) as Record<string, unknown>;

    const contacts = result.contacts as Array<Record<string, unknown>>;
    expect(contacts.length).toBeGreaterThan(0);
    // Verify no sensitive fields
    for (const contact of contacts) {
      expect(contact).not.toHaveProperty("peerId");
      expect(contact).not.toHaveProperty("listenAddrs");
      expect(contact).not.toHaveProperty("devicePublicKeyPem");
      expect(contact).not.toHaveProperty("lastSeenAt");
    }
  });
});

// ─── Test: mesh_listContacts — redacted bonded contacts ────────────────────────

describe("MESH_LIST_CONTACTS_TOOL", () => {
  it("returns only bonded contacts (direct and referred)", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const { buildMeshListContactsTool } = await import("../src/tool-impl.js");

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:alice",
      displayName: "Alice",
      level: "direct",
      now: new Date().toISOString(),
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:bob",
      displayName: "Bob",
      level: "referred",
      now: new Date().toISOString(),
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:stranger",
      displayName: "Stranger",
      level: "public",
      now: new Date().toISOString(),
    });

    // Default minLevel is "direct" — only direct contacts returned unless minLevel is "referred"
    const toolImpl = buildMeshListContactsTool({ trustStore, peerDirectoryStore });

    // Test with referred level (includes both direct and referred)
    const result = (await toolImpl({ minLevel: "referred" })) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    const contacts = result.contacts as Array<Record<string, unknown>>;
    expect(contacts.length).toBe(2); // direct + referred, not public
    const ownerIds = contacts.map((c) => c.ownerId);
    expect(ownerIds).toContain("envoy:owner:alice");
    expect(ownerIds).toContain("envoy:owner:bob");
    expect(ownerIds).not.toContain("envoy:owner:stranger");
  });

  it("redacts sensitive metadata from all contacts", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const { buildMeshListContactsTool } = await import("../src/tool-impl.js");

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:alice",
      displayName: "Alice",
      level: "direct",
      now: new Date().toISOString(),
    });

    const toolImpl = buildMeshListContactsTool({ trustStore, peerDirectoryStore });
    const result = (await toolImpl({})) as Record<string, unknown>;

    const contacts = result.contacts as Array<Record<string, unknown>>;
    for (const contact of contacts) {
      expect(contact).not.toHaveProperty("peerId");
      expect(contact).not.toHaveProperty("listenAddrs");
      expect(contact).not.toHaveProperty("devicePublicKeyPem");
    }
  });

  it("excludes blocked contacts", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const { buildMeshListContactsTool } = await import("../src/tool-impl.js");

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:alice",
      displayName: "Alice",
      level: "direct",
      now: new Date().toISOString(),
    });
    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:enemy",
      displayName: "Enemy",
      level: "blocked",
      now: new Date().toISOString(),
    });

    const toolImpl = buildMeshListContactsTool({ trustStore, peerDirectoryStore });
    const result = (await toolImpl({})) as Record<string, unknown>;

    const contacts = result.contacts as Array<Record<string, unknown>>;
    const ownerIds = contacts.map((c) => c.ownerId);
    expect(ownerIds).toContain("envoy:owner:alice");
    expect(ownerIds).not.toContain("envoy:owner:enemy");
  });
});

// ─── Test: mesh_requestKnowledge — policy enforcement ──────────────────────────

describe("MESH_REQUEST_KNOWLEDGE_TOOL", () => {
  it("denies when no bond exists with target owner", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const mockMesh = createMockMesh();
    const testProfile = makeTestProfile();
    const { buildMeshRequestKnowledgeTool } = await import("../src/tool-impl.js");

    // No bond set up — stranger scenario
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:stranger",
      peerId: "QmStranger",
      listenAddrs: [],
    });

    const toolImpl = buildMeshRequestKnowledgeTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: mockMesh as any,
    });

    const result = (await toolImpl({
      targetOwnerId: "envoy:owner:stranger",
      query: "What is the capital of France?",
    })) as Record<string, unknown>;

    expect(result.denied).toBe(true);
    expect(result.error).toBeDefined();
    // mesh.send should NOT have been called
    expect(mockMesh.send).not.toHaveBeenCalled();
  });

  it("allows when direct bond exists with target owner", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const mockMesh = createMockMesh();
    const testProfile = makeTestProfile();
    const { buildMeshRequestKnowledgeTool } = await import("../src/tool-impl.js");

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:bob",
      displayName: "Bob",
      level: "direct",
      now: new Date().toISOString(),
    });
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:bob",
      peerId: "QmBob",
      listenAddrs: [],
    });

    const toolImpl = buildMeshRequestKnowledgeTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: mockMesh as any,
    });

    const result = (await toolImpl({
      targetOwnerId: "envoy:owner:bob",
      query: "What is the capital of France?",
    })) as Record<string, unknown>;

    expect(result.error).toBeUndefined();
    // mesh.sendExpectReply should have been called
    expect(mockMesh.sendExpectReply).toHaveBeenCalled();
  });

  it("returns error when targetOwnerId is missing", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const mockMesh = createMockMesh();
    const testProfile = makeTestProfile();
    const { buildMeshRequestKnowledgeTool } = await import("../src/tool-impl.js");

    const toolImpl = buildMeshRequestKnowledgeTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: mockMesh as any,
    });

    const result = (await toolImpl({ query: "test" })) as Record<string, unknown>;
    expect(result.error).toBe("targetOwnerId parameter is required");
  });

  it("returns error when query is missing", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const mockMesh = createMockMesh();
    const testProfile = makeTestProfile();
    const { buildMeshRequestKnowledgeTool } = await import("../src/tool-impl.js");

    const toolImpl = buildMeshRequestKnowledgeTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: mockMesh as any,
    });

    const result = (await toolImpl({ targetOwnerId: "envoy:owner:bob" })) as Record<string, unknown>;
    expect(result.error).toBe("query parameter is required");
  });

  it("handles network failure gracefully without exposing raw error", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const failingMesh = {
      sendExpectReply: vi.fn().mockRejectedValue(new Error("connection refused")),
    };
    const testProfile = makeTestProfile();
    const { buildMeshRequestKnowledgeTool } = await import("../src/tool-impl.js");

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:bob",
      displayName: "Bob",
      level: "direct",
      now: new Date().toISOString(),
    });
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:bob",
      peerId: "QmBob",
      listenAddrs: [],
    });

    const toolImpl = buildMeshRequestKnowledgeTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: failingMesh as any,
    });

    const result = (await toolImpl({
      targetOwnerId: "envoy:owner:bob",
      query: "What is the capital of France?",
    })) as Record<string, unknown>;

    // Should return a user-friendly error, not raw "connection refused"
    expect(result.error).toBeDefined();
    // Error message should be redacted (no raw network error details)
    expect(result.error).not.toContain("connection refused");
    expect(result.error).toContain("network error");
  });
});

// ─── Test: mesh_sendChat — policy enforcement ──────────────────────────────────

describe("MESH_SEND_CHAT_TOOL", () => {
  it("denies when no bond exists with target owner", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const mockMesh = createMockMesh();
    const testProfile = makeTestProfile();
    const { buildMeshSendChatTool } = await import("../src/tool-impl.js");

    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:stranger",
      peerId: "QmStranger",
      listenAddrs: [],
    });

    const toolImpl = buildMeshSendChatTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: mockMesh as any,
    });

    const result = (await toolImpl({
      targetOwnerId: "envoy:owner:stranger",
      text: "Hello!",
    })) as Record<string, unknown>;

    expect(result.denied).toBe(true);
    expect(mockMesh.send).not.toHaveBeenCalled();
  });

  it("allows when direct bond exists with target owner", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const mockMesh = createMockMesh();
    const testProfile = makeTestProfile();
    const { buildMeshSendChatTool } = await import("../src/tool-impl.js");

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:bob",
      displayName: "Bob",
      level: "direct",
      now: new Date().toISOString(),
    });
    await peerDirectoryStore.ensurePeerFromInboundChat({
      ownerId: "envoy:owner:bob",
      peerId: "QmBob",
      listenAddrs: [],
    });

    const toolImpl = buildMeshSendChatTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: mockMesh as any,
    });

    const result = (await toolImpl({
      targetOwnerId: "envoy:owner:bob",
      text: "Hello Bob!",
    })) as Record<string, unknown>;

    expect(result.sent).toBe(true);
    expect(result.messageId).toBeDefined();
    expect(mockMesh.send).toHaveBeenCalled();
    // Contact should be redacted in result
    expect((result.contact as Record<string, unknown>).ownerId).toBe("envoy:owner:bob");
    expect((result.contact as Record<string, unknown>)).not.toHaveProperty("peerId");
  });

  it("returns error when targetOwnerId is missing", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const mockMesh = createMockMesh();
    const testProfile = makeTestProfile();
    const { buildMeshSendChatTool } = await import("../src/tool-impl.js");

    const toolImpl = buildMeshSendChatTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: mockMesh as any,
    });

    const result = (await toolImpl({ text: "Hello" })) as Record<string, unknown>;
    expect(result.error).toBe("targetOwnerId parameter is required");
  });

  it("returns error when text is missing", async () => {
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const mockMesh = createMockMesh();
    const testProfile = makeTestProfile();
    const { buildMeshSendChatTool } = await import("../src/tool-impl.js");

    const toolImpl = buildMeshSendChatTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: mockMesh as any,
    });

    const result = (await toolImpl({ targetOwnerId: "envoy:owner:bob" })) as Record<string, unknown>;
    expect(result.error).toBe("text parameter is required");
  });
});

// ─── Test: LocalToolRegistry integration ───────────────────────────────────────

describe("agent adapter tools via LocalToolRegistry", () => {
  it("mesh_findCapability passes policy check with public caller", async () => {
    const registry = new LocalToolRegistry();
    const trustStore = createLocalTrustStore(profileDir);

    await trustStore.setTrustRecord({
      peerOwnerId: "envoy:owner:alice",
      displayName: "Alice",
      level: "direct",
      now: new Date().toISOString(),
    });

    const { buildMeshFindCapabilityTool } = await import("../src/tool-impl.js");
    const toolImpl = buildMeshFindCapabilityTool({ trustStore });
    registry.register(MESH_FIND_CAPABILITY_TOOL, toolImpl);

    const result = await registry.callTool(
      {
        toolName: "mesh_findCapability",
        parameters: { keywords: ["alice"] },
        callerSensitivity: "public",
      },
      false,
    );

    expect(result.ok).toBe(true);
    expect(result.policyDecision.action).toBe("allow");
    expect((result.output as Record<string, unknown>).contacts).toBeDefined();
  });

  it("mesh_requestKnowledge passes policy check but returns denied when no bond", async () => {
    const registry = new LocalToolRegistry();
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const mockMesh = createMockMesh();
    const testProfile = makeTestProfile();

    const { buildMeshRequestKnowledgeTool } = await import("../src/tool-impl.js");
    const toolImpl = buildMeshRequestKnowledgeTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: mockMesh as any,
    });
    registry.register(MESH_REQUEST_KNOWLEDGE_TOOL, toolImpl);

    const result = await registry.callTool(
      {
        toolName: "mesh_requestKnowledge",
        parameters: { targetOwnerId: "envoy:owner:stranger", query: "test" },
        callerSensitivity: "public",
      },
      false,
    );

    // Policy allows the tool call (tool minSensitivity is public)
    expect(result.policyDecision.action).toBe("allow");
    // But the tool implementation returns denied (no bond)
    expect(result.ok).toBe(true); // tool succeeded
    expect((result.output as Record<string, unknown>).denied).toBe(true);
    // EMP message should NOT have been sent
    expect(mockMesh.sendExpectReply).not.toHaveBeenCalled();
  });

  it("mesh_sendChat passes policy check but returns error when no bond", async () => {
    const registry = new LocalToolRegistry();
    const trustStore = createLocalTrustStore(profileDir);
    const taskStore = createLocalTaskStore(profileDir);
    const peerDirectoryStore = createLocalPeerDirectoryStore(profileDir);
    const mockMesh = createMockMesh();
    const testProfile = makeTestProfile();

    const { buildMeshSendChatTool } = await import("../src/tool-impl.js");
    const toolImpl = buildMeshSendChatTool({
      trustStore,
      peerDirectoryStore,
      taskStore,
      profile: testProfile.profile,
      mesh: mockMesh as any,
    });
    registry.register(MESH_SEND_CHAT_TOOL, toolImpl);

    const result = await registry.callTool(
      {
        toolName: "mesh_sendChat",
        parameters: { targetOwnerId: "envoy:owner:stranger", text: "Hello" },
        callerSensitivity: "public",
      },
      false,
    );

    // Policy allows the tool call
    expect(result.policyDecision.action).toBe("allow");
    // But tool returns denied (no bond)
    expect(result.ok).toBe(true);
    expect((result.output as Record<string, unknown>).denied).toBe(true);
    // No EMP message sent
    expect(mockMesh.send).not.toHaveBeenCalled();
  });

  it("external agent cannot call unknown tool", async () => {
    const registry = new LocalToolRegistry();

    const result = await registry.callTool(
      {
        toolName: "mesh_nonexistent",
        parameters: {},
        callerSensitivity: "public",
      },
      false,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("unknown tool");
    expect(result.policyDecision.action).toBe("deny");
  });
});
