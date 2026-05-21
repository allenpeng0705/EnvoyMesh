import { describe, expect, it, vi } from "vitest";
import {
  classifyDocumentIntent,
  matchLibraryItem,
  resolveBondTarget,
  runDocumentAgentTurn,
  type DocumentAgentToolResult,
} from "../src/document-agent-loop.js";
import type { BondRecord, LibraryItem } from "../src/node-service.js";

const sampleItem: LibraryItem = {
  documentId: "doc-1",
  relativePath: "docs/report.pdf",
  title: "report.pdf",
  extension: "pdf",
  byteLength: 2048,
  contentHash: "abc123hash",
  updatedAt: "2026-05-20T00:00:00.000Z",
  published: false,
};

describe("classifyDocumentIntent", () => {
  it("detects list library", () => {
    expect(classifyDocumentIntent("list my library files").kind).toBe("list_library");
  });

  it("detects discover", () => {
    const d = classifyDocumentIntent("who has kubo parity checklist");
    expect(d.kind).toBe("discover");
    expect(d.fileTitleQuery).toContain("kubo");
  });

  it("detects publish with path hint", () => {
    const p = classifyDocumentIntent('publish "docs/report.pdf"');
    expect(p.kind).toBe("publish");
    expect(p.pathHint).toBe("docs/report.pdf");
  });

  it("detects share propose", () => {
    const s = classifyDocumentIntent('share "docs/report.pdf" to Alex');
    expect(s.kind).toBe("share_propose");
    expect(s.pathHint).toBe("docs/report.pdf");
    expect(s.targetOwnerHint).toBe("Alex");
  });

  it("detects request share from contact", () => {
    const r = classifyDocumentIntent("request share from Sam for kubo parity");
    expect(r.kind).toBe("request_share_from");
    expect(r.targetOwnerHint).toBe("Sam");
    expect(r.fileTitleQuery).toContain("kubo");
  });

  it("defaults to knowledge", () => {
    expect(classifyDocumentIntent("explain my vault notes").kind).toBe("knowledge");
  });
});

describe("matchLibraryItem", () => {
  it("matches by relative path substring", () => {
    expect(matchLibraryItem([sampleItem], "report.pdf")?.documentId).toBe("doc-1");
  });
});

describe("resolveBondTarget", () => {
  const bonds: BondRecord[] = [
    { peerOwnerId: "envoy:owner:alex", level: "direct", displayName: "Alex" },
  ];

  it("matches display name", () => {
    expect(resolveBondTarget(bonds, "Alex")?.peerOwnerId).toBe("envoy:owner:alex");
  });
});

describe("runDocumentAgentTurn", () => {
  it("lists library via tool", async () => {
    const executeTool = vi.fn(async (): Promise<DocumentAgentToolResult> => ({
      ok: true,
      result: { items: [sampleItem] },
      toolName: "mesh.library_list",
      correlationId: "c1",
      latencyMs: 1,
    }));

    const result = await runDocumentAgentTurn({
      message: "list my library",
      listLibraryItems: async () => [sampleItem],
      getBonds: async () => [],
      executeTool,
      knowledgeQuery: async () => "kq",
    });

    expect(result.intent).toBe("list_library");
    expect(result.toolsUsed).toContain("mesh.library_list");
    expect(result.answer).toContain("report.pdf");
    expect(executeTool).toHaveBeenCalledWith("mesh.library_list", {});
  });

  it("falls back to knowledgeQuery", async () => {
    const knowledgeQuery = vi.fn(async () => "vault answer");
    const result = await runDocumentAgentTurn({
      message: "what is in my notes about Helia?",
      listLibraryItems: async () => [],
      getBonds: async () => [],
      executeTool: vi.fn(),
      knowledgeQuery,
    });
    expect(result.intent).toBe("knowledge");
    expect(result.answer).toBe("vault answer");
    expect(knowledgeQuery).toHaveBeenCalled();
  });

  it("proposes share when file and contact match", async () => {
    const executeTool = vi.fn(async (): Promise<DocumentAgentToolResult> => ({
      ok: true,
      result: { proposalId: "p1" },
      toolName: "mesh.share_propose",
      correlationId: "c2",
      latencyMs: 1,
    }));

    const result = await runDocumentAgentTurn({
      message: 'share "docs/report.pdf" to Alex',
      listLibraryItems: async () => [sampleItem],
      getBonds: async () => [{ peerOwnerId: "envoy:owner:alex", level: "direct", displayName: "Alex" }],
      executeTool,
      knowledgeQuery: async () => "",
    });

    expect(result.intent).toBe("share_propose");
    expect(result.toolsUsed).toContain("mesh.share_propose");
    expect(result.answer).toContain("Inbox");
  });

  it("reports auto-share when mesh.share_propose returns autoShared", async () => {
    const executeTool = vi.fn(async (): Promise<DocumentAgentToolResult> => ({
      ok: true,
      result: { autoShared: true, targetOwnerId: "envoy:owner:alex", vaultRelativePath: "docs/report.pdf" },
      toolName: "mesh.share_propose",
      correlationId: "c2b",
      latencyMs: 1,
    }));

    const result = await runDocumentAgentTurn({
      message: 'share "docs/report.pdf" to Alex',
      listLibraryItems: async () => [sampleItem],
      getBonds: async () => [{ peerOwnerId: "envoy:owner:alex", level: "direct", displayName: "Alex" }],
      executeTool,
      knowledgeQuery: async () => "",
    });

    expect(result.intent).toBe("share_propose");
    expect(result.answer).toContain("Shared");
    expect(result.answer).not.toContain("Added a share proposal");
  });

  it("requests share from contact via discover + chat", async () => {
    const sendChat = vi.fn(async () => {});
    const discoverPublishedLibrary = vi.fn(async () => [
      {
        peerOwnerId: "envoy:owner:alex",
        displayName: "Alex",
        bondLevel: "direct",
        files: [{ title: "notes.md", relativePath: "notes.md", contentHash: "abc", byteLength: 1, documentId: "d1" }],
      },
    ]);

    const result = await runDocumentAgentTurn({
      message: "request share from Alex for notes",
      listLibraryItems: async () => [],
      getBonds: async () => [{ peerOwnerId: "envoy:owner:alex", level: "direct", displayName: "Alex" }],
      executeTool: vi.fn(),
      knowledgeQuery: async () => "",
      discoverPublishedLibrary,
      sendChat,
    });

    expect(result.intent).toBe("request_share_from");
    expect(result.toolsUsed).toContain("mesh.library_request_share");
    expect(sendChat).toHaveBeenCalled();
    expect(result.answer).toContain("Alex");
  });

  it("lists active transfers via transfer_status intent", async () => {
    const executeTool = vi.fn(async (): Promise<DocumentAgentToolResult> => ({
      ok: true,
      result: {
        transfers: [{ correlationId: "corr-1", phase: "negotiating", vaultRelativePath: "docs/a.pdf" }],
      },
      toolName: "mesh.transfer_status",
      correlationId: "c3",
      latencyMs: 1,
    }));

    const result = await runDocumentAgentTurn({
      message: "active transfers",
      listLibraryItems: async () => [],
      getBonds: async () => [],
      executeTool,
      knowledgeQuery: async () => "",
    });

    expect(result.intent).toBe("transfer_status");
    expect(result.toolsUsed).toContain("mesh.transfer_status");
    expect(result.answer).toContain("negotiating");
  });
});
