/**
 * EM-F1 — family image/file sharing (same home node).
 *
 * Pure scope/path helpers + runtime ACL/storage tests over real stores in a
 * tmp profileDir, plus NodeServiceImpl-level message-send tests proving the
 * attachment descriptors ride chat history for both DM participants.
 */
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { familyThreadKey, OWNER_FAMILY_PROFILE_ID } from "@envoymesh/api"
import {
  createFamilyProfileStore,
  createFamilyRoomStore,
  createHumanProfileStore,
  createLocalPeerDirectoryStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store"
import { generateDeviceIdentity, generateOwnerIdentity, createDeviceCertificate } from "@envoymesh/identity"
import type { EnvoyMesh } from "@envoymesh/network"
import { NodeServiceImpl } from "../src/node-service-impl.js"
import { routeRpcMethod } from "../src/json-rpc-router.js"
import { localOwnerCaller, runWithRpcCaller } from "../src/rpc-caller-context.js"
import {
  FAMILY_MEDIA_MAX_FILE_BYTES,
  FAMILY_MEDIA_READ_DEFAULT_MAX_BYTES,
  FAMILY_MEDIA_DIR,
  FAMILY_MEDIA_META_FILE,
  familyDmScopeKey,
  familyMediaRootDir,
  familyMediaScopeDir,
  familyRoomScopeKey,
  isFamilyMediaScopeKey,
  parseFamilyDmScopeKey,
  sanitizeFamilyMediaFilename,
  uploadFamilyAttachmentViaRuntime,
  readFamilyAttachmentViaRuntime,
} from "../src/family-media.js"

const OWNER_ID = "envoy:owner:family-media-test"
const ownerCaller = () => localOwnerCaller(OWNER_ID)
const memberCaller = (profileId: string) => ({
  ownerId: OWNER_ID,
  profileId,
  isOwnerProfile: false,
  source: "session" as const,
})

function b64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64")
}

function sha256hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex")
}

// ---------------------------------------------------------------
// Pure helper tests
// ---------------------------------------------------------------

describe("family-media pure helpers", () => {
  it("familyDmScopeKey mirrors the sorted family thread key with dm: prefix", () => {
    const a = "mom"
    const b = "dad"
    expect(familyDmScopeKey(a, b)).toBe(`dm:${familyThreadKey(a, b)}`)
    expect(familyDmScopeKey(a, b)).toBe(familyDmScopeKey(b, a))
    expect(parseFamilyDmScopeKey(familyDmScopeKey(a, b))).toEqual({
      profileIdA: "dad",
      profileIdB: "mom",
    })
    expect(parseFamilyDmScopeKey("room:x")).toBeNull()
    expect(parseFamilyDmScopeKey("dm:garbage")).toBeNull()
  })

  it("familyRoomScopeKey / isFamilyMediaScopeKey validation", () => {
    expect(familyRoomScopeKey(" abc ")).toBe("room:abc")
    expect(() => familyRoomScopeKey("  ")).toThrow(/roomId/)
    expect(isFamilyMediaScopeKey("dm:family:a:b")).toBe(true)
    expect(isFamilyMediaScopeKey("room:abc")).toBe(true)
    expect(isFamilyMediaScopeKey("../family-media")).toBe(false)
    expect(isFamilyMediaScopeKey("family:a:b")).toBe(false)
    expect(() => familyMediaScopeDir("/p", "../evil")).toThrow(/invalid family media scope/)
    expect(familyMediaScopeDir("/p", "room:abc")).toBe(join("/p", FAMILY_MEDIA_DIR, "room:abc"))
  })

  it("sanitizeFamilyMediaFilename keeps basename only", () => {
    expect(sanitizeFamilyMediaFilename("../../evil/photo.jpg")).toBe("photo.jpg")
    expect(sanitizeFamilyMediaFilename("a\\b\\c.png")).toBe("c.png")
    expect(sanitizeFamilyMediaFilename("  hello world.jpg  ")).toBe("hello world.jpg")
    expect(sanitizeFamilyMediaFilename("a\u0000b\u001fc.txt")).toBe("abc.txt")
    expect(() => sanitizeFamilyMediaFilename("")).toThrow(/invalid filename/)
    expect(() => sanitizeFamilyMediaFilename("..")).toThrow(/invalid filename/)
    expect(() => sanitizeFamilyMediaFilename("/")).toThrow(/invalid filename/)
  })
})

