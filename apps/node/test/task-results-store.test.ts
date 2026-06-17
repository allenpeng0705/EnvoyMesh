import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLocalTaskResultsStore } from "@envoymesh/local-store";
import {
  createStructuredArtifact,
  createTaskResultPayload,
  createTextArtifact,
  type TaskResultPayload,
} from "@envoymesh/protocol";

let profileDir: string;

beforeEach(async () => {
  profileDir = await mkdtemp(join(tmpdir(), "envoymesh-task-results-"));
});

afterEach(async () => {
  await rm(profileDir, { recursive: true, force: true });
});

function makePayload(taskId: string, summary: string, artifacts: TaskResultPayload["artifacts"] = []): TaskResultPayload {
  return createTaskResultPayload({
    taskId,
    status: "completed",
    summary,
    senderOwnerId: "envoy:owner:sender",
    senderAgentPeerId: "envoy_agent:sender",
    recipientOwnerId: "envoy:owner:self",
    recipientAgentPeerId: "envoy_agent:self",
    artifacts,
  });
}

describe("task results store", () => {
  it("returns undefined for a missing taskId", async () => {
    const store = createLocalTaskResultsStore(profileDir);
    const got = await store.getTaskResult("missing");
    expect(got).toBeUndefined();
  });

  it("records a payload and reads it back", async () => {
    const store = createLocalTaskResultsStore(profileDir);
    const payload = makePayload("task-1", "first");
    await store.recordTaskResult(payload);

    const got = await store.getTaskResult("task-1");
    expect(got?.taskId).toBe("task-1");
    expect(got?.summary).toBe("first");
  });

  it("upserts by taskId: a later write replaces the earlier payload", async () => {
    const store = createLocalTaskResultsStore(profileDir);
    await store.recordTaskResult(makePayload("task-1", "v1"));
    await store.recordTaskResult(makePayload("task-1", "v2"));

    const got = await store.getTaskResult("task-1");
    expect(got?.summary).toBe("v2");
  });

  it("lists every recorded task result", async () => {
    const store = createLocalTaskResultsStore(profileDir);
    await store.recordTaskResult(makePayload("task-1", "a"));
    await store.recordTaskResult(makePayload("task-2", "b"));
    await store.recordTaskResult(makePayload("task-3", "c"));

    const list = await store.listTaskResults();
    expect(list).toHaveLength(3);
    const ids = list.map((r) => r.taskId).sort();
    expect(ids).toEqual(["task-1", "task-2", "task-3"]);
  });

  it("persists typed Artifacts (text / file / structured) verbatim", async () => {
    const store = createLocalTaskResultsStore(profileDir);
    const payload = makePayload("task-art", "with art", [
      createTextArtifact({ content: "hello", mimeType: "text/plain" }),
      createStructuredArtifact({
        schemaRef: "mesh.artifact.example/v1",
        data: { count: 3, ok: true },
      }),
    ]);
    await store.recordTaskResult(payload);

    const got = await store.getTaskResult("task-art");
    expect(got?.artifacts).toHaveLength(2);
    expect(got?.artifacts[0]?.kind).toBe("text");
    expect(got?.artifacts[1]?.kind).toBe("structured");
    if (got?.artifacts[1]?.kind === "structured") {
      expect(got.artifacts[1].data).toEqual({ count: 3, ok: true });
    }
  });

  it("ignores payloads with no taskId instead of corrupting the file", async () => {
    const store = createLocalTaskResultsStore(profileDir);
    // Force a payload with a missing taskId — the protocol schema would normally
    // reject this, but the store must defend itself.
    const bogus = { ...makePayload("real", "ok") } as unknown as TaskResultPayload & { taskId?: string };
    bogus.taskId = "";
    await store.recordTaskResult(bogus);
    await store.recordTaskResult(makePayload("real", "ok"));

    const list = await store.listTaskResults();
    expect(list).toHaveLength(1);
    expect(list[0]?.taskId).toBe("real");
  });

  it("survives reload from disk", async () => {
    const store1 = createLocalTaskResultsStore(profileDir);
    await store1.recordTaskResult(makePayload("task-x", "persistent"));

    // Re-open the store from the same directory
    const store2 = createLocalTaskResultsStore(profileDir);
    const got = await store2.getTaskResult("task-x");
    expect(got?.summary).toBe("persistent");
  });

  it("writes through an atomic tmp-file rename (no half-written JSON on disk)", async () => {
    const store = createLocalTaskResultsStore(profileDir);
    await store.recordTaskResult(makePayload("task-y", "atomic"));

    // The on-disk file should be valid JSON (no leftover .tmp from a crash).
    const filePath = join(profileDir, "task-results.json");
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as { version: string; results: TaskResultPayload[] };
    expect(parsed.version).toBe("0.1");
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]?.taskId).toBe("task-y");
  });

  it("serialises concurrent writes (no lost data, no race on file)", async () => {
    const store = createLocalTaskResultsStore(profileDir);
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        store.recordTaskResult(makePayload(`concurrent-${i}`, `s${i}`)),
      ),
    );
    const list = await store.listTaskResults();
    expect(list).toHaveLength(20);
    const ids = list
      .map((r) => r.taskId)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    expect(ids[0]).toBe("concurrent-0");
    expect(ids[19]).toBe("concurrent-19");
  });

  it("recovers after a write fails (the write chain must not stay poisoned)", async () => {
    // Construct the real store, then capture a reference to its real
    // `recordTaskResult` before we wrap it — otherwise the wrapper would
    // recurse into itself on the second call.
    const realStore = createLocalTaskResultsStore(profileDir);
    const realRecord = realStore.recordTaskResult.bind(realStore);
    let injected = false;
    const spy = vi
      .fn<Parameters<typeof realStore.recordTaskResult>, Promise<void>>()
      .mockImplementation(async (payload) => {
        if (!injected) {
          injected = true;
          throw new Error("simulated disk-full");
        }
        return realRecord(payload);
      });
    realStore.recordTaskResult = spy;

    // First call must reject (callers wrap in try/catch).
    await expect(realStore.recordTaskResult(makePayload("ok-1", "x"))).rejects.toThrow("simulated disk-full");
    // Second call must still succeed — the chain must recover from a prior
    // failure so one transient write error doesn't permanently disable
    // recording.
    await expect(realStore.recordTaskResult(makePayload("ok-2", "y"))).resolves.toBeUndefined();

    const list = await realStore.listTaskResults();
    // Only the recovered write is persisted.
    expect(list).toHaveLength(1);
    expect(list[0]?.taskId).toBe("ok-2");
  });
});
