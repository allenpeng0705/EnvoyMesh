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
