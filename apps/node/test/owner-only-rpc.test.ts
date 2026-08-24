import { describe, expect, it } from "vitest"
import { isOwnerOnlyRpcMethod } from "../src/json-rpc-router.js"
import { requireOwnerProfile, runWithRpcCaller } from "../src/rpc-caller-context.js"

describe("isOwnerOnlyRpcMethod", () => {
  it("gates vault / library surfaces for family sessions", () => {
    for (const method of [
      "libraryRead",
      "openLibraryItem",
      "listAllLocalFiles",
      "readLocalFileContent",
      "listLibraryItems",
      "readLibraryItemContent",
      "pinLibraryItemExternal",
      "discoverPublishedLibrary",
    ]) {
      expect(isOwnerOnlyRpcMethod(method), method).toBe(true)
    }
  })

  it("gates all terminal* methods via prefix", () => {
    expect(isOwnerOnlyRpcMethod("terminalAttach")).toBe(true)
    expect(isOwnerOnlyRpcMethod("terminalRunFromNaturalLanguage")).toBe(true)
    expect(isOwnerOnlyRpcMethod("terminalGetAssistState")).toBe(true)
    expect(isOwnerOnlyRpcMethod("listTerminalSessions")).toBe(true)
  })

  it("gates home folder browse + Ext Agent project path for family", () => {
    for (const method of [
      "getHomeFsInfo",
      "listHomeFsEntries",
      "discoverObsidianVaults",
      "openDesktopApp",
      "getExtAgentProjectPath",
      "setExtAgentProjectPath",
      "previewHomeFsFile",
      "runMmxMediaCommand",
      "revealHomeFsPath",
      "uploadEnvoyAttachment",
      "buildAgentAttachmentContext",
    ]) {
      expect(isOwnerOnlyRpcMethod(method), method).toBe(true)
    }
  })

  it("gates chat draft RPCs for family (Agent Mode / Assist drafts)", () => {
    expect(isOwnerOnlyRpcMethod("getChatDrafts")).toBe(true)
    expect(isOwnerOnlyRpcMethod("deleteChatDraft")).toBe(true)
  })

  it("gates Phase 57 KB mutation / reindex RPCs for family", () => {
    for (const method of [
      "reindexRagKnowledge",
      "testRagEmbedding",
      "testChatModel",
      "saveExternalMcpSearchAsNote",
      "listExternalMcpKnowledge",
      "importLinkedObsidianNotes",
      "importExternalMcpKnowledge",
      "exportNotesToLinkedObsidian",
      "exportNotesToMcp",
      "convertLibraryItemToMarkdown",
    ]) {
      expect(isOwnerOnlyRpcMethod(method), method).toBe(true)
    }
  })

  it("gates the dedicated Envoy Harness RPCs for family", () => {
    expect(isOwnerOnlyRpcMethod("getEnvoyHarnessStatus")).toBe(true)
    expect(isOwnerOnlyRpcMethod("askEnvoyHarness")).toBe(true)
    expect(isOwnerOnlyRpcMethod("listEnvoyHarnessPeers")).toBe(true)
    expect(isOwnerOnlyRpcMethod("setEnvoyHarnessProjectPath")).toBe(true)
    expect(isOwnerOnlyRpcMethod("invokeEnvoyHarnessEhui")).toBe(true)
    expect(isOwnerOnlyRpcMethod("ensureEnvoyTerminalSession")).toBe(true)
  })

  it("allows family chat RPCs", () => {
    expect(isOwnerOnlyRpcMethod("sendFamilyMessage")).toBe(false)
    expect(isOwnerOnlyRpcMethod("listFamilyRooms")).toBe(false)
    expect(isOwnerOnlyRpcMethod("createFamilyRoom")).toBe(false)
    expect(isOwnerOnlyRpcMethod("getNodeConfig")).toBe(false)
    expect(isOwnerOnlyRpcMethod("previewFamilyInvite")).toBe(false)
    expect(isOwnerOnlyRpcMethod("pairThinClient")).toBe(false)
  })

  it("rejects owner-only methods for family callers", async () => {
    await expect(
      runWithRpcCaller(
        {
          ownerId: "envoy:owner:x",
          profileId: "mom",
          isOwnerProfile: false,
          source: "session",
        },
        async () => {
          if (isOwnerOnlyRpcMethod("libraryRead")) {
            requireOwnerProfile("call libraryRead")
          }
        },
      ),
    ).rejects.toThrow(/Only the node owner/)
  })
})
