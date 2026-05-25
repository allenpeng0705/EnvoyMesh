import { mkdir, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createSqliteVectorStore } from "../src/sqlite-vector-store.js";
import { mockEmbedding } from "../src/embedding-provider.js";

let workspaceDir: string;

beforeEach(async () => {
  workspaceDir = join(tmpdir(), `envoymesh-sqlite-rag-${randomUUID()}`);
  await mkdir(workspaceDir, { recursive: true });
});

afterEach(async () => {
  await rm(workspaceDir, { recursive: true, force: true });
});

describe("createSqliteVectorStore", () => {
  it("persists vectors and searches with HNSW ANN", async () => {
    const store = await createSqliteVectorStore({
      profileDir: workspaceDir,
      modelKey: "mock:test",
    });

    await store.upsert([
      {
        id: "chat:owner:a:1",
        collection: "chat:envoy:owner:a",
        sourceKey: "1",
        textPreview: "EnvoyMesh relay deployment",
        vector: mockEmbedding("EnvoyMesh relay deployment"),
      },
      {
        id: "chat:owner:a:2",
        collection: "chat:envoy:owner:a",
        sourceKey: "2",
        textPreview: "weather is sunny",
        vector: mockEmbedding("weather is sunny"),
      },
    ]);
    await store.flush();

    const hits = store.search(
      "chat:envoy:owner:a",
      mockEmbedding("relay deployment EnvoyMesh"),
      2,
    );
    expect(hits[0]?.sourceKey).toBe("1");
  });
});
