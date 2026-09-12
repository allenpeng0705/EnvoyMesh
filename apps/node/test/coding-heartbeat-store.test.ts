import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { CodingHeartbeatStore } from "../src/coding-heartbeat-store.js"
import { isCronMatch } from "../src/trigger-store.js"

describe("CodingHeartbeatStore", () => {
  const dirs: string[] = []

  afterEach(async () => {
    // tmp dirs left for OS cleanup; no need to rm for unit tests
    dirs.length = 0
  })

  async function freshStore(): Promise<CodingHeartbeatStore> {
    const dir = await mkdtemp(join(tmpdir(), "coding-hb-"))
    dirs.push(dir)
    const store = new CodingHeartbeatStore()
    await store.init(dir)
    return store
  }

  it("fires when cron matches and skips disabled", async () => {
    const store = await freshStore()
    const enabled = await store.create({
      name: "wake",
      cron: "* * * * *",
      prompt: "check status",
      target: { kind: "eh", chatId: "chat-1" },
      enabled: true,
    })
    await store.create({
      name: "paused",
      cron: "* * * * *",
      prompt: "noop",
      target: { kind: "eh", chatId: "chat-2" },
      enabled: false,
    })

    const now = new Date(Date.UTC(2026, 8, 11, 12, 30, 5))
    expect(isCronMatch("* * * * *", now)).toBe(true)
    const due = store.selectDue(now)
    expect(due.map((h) => h.id)).toEqual([enabled.id])
  })

  it("skips same UTC minute after lastFiredAt", async () => {
    const store = await freshStore()
    const hb = await store.create({
      name: "once",
      cron: "* * * * *",
      prompt: "hi",
      target: { kind: "pi", sessionId: "pi-1" },
    })
    const now = new Date(Date.UTC(2026, 8, 11, 12, 30, 10))
    await store.recordFire(hb.id, { firedAt: now.toISOString() })
    expect(store.selectDue(now)).toEqual([])
    const nextMinute = new Date(Date.UTC(2026, 8, 11, 12, 31, 0))
    expect(store.selectDue(nextMinute).map((h) => h.id)).toEqual([hb.id])
  })

  it("honors maxRuns and disables when reached", async () => {
    const store = await freshStore()
    const hb = await store.create({
      name: "limited",
      cron: "* * * * *",
      prompt: "go",
      target: { kind: "ext", sessionId: "s1", agentId: "codex" },
      maxRuns: 2,
    })
    const t1 = new Date(Date.UTC(2026, 8, 11, 12, 0, 0))
    expect(store.selectDue(t1).map((h) => h.id)).toEqual([hb.id])
    await store.recordFire(hb.id, { firedAt: t1.toISOString() })
    const after1 = store.get(hb.id)!
    expect(after1.runCount).toBe(1)
    expect(after1.enabled).toBe(true)

    const t2 = new Date(Date.UTC(2026, 8, 11, 12, 1, 0))
    expect(store.selectDue(t2).map((h) => h.id)).toEqual([hb.id])
    await store.recordFire(hb.id, { firedAt: t2.toISOString() })
    const after2 = store.get(hb.id)!
    expect(after2.runCount).toBe(2)
    expect(after2.enabled).toBe(false)
    expect(store.selectDue(new Date(Date.UTC(2026, 8, 11, 12, 2, 0)))).toEqual(
      [],
    )
  })

  it("persists atomically and reloads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "coding-hb-"))
    const store = new CodingHeartbeatStore()
    await store.init(dir)
    const hb = await store.create({
      name: "persist",
      cron: "*/5 * * * *",
      prompt: "tick",
      target: { kind: "eh", chatId: "c" },
    })
    const raw = await readFile(join(dir, "coding-heartbeats.json"), "utf8")
    expect(raw).toContain(hb.id)

    const store2 = new CodingHeartbeatStore()
    await store2.init(dir)
    expect(store2.list()).toHaveLength(1)
    expect(store2.get(hb.id)?.name).toBe("persist")
  })

  it("matches */5 cron steps via isCronMatch", () => {
    const on = new Date(Date.UTC(2026, 8, 11, 12, 10, 0))
    const off = new Date(Date.UTC(2026, 8, 11, 12, 11, 0))
    expect(isCronMatch("*/5 * * * *", on)).toBe(true)
    expect(isCronMatch("*/5 * * * *", off)).toBe(false)
  })
})
