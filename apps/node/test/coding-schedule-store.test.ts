import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { CodingScheduleStore } from "../src/coding-schedule-store.js"
import { isCronMatch } from "../src/trigger-store.js"

describe("CodingScheduleStore", () => {
  const dirs: string[] = []

  afterEach(() => {
    dirs.length = 0
  })

  async function freshStore(): Promise<CodingScheduleStore> {
    const dir = await mkdtemp(join(tmpdir(), "coding-sched-"))
    dirs.push(dir)
    const store = new CodingScheduleStore()
    await store.init(dir)
    return store
  }

  it("fires when cron matches and skips disabled", async () => {
    const store = await freshStore()
    const enabled = await store.create({
      name: "nightly",
      cron: "* * * * *",
      prompt: "run checks",
      cwd: "/projects/app",
      harness: "envoy-harness",
      enabled: true,
    })
    await store.create({
      name: "paused",
      cron: "* * * * *",
      prompt: "noop",
      cwd: "/projects/app",
      harness: "pi",
      enabled: false,
    })

    const now = new Date(Date.UTC(2026, 8, 11, 12, 30, 5))
    expect(isCronMatch("* * * * *", now)).toBe(true)
    const due = store.selectDue(now)
    expect(due.map((s) => s.id)).toEqual([enabled.id])
  })

  it("skips same UTC minute after lastFiredAt", async () => {
    const store = await freshStore()
    const row = await store.create({
      name: "once",
      cron: "* * * * *",
      prompt: "hi",
      cwd: "/tmp/proj",
      harness: "codex",
    })
    const now = new Date(Date.UTC(2026, 8, 11, 12, 30, 10))
    await store.recordFire(row.id, {
      firedAt: now.toISOString(),
      lastWorkspaceId: "ws-1",
    })
    expect(store.get(row.id)?.lastWorkspaceId).toBe("ws-1")
    expect(store.selectDue(now)).toEqual([])
    const nextMinute = new Date(Date.UTC(2026, 8, 11, 12, 31, 0))
    expect(store.selectDue(nextMinute).map((s) => s.id)).toEqual([row.id])
  })

  it("honors maxRuns and disables when reached", async () => {
    const store = await freshStore()
    const row = await store.create({
      name: "limited",
      cron: "* * * * *",
      prompt: "go",
      cwd: "/x",
      harness: "pi",
      maxRuns: 2,
    })
    const t1 = new Date(Date.UTC(2026, 8, 11, 12, 0, 0))
    expect(store.selectDue(t1).map((s) => s.id)).toEqual([row.id])
    await store.recordFire(row.id, { firedAt: t1.toISOString() })
    expect(store.get(row.id)?.runCount).toBe(1)
    expect(store.get(row.id)?.enabled).toBe(true)

    const t2 = new Date(Date.UTC(2026, 8, 11, 12, 1, 0))
    await store.recordFire(row.id, { firedAt: t2.toISOString() })
    expect(store.get(row.id)?.runCount).toBe(2)
    expect(store.get(row.id)?.enabled).toBe(false)
    expect(store.selectDue(new Date(Date.UTC(2026, 8, 11, 12, 2, 0)))).toEqual(
      [],
    )
  })

  it("persists atomically and reloads", async () => {
    const dir = await mkdtemp(join(tmpdir(), "coding-sched-"))
    const store = new CodingScheduleStore()
    await store.init(dir)
    const row = await store.create({
      name: "persist",
      cron: "*/5 * * * *",
      prompt: "tick",
      cwd: "/home/me/app",
      harness: "envoy-harness",
    })
    const raw = await readFile(join(dir, "coding-schedules.json"), "utf8")
    expect(raw).toContain(row.id)
    expect(raw).toContain("/home/me/app")

    const store2 = new CodingScheduleStore()
    await store2.init(dir)
    expect(store2.list()).toHaveLength(1)
    expect(store2.get(row.id)?.name).toBe("persist")
  })

  it("rejects invalid harness and empty cwd", async () => {
    const store = await freshStore()
    await expect(
      store.create({
        name: "bad",
        cron: "* * * * *",
        prompt: "x",
        cwd: "  ",
        harness: "envoy-harness",
      }),
    ).rejects.toThrow("coding_schedule_cwd_required")
    await expect(
      store.create({
        name: "bad",
        cron: "* * * * *",
        prompt: "x",
        cwd: "/ok",
        // @ts-expect-error intentional invalid
        harness: "nope",
      }),
    ).rejects.toThrow("coding_schedule_harness_invalid")
  })
})
