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
})