// ---------------------------------------------------------------
// Runtime ACL + storage tests (real stores + tmp profileDir)
// ---------------------------------------------------------------

describe("family-media runtime", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "family-media-"))
    const profiles = createFamilyProfileStore(dir)
    await profiles.create({ name: "Owner", isOwner: true })
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined)
  })

  function deps() {
    return {
      profileDir: dir,
      familyProfileStore: createFamilyProfileStore(dir),
      familyRoomStore: createFamilyRoomStore(dir),
    }
  }

  async function ensureProfiles(names: string[]): Promise<void> {
    const store = createFamilyProfileStore(dir)
    for (const name of names) {
      if (!(await store.get(name.toLowerCase()))) {
        await store.create({ name, isOwner: false })
      }
    }
  }

  async function fileNamesUnder(scopeDir: string, id: string): Promise<string[]> {
    return readdir(join(scopeDir, id))
  }

  it("upload DM by member — bytes under dm scope + descriptor + contentHash", async () => {
    await ensureProfiles(["Dad", "Mom"])
    const content = "family photo bytes"
    const uploaded = await runWithRpcCaller(memberCaller("dad"), () =>
      uploadFamilyAttachmentViaRuntime(deps(), {
        scope: { dm: { toProfileId: "mom" } },
        filename: "holiday.jpg",
        mimeType: "image/jpeg",
        contentBase64: b64(content),
      }),
    )
    expect(uploaded.filename).toBe("holiday.jpg")
    expect(uploaded.mimeType).toBe("image/jpeg")
    expect(uploaded.sizeBytes).toBe(Buffer.byteLength(content))
    expect(uploaded.contentHash).toBe(sha256hex(Buffer.from(content, "utf8")))
    expect(uploaded.id).toMatch(/^[0-9a-f-]{36}$/)

    const scopeDir = familyMediaScopeDir(dir, familyDmScopeKey("dad", "mom"))
    const files = await fileNamesUnder(scopeDir, uploaded.id)
    expect(files.sort()).toEqual(["holiday.jpg", FAMILY_MEDIA_META_FILE])
    // Never inside the owner vault; family-media is a sibling of family stores.
    expect(familyMediaRootDir(dir)).toBe(join(dir, FAMILY_MEDIA_DIR))
    const stored = await readFile(join(scopeDir, uploaded.id, "holiday.jpg"))
    expect(stored.toString("utf8")).toBe(content)
    const meta = JSON.parse(
      await readFile(join(scopeDir, uploaded.id, FAMILY_MEDIA_META_FILE), "utf8"),
    )
    expect(meta.uploadedByProfileId).toBe("dad")
    expect(meta.scopeKey).toBe(familyDmScopeKey("dad", "mom"))
  })

  it("upload DM by member targets the same dir from the other direction", async () => {
    await ensureProfiles(["Dad", "Mom"])
    const upDad = await runWithRpcCaller(memberCaller("dad"), () =>
      uploadFamilyAttachmentViaRuntime(deps(), {
        scope: { dm: { toProfileId: "mom" } },
        filename: "from-dad.txt",
        mimeType: "text/plain",
        contentBase64: b64("hi"),
      }),
    )
    const upMom = await runWithRpcCaller(memberCaller("mom"), () =>
      uploadFamilyAttachmentViaRuntime(deps(), {
        scope: { dm: { toProfileId: "dad" } },
        filename: "from-mom.txt",
        mimeType: "text/plain",
        contentBase64: b64("hey"),
      }),
    )
    const scopeDir = familyMediaScopeDir(dir, familyDmScopeKey("dad", "mom"))
    expect(await readdir(join(scopeDir, upDad.id))).toContain("from-dad.txt")
    expect(await readdir(join(scopeDir, upMom.id))).toContain("from-mom.txt")
    // Opposite direction still resolves to the same shared pair area.
    expect(scopeDir).toBe(familyMediaScopeDir(dir, familyDmScopeKey("mom", "dad")))
  })

  it("upload room by member is allowed; upload to unknown DM profile denied", async () => {
    await ensureProfiles(["Dad", "Mom"])
    const d = deps()
    const room = await d.familyRoomStore!.create({
      title: "Kitchen",
      creatorProfileId: "dad",
      memberProfileIds: ["mom"],
    })
    const uploaded = await runWithRpcCaller(memberCaller("mom"), () =>
      uploadFamilyAttachmentViaRuntime(d, {
        scope: { room: { roomId: room.roomId } },
        filename: "menu.pdf",
        mimeType: "application/pdf",
        contentBase64: b64("%PDF-1.4"),
      }),
    )
    expect(await stat(join(familyMediaScopeDir(dir, familyRoomScopeKey(room.roomId)), uploaded.id))).toBeTruthy()

    await expect(
      runWithRpcCaller(memberCaller("dad"), () =>
        uploadFamilyAttachmentViaRuntime(deps(), {
          scope: { dm: { toProfileId: "nobody" } },
          filename: "x.txt",
          mimeType: "text/plain",
          contentBase64: b64("x"),
        }),
      ),
    ).rejects.toThrow(/Family profile not found: nobody/)
  })

  it("upload room by non-member denied; filename sanitized on write", async () => {
    await ensureProfiles(["Dad", "Mom"])
    const d = deps()
    const room = await d.familyRoomStore!.create({
      title: "Dad Only",
      creatorProfileId: "dad",
      memberProfileIds: [],
    })
    await expect(
      runWithRpcCaller(memberCaller("mom"), () =>
        uploadFamilyAttachmentViaRuntime(d, {
          scope: { room: { roomId: room.roomId } },
          filename: "secret.txt",
          mimeType: "text/plain",
          contentBase64: b64("s"),
        }),
      ),
    ).rejects.toThrow(/not a member of this family room/)

    const uploaded = await runWithRpcCaller(memberCaller("dad"), () =>
      uploadFamilyAttachmentViaRuntime(d, {
        scope: { room: { roomId: room.roomId } },
        filename: "../../evil/../photo.jpg",
        mimeType: "image/jpeg",
        contentBase64: b64("jpeg"),
      }),
    )
    expect(uploaded.filename).toBe("photo.jpg")
    const scopeDir = familyMediaScopeDir(dir, familyRoomScopeKey(room.roomId))
    expect(await readdir(join(scopeDir, uploaded.id))).toEqual(
      expect.arrayContaining(["photo.jpg"]),
    )
    // Nothing escaped into parent directories.
    const evil = join(dir, "evil")
    await expect(stat(evil)).rejects.toThrow()
  })

  it("read: pair member can read, owner may read any family thread, non-member denied, unknown id not-found", async () => {
    await ensureProfiles(["Dad", "Mom"])
    const d = deps()
    const dadUpload = await runWithRpcCaller(memberCaller("dad"), () =>
      uploadFamilyAttachmentViaRuntime(d, {
        scope: { dm: { toProfileId: "mom" } },
        filename: "pic.png",
        mimeType: "image/png",
        contentBase64: b64("png-bytes-here"),
      }),
    )

    // The other pair member reads it.
    const byMom = await runWithRpcCaller(memberCaller("mom"), () =>
      readFamilyAttachmentViaRuntime(d, { id: dadUpload.id }),
    )
    expect(Buffer.from(byMom.contentBase64, "base64").toString("utf8")).toBe("png-bytes-here")

    // Owner may read any family thread (owner is not part of this DM pair).
    const byOwner = await runWithRpcCaller(ownerCaller(), () =>
      readFamilyAttachmentViaRuntime(d, { id: dadUpload.id }),
    )
    expect(byOwner.sizeBytes).toBe(Buffer.byteLength("png-bytes-here"))

    // A stranger profile (not in the pair) is denied.
    await ensureProfiles(["Alex"])
    await expect(
      runWithRpcCaller(memberCaller("alex"), () =>
        readFamilyAttachmentViaRuntime(d, { id: dadUpload.id }),
      ),
    ).rejects.toThrow(/forbidden/)

    // Unknown id.
    await expect(
      runWithRpcCaller(memberCaller("dad"), () =>
        readFamilyAttachmentViaRuntime(d, { id: "00000000-0000-4000-8000-000000000000" }),
      ),
    ).rejects.toThrow(/not-found/)
  })

  it("read: room member allowed, non-member room read denied", async () => {
    await ensureProfiles(["Dad", "Mom", "Alex"])
    const d = deps()
    const room = await d.familyRoomStore!.create({
      title: "Family",
      creatorProfileId: "dad",
      memberProfileIds: ["mom"],
    })
    const uploaded = await runWithRpcCaller(memberCaller("dad"), () =>
      uploadFamilyAttachmentViaRuntime(d, {
        scope: { room: { roomId: room.roomId } },
        filename: "clip.mp4",
        mimeType: "video/mp4",
        contentBase64: b64("clip"),
      }),
    )
    const byMom = await runWithRpcCaller(memberCaller("mom"), () =>
      readFamilyAttachmentViaRuntime(d, { id: uploaded.id }),
    )
    expect(Buffer.from(byMom.contentBase64, "base64").toString("utf8")).toBe("clip")
    await expect(
      runWithRpcCaller(memberCaller("alex"), () =>
        readFamilyAttachmentViaRuntime(d, { id: uploaded.id }),
      ),
    ).rejects.toThrow(/forbidden/)
  })

  it("enforces the 25 MiB file cap", async () => {
    await ensureProfiles(["Dad", "Mom"])
    const big = Buffer.alloc(FAMILY_MEDIA_MAX_FILE_BYTES + 1, 7)
    await expect(
      runWithRpcCaller(memberCaller("dad"), () =>
        uploadFamilyAttachmentViaRuntime(deps(), {
          scope: { dm: { toProfileId: "mom" } },
          filename: "big.bin",
          mimeType: "application/octet-stream",
          contentBase64: big.toString("base64"),
        }),
      ),
    ).rejects.toThrow(/too-large/)
  })

  it("sliced roundtrip read: offset/maxBytes + truncated", async () => {
    await ensureProfiles(["Dad", "Mom"])
    const content = "abcdefghijklmnopqrstuvwxyz0123456789"
    const uploaded = await runWithRpcCaller(memberCaller("dad"), () =>
      uploadFamilyAttachmentViaRuntime(deps(), {
        scope: { dm: { toProfileId: "mom" } },
        filename: "data.txt",
        mimeType: "text/plain",
        contentBase64: b64(content),
      }),
    )
    const d = deps()
    // Whole read (file < 1 MiB default slice → not truncated).
    const whole = await runWithRpcCaller(memberCaller("mom"), () =>
      readFamilyAttachmentViaRuntime(d, { id: uploaded.id }),
    )
    expect(whole.sizeBytes).toBe(Buffer.byteLength(content))
    expect(whole.truncated).toBe(false)
    expect(Buffer.from(whole.contentBase64, "base64").toString("utf8")).toBe(content)

    // Sliced read mid-file.
    const slice = await runWithRpcCaller(memberCaller("mom"), () =>
      readFamilyAttachmentViaRuntime(d, { id: uploaded.id, offset: 5, maxBytes: 10 }),
    )
    expect(Buffer.from(slice.contentBase64, "base64").toString("utf8")).toBe("fghijklmno")
    expect(slice.truncated).toBe(true)

    // Tail read ends exactly at EOF → not truncated.
    const tail = await runWithRpcCaller(memberCaller("mom"), () =>
      readFamilyAttachmentViaRuntime(d, {
        id: uploaded.id,
        offset: content.length - 6,
        maxBytes: FAMILY_MEDIA_READ_DEFAULT_MAX_BYTES,
      }),
    )
    expect(Buffer.from(tail.contentBase64, "base64").toString("utf8")).toBe(content.slice(-6))
    expect(tail.truncated).toBe(false)

    // Offset past EOF → empty, not truncated.
    const past = await runWithRpcCaller(memberCaller("mom"), () =>
      readFamilyAttachmentViaRuntime(d, { id: uploaded.id, offset: 1000 }),
    )
    expect(past.contentBase64).toBe("")
    expect(past.truncated).toBe(false)

    // maxBytes larger than the slice cap is clamped to 1 MiB.
    const clamped = await runWithRpcCaller(memberCaller("mom"), () =>
      readFamilyAttachmentViaRuntime(d, { id: uploaded.id, maxBytes: 10 * 1024 * 1024 }),
    )
    expect(clamped.truncated).toBe(false)
    expect(Buffer.from(clamped.contentBase64, "base64").toString("utf8")).toBe(content)
  })
})

