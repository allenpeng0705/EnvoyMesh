/**
 * Family network E2E — multi-profile isolation on a single home node.
 *
 * Covers:
 *   - previewFamilyInvite lists existing non-owner names
 *   - pairThinClient create + re-bind to same profile (second phone)
 *   - family DM thread key shared by both participants
 *   - EnvoyAI history scoped per profile (`__envoy_ai__:<id>`)
 */
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  ENVOY_AI_THREAD_KEY,
  envoyAiThreadKeyForProfile,
  familyThreadKey,
  OWNER_FAMILY_PROFILE_ID,
} from "@envoymesh/api"
import {
  createHumanProfileStore,
  createLocalChatLogStore,
  createLocalPeerDirectoryStore,
  createLocalTaskStore,
  createLocalTrustStore,
  type NodeProfile,
} from "@envoymesh/local-store"
import { generateDeviceIdentity, generateOwnerIdentity, createDeviceCertificate } from "@envoymesh/identity"
import type { EnvoyMesh } from "@envoymesh/network"
import { NodeServiceImpl } from "../src/node-service-impl.js"
import { localOwnerCaller, runWithRpcCaller } from "../src/rpc-caller-context.js"
import { persistEnvoyAiChatExchangeViaRuntime } from "../src/node-service-openclaw-runtime.js"

