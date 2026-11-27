import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createContextMemoryRuntime, openClawMemoryMdPath } from "../src/context-memory-runtime.js";

describe("context-memory-runtime native", () => {
  const dirs: string[] = [];
  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
  });

  it("off until enabled; ready after native open; recall/remember", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-rt-"));
    dirs.push(profile);
    let settings = { enabled: false, backend: "native" as const };
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => settings,
    });
    await rt.applySettings(settings);
    expect(rt.status()).toBe("off");
    expect(await rt.recallForTurn("dark")).toBe("");

    settings = { enabled: true, backend: "native" };
    await rt.applySettings(settings);
    expect(rt.status()).toBe("ready");
    await rt.rememberFromTurn({ userText: "I prefer dark mode in the editor" });
    const section = await rt.recallForTurn("dark mode preference");
    expect(section).toMatch(/dark mode/i);
  });

  it("disable clears ready state", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-rt-off-"));
    dirs.push(profile);
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "native" }),
    });
    await rt.applySettings({ enabled: true, backend: "native" });
    expect(rt.status()).toBe("ready");
    await rt.applySettings({ enabled: false, backend: "native" });
    expect(rt.status()).toBe("off");
    expect(rt.snapshot().enabled).toBe(false);
    expect(await rt.recallForTurn("anything")).toBe("");
  });

  it("namespace switch uses isolated banks", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-rt-ns-"));
    dirs.push(profile);
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "native" }),
    });
    await rt.applySettings({ enabled: true, backend: "native" });
    await rt.rememberFromTurn({ userText: "I prefer personal woodworking hobbies" });
    await rt.applySettings({ enabled: true, backend: "native", namespace: "work" });
    expect(await rt.recallForTurn("woodworking")).toBe("");
    await rt.rememberFromTurn({ userText: "I prefer Kubernetes for work deploys" });
    const workHit = await rt.recallForTurn("Kubernetes work");
    expect(workHit).toMatch(/Kubernetes/i);
    await rt.applySettings({ enabled: true, backend: "native" });
    expect(await rt.recallForTurn("woodworking")).toMatch(/woodworking/i);
  });

  it("MEMORY.md seed is one-shot per namespace", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-rt-seed-"));
    dirs.push(profile);
    const mdPath = openClawMemoryMdPath(profile);
    await mkdir(join(profile, "openclaw-workspace"), { recursive: true });
    await writeFile(mdPath, "- Prefer concise answers always\n- Another durable seed line here\n", "utf8");

    const persisted: Array<Record<string, unknown>> = [];
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "native" }),
      patchSettings: async (partial) => {
        persisted.push({ ...partial });
      },
    });
    await rt.applySettings({ enabled: true, backend: "native" });
    const first = await rt.maybeSeedMemoryMd(mdPath);
    expect(first.seeded).toBe(true);
    expect(first.count).toBeGreaterThan(0);
    expect(persisted.some((p) => typeof p.memorySeededAt === "string")).toBe(true);

    // Simulate settings after seed persist
    const seededAt = String(persisted[0]!.memorySeededAt);
    await rt.applySettings({
      enabled: true,
      backend: "native",
      memorySeededAt: seededAt,
      memorySeededAtByNamespace: { default: seededAt },
    });
    const second = await rt.maybeSeedMemoryMd(mdPath);
    expect(second.seeded).toBe(false);

    await rt.applySettings({ enabled: true, backend: "native", namespace: "work" });
    const workSeed = await rt.maybeSeedMemoryMd(mdPath);
    expect(workSeed.seeded).toBe(true);
  });

  it("list/forget/pin on native facts", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-rt-crud-"));
    dirs.push(profile);
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({ enabled: true, backend: "native" }),
    });
    await rt.applySettings({ enabled: true, backend: "native" });
    await rt.rememberFromTurn({ userText: "Remember that my name is Casey" });
    const facts = await rt.listFacts();
    expect(facts.length).toBeGreaterThan(0);
    const id = facts[0]!.id;
    expect(await rt.pin(id, true)).toBe(true);
    expect(await rt.forget(id)).toBe(true);
    expect(await rt.listFacts()).toEqual([]);
  });

  it("openviking unreachable → error (not ready)", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-ov-"));
    dirs.push(profile);
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => ({
        enabled: true,
        backend: "openviking",
        endpoint: "http://127.0.0.1:1",
      }),
    });
    await rt.applySettings({
      enabled: true,
      backend: "openviking",
      endpoint: "http://127.0.0.1:1",
    });
    expect(rt.status()).toBe("error");
    expect(rt.status()).not.toBe("installing");
    expect(await rt.recallForTurn("x")).toBe("");
    expect(rt.snapshot().summary).toMatch(/usual memory path/i);
  });

  it("openviking BYO ready reuses session across applySettings", async () => {
    const profile = await mkdtemp(join(tmpdir(), "cm-ov-ready-"));
    dirs.push(profile);
    let sessionCreates = 0;
    const ovFetch = async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith("/ready") || u.endsWith("/health")) {
        return new Response(JSON.stringify({ ready: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.endsWith("/api/v1/sessions") && init?.method === "POST") {
        sessionCreates++;
        return new Response(JSON.stringify({ result: { session_id: "keep-me" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("/messages") || u.includes("/commit")) {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("/search/search")) {
        return new Response(JSON.stringify({ result: { context: "ov-ctx" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.includes("/search/find")) {
        return new Response(
          JSON.stringify({ result: { memories: [{ uri: "viking://f1", abstract: "Fact one" }] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("{}", { status: 404 });
    };
    const settings = {
      enabled: true,
      backend: "openviking" as const,
      endpoint: "http://ov.test",
    };
    const rt = createContextMemoryRuntime({
      profileDir: profile,
      getSettings: () => settings,
      ovFetch: ovFetch as typeof fetch,
    });
    await rt.applySettings(settings);
    expect(rt.status()).toBe("ready");
    expect(rt.status()).not.toBe("installing");
    await rt.rememberFromTurn({ userText: "hello", assistantText: "hi" });
    expect(sessionCreates).toBe(1);
    await rt.applySettings(settings);
    expect(rt.status()).toBe("ready");
    await rt.rememberFromTurn({ userText: "again" });
    expect(sessionCreates).toBe(1);
    expect(await rt.recallForTurn("theme")).toMatch(/ov-ctx/);
    const facts = await rt.listFacts();
    expect(facts[0]?.id).toBe("viking://f1");
    expect(await rt.pin(facts[0]!.id, true)).toBe(false);
  });
});
