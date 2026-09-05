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

  it("does not owner-gate coding project-folder browse (codingEnabled gate)", () => {
    expect(isOwnerOnlyRpcMethod("getHomeFsInfo")).toBe(false)
    expect(isOwnerOnlyRpcMethod("listHomeFsEntries")).toBe(false)
    expect(isOwnerOnlyRpcMethod("closeTerminalSession")).toBe(false)
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

  it("gates askHomeModel for family (EM-3 owner-only v1)", () => {
    expect(isOwnerOnlyRpcMethod("askHomeModel")).toBe(true)
  })

  it("does not owner-gate Envoy Harness / Pi RPCs (codingEnabled gate)", () => {
    for (const method of [
      "getEnvoyHarnessStatus",
      "askEnvoyHarness",
      "getEnvoyHarnessChatHistory",
      "listEnvoyHarnessChats",
      "createEnvoyHarnessChat",
      "openEnvoyHarnessChat",
      "removeEnvoyHarnessChat",
      "resetEnvoyHarnessChat",
      "setEnvoyHarnessAutoRunPolicy",
      "listEnvoyHarnessPeers",
      "setEnvoyHarnessProjectPath",
      "invokeEnvoyHarnessEhui",
      "ensureEnvoyTerminalSession",
      "ensurePiTerminalSession",
      "startEnvoyHarnessTurn",
      "cancelEnvoyHarnessTurn",
      "ehRespondToPermission",
      "ehRespondToUserQuestion",
    ]) {
      expect(isOwnerOnlyRpcMethod(method), method).toBe(false)
    }
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
