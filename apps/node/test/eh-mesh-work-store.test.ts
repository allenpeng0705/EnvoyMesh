import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { describe, expect, it, afterEach } from "vitest"

import { EhMeshWorkStore } from "../src/eh-mesh-work-store.js"

describe("EhMeshWorkStore (FH-P2-C)", () => {
  let dir = ""

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true })
    dir = ""
  })

  it("enqueues and dismisses work items", async () => {
    dir = await mkdtemp(join(tmpdir(), "eh-mesh-work-"))
    const store = new EhMeshWorkStore()
    await store.init(dir)
    const row = await store.enqueue({
      prompt: "Run tests",
      cwd: "/tmp/p",
      source: "owner",
    })
    expect(row.status).toBe("pending")
    expect(store.list()).toHaveLength(1)
    await store.dismiss(row.id)
    expect(store.list()).toHaveLength(0)
  })

  it("upserts bond-sourced work items idempotently", async () => {
    dir = await mkdtemp(join(tmpdir(), "eh-mesh-work-"))
    const store = new EhMeshWorkStore()
    await store.init(dir)
    const first = await store.upsertFromBondRef({
      workId: "w-bond-1",
      prompt: "Fix lint",
      cwd: "/tmp/p",
      fromOwnerId: "envoy:owner:friend",
      title: "Lint pass",
    })
    expect(first.source).toBe("bond")
    const again = await store.upsertFromBondRef({
      workId: "w-bond-1",
      prompt: "Fix lint",
      cwd: "/tmp/p",
      fromOwnerId: "envoy:owner:friend",
    })
    expect(again.id).toBe(first.id)
    expect(store.list()).toHaveLength(1)
  })

  it("prunes old dismissed items while retaining a short tail", async () => {
    dir = await mkdtemp(join(tmpdir(), "eh-mesh-work-"))
    const store = new EhMeshWorkStore()
    await store.init(dir)
    for (let i = 0; i < 20; i++) {
      const row = await store.enqueue({
        prompt: `p-${i}`,
        cwd: "/tmp/p",
        source: "owner",
      })
      await store.dismiss(row.id)
    }
    expect(store.list()).toHaveLength(0)
    const raw = await import("node:fs/promises").then((fs) =>
      fs.readFile(join(dir, "eh-mesh-work.json"), "utf8"),
    )
    const parsed = JSON.parse(raw) as { items: unknown[] }
    expect(parsed.items.length).toBeLessThanOrEqual(16)
  })

  it("reclaims orphaned running rows on init and recoverOrphanedRunning", async () => {
    dir = await mkdtemp(join(tmpdir(), "eh-mesh-work-"))
    const store = new EhMeshWorkStore()
    await store.init(dir)
    const row = await store.enqueue({
      prompt: "long turn",
      cwd: "/tmp/p",
      source: "owner",
    })
    await store.setStatus(row.id, "running", { chatId: "chat-1" })
    expect(store.get(row.id)?.status).toBe("running")

    const reloaded = new EhMeshWorkStore()
    await reloaded.init(dir)
    expect(reloaded.get(row.id)?.status).toBe("pending")
    expect(reloaded.get(row.id)?.lastError).toBe("eh_mesh_work_interrupted")

    await reloaded.setStatus(row.id, "running")
    const live = new Set([row.id])
    expect(await reloaded.recoverOrphanedRunning(live)).toBe(0)
    expect(reloaded.get(row.id)?.status).toBe("running")
    expect(await reloaded.recoverOrphanedRunning(new Set())).toBe(1)
    expect(reloaded.get(row.id)?.status).toBe("pending")
  })
})