// ---------------------------------------------------------------
// NodeServiceImpl-level: message send carries attachment descriptors
// ---------------------------------------------------------------

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity()
  const device = generateDeviceIdentity()
  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send", "task.execute"],
    }),
  }
}

function mockMesh(): EnvoyMesh {
  return {
    peerId: "12D3KooWFamilyHome",
    multiaddrs: ["/ip4/127.0.0.1/tcp/4001"],
    getPeerConnectionInfo: () => ({ connected: false, direct: false }),
  } as unknown as EnvoyMesh
}

describe("EM-F1 via NodeServiceImpl", () => {
  let profileDir: string
  let svc: NodeServiceImpl
  let ownerProfile: NodeProfile

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-emf1-"))
    ownerProfile = testProfile()
    const trustStore = createLocalTrustStore(profileDir)
    const peerDirectory = createLocalPeerDirectoryStore(profileDir)
    const human = createHumanProfileStore(profileDir)
    await human.saveHumanProfile({
      version: "0.1",
      ownerId: ownerProfile.owner.ownerId,
      displayName: "Allen Peng",
      updatedAt: new Date().toISOString(),
      signature: "",
    } as any)
    svc = new NodeServiceImpl(
      mockMesh(),
      trustStore,
      peerDirectory,
      human,
      profileDir,
      ownerProfile,
    )
  })

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true }).catch(() => undefined)
  })

  async function createMember(name: string): Promise<string> {
    const created = await runWithRpcCaller(ownerCaller(), () =>
      svc.createFamilyProfile({ name }),
    )
    return created.profile.id
  }

  it("DM: message with attachments persists descriptors and is visible to the other profile", async () => {
    const dadId = await createMember("Dad")
    const momId = await createMember("Mom")

    // Dad uploads into the (dad,mom) DM pair and sends a message with it.
    const uploaded = await runWithRpcCaller(memberCaller(dadId), () =>
      svc.uploadFamilyAttachment({
        scope: { dm: { toProfileId: momId } },
        filename: "family.jpg",
        mimeType: "image/jpeg",
        contentBase64: b64("family-jpeg-bytes"),
      }),
    )
    const sent = await runWithRpcCaller(memberCaller(dadId), () =>
      svc.sendFamilyMessage({
        toProfileId: momId,
        text: "",
        attachments: [{ id: uploaded.id }],
      }),
    )
    expect(sent.threadKey).toBe(familyThreadKey(dadId, momId))

    // Sender history carries the descriptor.
    const dadHistory = await runWithRpcCaller(memberCaller(dadId), () =>
      svc.listChatHistory(sent.threadKey),
    )
    const fromDad = dadHistory.find((m) => m.messageId === sent.messageId)
    expect(fromDad?.content?.attachments?.[0]).toMatchObject({
      id: uploaded.id,
      filename: "family.jpg",
      mimeType: "image/jpeg",
      sizeBytes: Buffer.byteLength("family-jpeg-bytes"),
      sensitivity: "private",
    })

    // Recipient history carries the same descriptor; bytes stay readable there.
    const momHistory = await runWithRpcCaller(memberCaller(momId), () =>
      svc.listChatHistory(sent.threadKey),
    )
    const seen = momHistory.find((m) => m.messageId === sent.messageId)
    expect(seen?.content?.attachments?.[0]?.id).toBe(uploaded.id)
    const readBack = await runWithRpcCaller(memberCaller(momId), () =>
      svc.readFamilyAttachment({ id: uploaded.id }),
    )
    expect(Buffer.from(readBack.contentBase64, "base64").toString("utf8")).toBe(
      "family-jpeg-bytes",
    )
  })

  it("DM: owner may message a family member with an attachment", async () => {
    const dadId = await createMember("Dad")
    const uploaded = await runWithRpcCaller(ownerCaller(), () =>
      svc.uploadFamilyAttachment({
        scope: { dm: { toProfileId: dadId } },
        filename: "from-owner.txt",
        mimeType: "text/plain",
        contentBase64: b64("owner-note"),
      }),
    )
    const sent = await runWithRpcCaller(ownerCaller(), () =>
      svc.sendFamilyMessage({
        toProfileId: dadId,
        attachments: [{ id: uploaded.id }],
      }),
    )
    const dadHistory = await runWithRpcCaller(memberCaller(dadId), () =>
      svc.listChatHistory(sent.threadKey),
    )
    expect(dadHistory.find((m) => m.messageId === sent.messageId)?.content?.attachments?.[0]?.id).toBe(
      uploaded.id,
    )
  })

  it("DM: send rejects an attachment id from a different pair", async () => {
    const dadId = await createMember("Dad")
    const momId = await createMember("Mom")

    // Uploaded into (dad,mom) pair, but dad tries to send it to the owner.
    const uploaded = await runWithRpcCaller(memberCaller(dadId), () =>
      svc.uploadFamilyAttachment({
        scope: { dm: { toProfileId: momId } },
        filename: "cross.txt",
        mimeType: "text/plain",
        contentBase64: b64("cross"),
      }),
    )
    await expect(
      runWithRpcCaller(memberCaller(dadId), () =>
        svc.sendFamilyMessage({
          toProfileId: OWNER_FAMILY_PROFILE_ID,
          text: "look",
          attachments: [{ id: uploaded.id }],
        }),
      ),
    ).rejects.toThrow(/not-found/)
  })

  it("router dispatches uploadFamilyAttachment/readFamilyAttachment for a member (not owner-only)", async () => {
    const dadId = await createMember("Dad")
    const momId = await createMember("Mom")
    const uploaded = (await runWithRpcCaller(memberCaller(dadId), () =>
      routeRpcMethod(svc, "uploadFamilyAttachment", {
        scope: { dm: { toProfileId: momId } },
        filename: "route-test.bin",
        mimeType: "application/octet-stream",
        contentBase64: b64("route-bytes"),
      }),
    )) as { id: string }
    const read = (await runWithRpcCaller(memberCaller(momId), () =>
      routeRpcMethod(svc, "readFamilyAttachment", { id: uploaded.id }),
    )) as { contentBase64: string; sizeBytes: number; truncated: boolean }
    expect(Buffer.from(read.contentBase64, "base64").toString("utf8")).toBe("route-bytes")
    // text-only family message still routes (back-compat of the extended params).
    const sent = await runWithRpcCaller(memberCaller(dadId), () =>
      routeRpcMethod(svc, "sendFamilyMessage", { toProfileId: momId, text: "hi" }),
    )
    expect((sent as { threadKey: string }).threadKey).toBe(familyThreadKey(dadId, momId))
  })

  it("room: member sends message with attachment; another member sees descriptors", async () => {
    const dadId = await createMember("Dad")
    const momId = await createMember("Mom")
    const room = await runWithRpcCaller(ownerCaller(), () =>
      svc.createFamilyRoom({
        title: "Kitchen",
        memberProfileIds: [dadId, momId],
      }),
    )
    const roomId = room.room.roomId
    const uploaded = await runWithRpcCaller(memberCaller(dadId), () =>
      svc.uploadFamilyAttachment({
        scope: { room: { roomId } },
        filename: "recipe.pdf",
        mimeType: "application/pdf",
        contentBase64: b64("%PDF-recipe"),
      }),
    )
    const sent = await runWithRpcCaller(memberCaller(dadId), () =>
      svc.sendFamilyRoomMessage({
        roomId,
        attachments: [{ id: uploaded.id }],
      }),
    )
    expect(sent.threadKey).toBe(`room:${roomId}`)

    const momHistory = await runWithRpcCaller(memberCaller(momId), () =>
      svc.listChatHistory(`room:${roomId}`),
    )
    const msg = momHistory.find((m) => m.messageId === sent.messageId)
    expect(msg?.content?.attachments?.[0]).toMatchObject({
      id: uploaded.id,
      filename: "recipe.pdf",
      mimeType: "application/pdf",
      sensitivity: "private",
    })
    const readBack = await runWithRpcCaller(memberCaller(momId), () =>
      svc.readFamilyAttachment({ id: uploaded.id }),
    )
    expect(Buffer.from(readBack.contentBase64, "base64").toString("utf8")).toBe("%PDF-recipe")
  })
})
