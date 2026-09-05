/**
 * EM-P — profile-aware vault RPC integration (design §5.7.3,
 * docs/envoy-home-side-plan.md §1.5).
 *
 * Exercises the real NodeServiceImpl vault handlers + fileshare runtime with
 * an on-disk vault and per-session caller contexts (`runWithRpcCaller`):
 *
 * - owner sessions are byte-identical to today (no prefix, full-vault lists);
 * - family sessions are scoped to their own area `notes/veda/<profileId>/`;
 * - owner-vault / mesh RPCs (knowledgeQuery, sendChatAttachment, shareFile)
 *   deny family sessions with a catalog `owner-only: …` error.
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
  createSensitivityOverrideStore,
} from "@envoymesh/local-store"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { NodeServiceImpl } from "../src/node-service-impl.js"
import { runWithRpcCaller } from "../src/rpc-caller-context.js"
import type { RpcCallerContext } from "../src/rpc-caller-context.js"

const OWNER: RpcCallerContext = {
  ownerId: "envoy:owner:test",
  profileId: "owner",
  isOwnerProfile: true,
  source: "local",
}

const MOM: RpcCallerContext = {
  ownerId: "envoy:owner:test",
  profileId: "mom",
  isOwnerProfile: false,
  source: "session",
}

describe("EM-P profile-aware vault RPCs", () => {
  let profileDir: string
  let vaultDir: string
  let svc: NodeServiceImpl

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "em-p-profile-"))
    vaultDir = await mkdtemp(join(tmpdir(), "em-p-vault-"))
    const trustStore = createLocalTrustStore(profileDir)
    const peerDirectory = createLocalPeerDirectoryStore(profileDir)
    const human = createHumanProfileStore(profileDir)
    svc = new NodeServiceImpl(
      undefined,
      trustStore,
      peerDirectory,
      human,
      profileDir,
      undefined,
      vaultDir,
    )
  })

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true })
    await rm(vaultDir, { recursive: true, force: true })
  })

  async function existsOnDisk(relativePath: string): Promise<boolean> {
    try {
      await stat(join(vaultDir, relativePath))
      return true
    } catch {
      return false
    }
  }

  describe("owner behavior is unchanged", () => {
    it("createNote with subfolder veda still writes notes/veda/<file>.md", async () => {
      const created = await runWithRpcCaller(OWNER, () =>
        svc.createNote({
          filename: "own-veda.md",
          content: "# owner veda note",
          subfolder: "veda",
        }),
      )
      expect(created.relativePath).toBe("notes/veda/own-veda.md")
      expect(await existsOnDisk("notes/veda/own-veda.md")).toBe(true)
    })

    it("createNote without subfolder still writes notes/<file>.md", async () => {
      const created = await runWithRpcCaller(OWNER, () =>
        svc.createNote({ filename: "plain.md", content: "# plain" }),
      )
      expect(created.relativePath).toBe("notes/plain.md")
      expect(await existsOnDisk("notes/plain.md")).toBe(true)
    })

    it("owner listLibraryItems sees the whole vault", async () => {
      await runWithRpcCaller(OWNER, () =>
        svc.createNote({ filename: "a.md", content: "# a", subfolder: "veda" }),
      )
      await runWithRpcCaller(MOM, () =>
        svc.createNote({ filename: "m.md", content: "# m", subfolder: "veda" }),
      )
      const items = await runWithRpcCaller(OWNER, () => svc.listLibraryItems())
      expect(items.map((i) => i.relativePath).sort()).toEqual([
        "notes/veda/a.md",
        "notes/veda/mom/m.md",
      ])
    })
  })

  describe("family sessions are scoped to their own area", () => {
    it("family createNote with subfolder veda lands under notes/veda/<profileId>/", async () => {
      const created = await runWithRpcCaller(MOM, () =>
        svc.createNote({ filename: "mymom.md", content: "# mom note", subfolder: "veda" }),
      )
      expect(created.relativePath).toBe("notes/veda/mom/mymom.md")
      expect(await existsOnDisk("notes/veda/mom/mymom.md")).toBe(true)

      const raw = await readFile(join(vaultDir, created.relativePath), "utf8")
      expect(raw).toContain("# mom note")
    })

    it("family createNote without subfolder also lands inside own area", async () => {
      const created = await runWithRpcCaller(MOM, () =>
        svc.createNote({ filename: "unfiled.md", content: "# unfiled" }),
      )
      expect(created.relativePath).toBe("notes/veda/mom/unfiled.md")
    })

    it("family createNote on an already-scoped edit path does not double-nest", async () => {
      const created = await runWithRpcCaller(MOM, () =>
        svc.createNote({
          filename: "edited.md",
          content: "# edited",
          subfolder: "veda/mom",
        }),
      )
      expect(created.relativePath).toBe("notes/veda/mom/edited.md")
    })

    it("family listLibraryItems sees only its own area", async () => {
      await runWithRpcCaller(OWNER, () =>
        svc.createNote({ filename: "owner.md", content: "# owner", subfolder: "veda" }),
      )
      await runWithRpcCaller(
        {
          ownerId: "envoy:owner:test",
          profileId: "dad",
          isOwnerProfile: false,
          source: "session",
        },
        () => svc.createNote({ filename: "dad.md", content: "# dad", subfolder: "veda" }),
      )
      await runWithRpcCaller(MOM, () =>
        svc.createNote({ filename: "mom.md", content: "# mom", subfolder: "veda" }),
      )
      const mine = await runWithRpcCaller(MOM, () => svc.listLibraryItems())
      expect(mine.map((i) => i.relativePath)).toEqual(["notes/veda/mom/mom.md"])

      // Owner list is unchanged (whole vault).
      const all = await runWithRpcCaller(OWNER, () => svc.listLibraryItems())
      expect(all.map((i) => i.relativePath).sort()).toEqual([
        "notes/veda/dad/dad.md",
        "notes/veda/mom/mom.md",
        "notes/veda/owner.md",
      ])
    })

    it("family listAllLocalFiles returns only own-area vault rows (no owner surfaces)", async () => {
      await runWithRpcCaller(OWNER, () =>
        svc.createNote({ filename: "owner.md", content: "# owner", subfolder: "veda" }),
      )
      await runWithRpcCaller(MOM, () =>
        svc.createNote({ filename: "mom.md", content: "# mom", subfolder: "veda" }),
      )
      const out = await runWithRpcCaller(MOM, () => svc.listAllLocalFiles())
      expect(out.items.map((i) => i.relativePath)).toEqual(["notes/veda/mom/mom.md"])
      expect(out.vaultCount).toBe(1)
      expect(out.workspaceCount).toBe(0)
      expect(out.linkedObsidianCount).toBe(0)
      expect(out.mcpRemoteCount).toBe(0)
    })

    it("family readLibraryItemContent reads its own note and denies others", async () => {
      await runWithRpcCaller(OWNER, () =>
        svc.createNote({ filename: "owner.md", content: "# owner secret", subfolder: "veda" }),
      )
      const created = await runWithRpcCaller(MOM, () =>
        svc.createNote({ filename: "mom.md", content: "# mom secret", subfolder: "veda" }),
      )
      const mine = await runWithRpcCaller(MOM, () =>
        svc.readLibraryItemContent({ relativePath: created.relativePath }),
      )
      expect(Buffer.from(mine.contentBase64, "base64").toString("utf8")).toContain("# mom secret")

      await expect(
        runWithRpcCaller(MOM, () =>
          svc.readLibraryItemContent({ relativePath: "notes/veda/owner.md" }),
        ),
      ).rejects.toThrow(/restricted to your own area/)

      await expect(
        runWithRpcCaller(MOM, () =>
          svc.readLibraryItemContent({ relativePath: "notes/veda/mom/../../owner.md" }),
        ),
      ).rejects.toThrow(/traversal|restricted/)

      // Owner reads stay whole-vault (unchanged).
      const ownerRead = await runWithRpcCaller(OWNER, () =>
        svc.readLibraryItemContent({ relativePath: created.relativePath }),
      )
      expect(Buffer.from(ownerRead.contentBase64, "base64").toString("utf8")).toContain(
        "# mom secret",
      )
    })

    it("family importToLibrary is allowed inside own area and denied outside", async () => {
      const ok = await runWithRpcCaller(MOM, () =>
        svc.importToLibrary({
          relativePath: "notes/veda/mom/scan.md",
          contentBase64: Buffer.from("# scan").toString("base64"),
          mimeType: "text/markdown",
        }),
      )
      expect(ok.relativePath).toBe("notes/veda/mom/scan.md")

      await expect(
        runWithRpcCaller(MOM, () =>
          svc.importToLibrary({
            relativePath: "notes/hello.md",
            contentBase64: Buffer.from("# hello").toString("base64"),
            mimeType: "text/markdown",
          }),
        ),
      ).rejects.toThrow(/restricted to your own area/)
    })

    it("family deleteVaultItem deletes own items and denies owner items", async () => {
      await runWithRpcCaller(OWNER, () =>
        svc.createNote({ filename: "owner.md", content: "# owner", subfolder: "veda" }),
      )
      const created = await runWithRpcCaller(MOM, () =>
        svc.createNote({ filename: "mom.md", content: "# mom", subfolder: "veda" }),
      )

      await expect(
        runWithRpcCaller(MOM, () => svc.deleteVaultItem({ relativePath: "notes/veda/owner.md" })),
      ).rejects.toThrow(/restricted to your own area/)

      await runWithRpcCaller(MOM, () => svc.deleteVaultItem({ relativePath: created.relativePath }))
      expect(await existsOnDisk(created.relativePath)).toBe(false)
    })
  })

  describe("owner-vault / mesh RPCs deny family sessions (EM-P)", () => {
    it("knowledgeQuery throws owner-only for family", async () => {
      await expect(
        runWithRpcCaller(MOM, () => svc.knowledgeQuery("what is in my vault?")),
      ).rejects.toThrow(/owner-only: knowledge queries are limited to the node owner/)
    })

    it("sendChatAttachment throws owner-only for family", async () => {
      await expect(
        runWithRpcCaller(MOM, () =>
          svc.sendChatAttachment({
            targetOwnerId: "envoy:owner:peer",
            filename: "a.png",
            contentBase64: Buffer.from("img").toString("base64"),
          }),
        ),
      ).rejects.toThrow(/owner-only: mesh chat attachments are limited to the node owner/)
    })

    it("shareFile throws owner-only for family", async () => {
      await expect(
        runWithRpcCaller(MOM, () =>
          svc.shareFile("envoy:owner:peer", {
            path: "notes/veda/mom/a.md",
            sensitivity: "private",
            deliveryChannel: "chat",
          }),
        ),
      ).rejects.toThrow(/owner-only: mesh file sharing is limited to the node owner/)
    })

    it("owner sessions are not blocked by the family deny", async () => {
      // Owner createNote path stays functional (asserted above); here we only
      // verify the deny helper does not fire for owner callers.
      const created = await runWithRpcCaller(OWNER, () =>
        svc.createNote({ filename: "owner2.md", content: "# o", subfolder: "veda" }),
      )
      expect(created.relativePath).toBe("notes/veda/owner2.md")
    })
  })

  describe("EM-F4 family notes are private by default; publish is owner-only", () => {
    it("family createNote persists a `private` sensitivity override for the new note", async () => {
      const created = await runWithRpcCaller(MOM, () =>
        svc.createNote({
          filename: "secret.md",
          content: "# mom's private note",
          subfolder: "veda",
        }),
      )
      expect(created.relativePath).toBe("notes/veda/mom/secret.md")
      // createNoteViaRuntime writes the per-item override (default private)
      // into {profileDir}/vault-sensitivity-overrides.json via
      // writeSensitivityOverride (node-service-fileshare.ts).
      const overrides = createSensitivityOverrideStore(profileDir)
      expect(await overrides.get(created.documentId)).toBe("private")
    })

    it("family sessions cannot publish a note — setLibraryItemPublished is owner-only", async () => {
      const created = await runWithRpcCaller(MOM, () =>
        svc.createNote({
          filename: "secret.md",
          content: "# mom's private note",
          subfolder: "veda",
        }),
      )
      // Router OWNER_ONLY list (json-rpc-router.ts) + impl-level deny:
      // node-service-impl.setLibraryItemPublished calls _denyFamilySession.
      await expect(
        runWithRpcCaller(MOM, () => svc.setLibraryItemPublished(created.documentId, true)),
      ).rejects.toThrow(/owner-only: library publishing is limited to the node owner/)
      // The denied attempt must not flip the override to public.
      const overrides = createSensitivityOverrideStore(profileDir)
      expect(await overrides.get(created.documentId)).toBe("private")
    })

    it("owner can publish the family note — override flips to public (positive control)", async () => {
      const created = await runWithRpcCaller(MOM, () =>
        svc.createNote({
          filename: "secret.md",
          content: "# mom's private note",
          subfolder: "veda",
        }),
      )
      await runWithRpcCaller(OWNER, () => svc.setLibraryItemPublished(created.documentId, true))
      // Owner publish writes the override as "public"
      // (setLibraryItemPublishedViaRuntime → writeSensitivityOverride).
      const overrides = createSensitivityOverrideStore(profileDir)
      expect(await overrides.get(created.documentId)).toBe("public")
    })
  })
})