function testProfile(ownerIdHint = "allen"): NodeProfile {
  const owner = generateOwnerIdentity()
  // Override display for readable assertions when HumanProfile is empty.
  void ownerIdHint
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

describe("Family network E2E (multi-profile)", () => {
  let profileDir: string
  let svc: NodeServiceImpl
  let ownerProfile: NodeProfile

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-family-e2e-"))
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
    svc.bindCliTaskStore(createLocalTaskStore(profileDir))
    svc.setWsListenAddress(3030, "/ws")
  })

  afterEach(async () => {
    await rm(profileDir, { recursive: true, force: true })
  })

  async function mintFamilyInvite() {
    return runWithRpcCaller(localOwnerCaller(ownerProfile.owner.ownerId), () =>
      svc.generateFamilyInviteToken({ expiresInHours: 72, note: "e2e" }),
    )
  }

  it("previewFamilyInvite lists non-owner profile names and excludes owner", async () => {
    await runWithRpcCaller(localOwnerCaller(ownerProfile.owner.ownerId), () =>
      svc.createFamilyProfile({ name: "Dad", avatarColor: "#0d9488" }),
    )
    await runWithRpcCaller(localOwnerCaller(ownerProfile.owner.ownerId), () =>
      svc.createFamilyProfile({ name: "Mom", avatarColor: "#7c3aed" }),
    )

    const invite = await mintFamilyInvite()
    const preview = await svc.previewFamilyInvite({ pairingToken: invite.token })

    expect(preview.profiles.map((p) => p.name).sort()).toEqual(["Dad", "Mom"])
    expect(preview.profiles.every((p) => p.id !== OWNER_FAMILY_PROFILE_ID)).toBe(true)
    expect(preview.profiles.every((p) => p.active)).toBe(true)
  })

  it("pairThinClient: create Dad, then second phone re-binds same profile by id", async () => {
    const invite1 = await mintFamilyInvite()
    const phone1 = await svc.pairThinClient({
      pairingToken: invite1.token,
      deviceName: "Dad Phone 1",
      platform: "flutter",
      deviceId: "dad-phone-aaaa-bbbb",
      profileName: "Dad",
      profileAvatarColor: "#0d9488",
    })
    expect(phone1.isOwnerProfile).toBe(false)
    expect(phone1.profileId).toBe("dad")
    expect(phone1.familyProfiles?.some((p) => p.name === "Dad")).toBe(true)

    // Fresh invite for the second device (family invites are single-use per device).
    const invite2 = await mintFamilyInvite()
    const phone2 = await svc.pairThinClient({
      pairingToken: invite2.token,
      deviceName: "Dad Phone 2",
      platform: "flutter",
      deviceId: "dad-phone-cccc-dddd",
      profileId: phone1.profileId,
    })
    expect(phone2.profileId).toBe(phone1.profileId)
    expect(phone2.isOwnerProfile).toBe(false)
    expect(phone2.sessionToken).not.toBe(phone1.sessionToken)

    const preview = await svc.previewFamilyInvite({
      pairingToken: (await mintFamilyInvite()).token,
    })
    expect(preview.profiles.filter((p) => p.id === "dad")).toHaveLength(1)
    expect(preview.profiles.find((p) => p.id === "dad")?.name).toBe("Dad")
  })

  it("family DM + EnvoyAI histories stay isolated across owner and Dad", async () => {
    const invite = await mintFamilyInvite()
    const dadPair = await svc.pairThinClient({
      pairingToken: invite.token,
      deviceName: "Dad Phone",
      platform: "flutter",
      deviceId: "dad-device-1111-2222",
      profileName: "Dad",
    })
    const dadId = dadPair.profileId

    // Owner → Dad family DM
    const dm = await runWithRpcCaller(localOwnerCaller(ownerProfile.owner.ownerId), () =>
      svc.sendFamilyMessage({ toProfileId: dadId, text: "Hey Dad" }),
    )
    expect(dm.threadKey).toBe(familyThreadKey(OWNER_FAMILY_PROFILE_ID, dadId))

    const ownerHistory = await runWithRpcCaller(
      localOwnerCaller(ownerProfile.owner.ownerId),
      () => svc.listChatHistory(dm.threadKey),
    )
    const dadHistory = await runWithRpcCaller(
      {
        ownerId: ownerProfile.owner.ownerId,
        profileId: dadId,
        isOwnerProfile: false,
        source: "session",
      },
      () => svc.listChatHistory(dm.threadKey),
    )
    expect(ownerHistory.some((m) => m.content?.text === "Hey Dad")).toBe(true)
    expect(dadHistory.some((m) => m.content?.text === "Hey Dad")).toBe(true)

    // Persist separate EnvoyAI exchanges under each profile's thread key.
    const chatLog = createLocalChatLogStore(profileDir)
    // Wire the same store NodeService uses by persisting via runtime deps.
    const ownerKey = envoyAiThreadKeyForProfile(OWNER_FAMILY_PROFILE_ID)
    const dadKey = envoyAiThreadKeyForProfile(dadId)

    await runWithRpcCaller(localOwnerCaller(ownerProfile.owner.ownerId), async () => {
      const deps = (svc as any)._openClawRuntimeDeps()
      await persistEnvoyAiChatExchangeViaRuntime(
        deps,
        "owner question",
        {
          answer: "早上好，Allen Peng。",
          domain: "knowledge",
          intent: "knowledge",
          toolsUsed: [],
          approvalItems: [],
          modelUsed: "openclaw",
        } as any,
        undefined,
        ownerKey,
      )
    })

    await runWithRpcCaller(
      {
        ownerId: ownerProfile.owner.ownerId,
        profileId: dadId,
        isOwnerProfile: false,
        source: "session",
      },
      async () => {
        const deps = (svc as any)._openClawRuntimeDeps()
        await persistEnvoyAiChatExchangeViaRuntime(
          deps,
          "dad question",
          {
            answer: "早上好，Dad。",
            domain: "knowledge",
            intent: "knowledge",
            toolsUsed: [],
            approvalItems: [],
            modelUsed: "openclaw",
          } as any,
          undefined,
          dadKey,
        )
      },
    )

    // _persistChatMessage appends asynchronously — wait for both exchanges.
    await new Promise((r) => setTimeout(r, 100))

    const ownerAi = await runWithRpcCaller(localOwnerCaller(ownerProfile.owner.ownerId), () =>
      svc.listChatHistory("envoyai"),
    )
    const dadAi = await runWithRpcCaller(
      {
        ownerId: ownerProfile.owner.ownerId,
        profileId: dadId,
        isOwnerProfile: false,
        source: "session",
      },
      () => svc.listChatHistory("envoyai"),
    )

    const ownerTexts = ownerAi.map((m) => m.content?.text ?? "")
    const dadTexts = dadAi.map((m) => m.content?.text ?? "")

    expect(ownerTexts).toContain("owner question")
    expect(ownerTexts).toContain("早上好，Allen Peng。")
    expect(ownerTexts).not.toContain("dad question")

    expect(dadTexts).toContain("dad question")
    expect(dadTexts).toContain("早上好，Dad。")
    expect(dadTexts).not.toContain("owner question")

    // Cross-check raw keys never bleed into the bare legacy thread for dad.
    const bare = await chatLog.listThread(ENVOY_AI_THREAD_KEY)
    expect(bare.every((m) => m.content?.text !== "dad question")).toBe(true)
  })
})
