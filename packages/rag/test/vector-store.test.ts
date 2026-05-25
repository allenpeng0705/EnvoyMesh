import { describe, expect, it } from "vitest";
import { createMemoryVectorStore } from "../src/vector-store.js";
import { mockEmbedding } from "../src/embedding-provider.js";

describe("vector-store", () => {
  it("searches within a collection", () => {
    const store = createMemoryVectorStore("mock:test", [
      {
        id: "chat:owner:msg-1",
        collection: "chat:envoy:owner:alice",
        sourceKey: "msg-1",
        textPreview: "EnvoyMesh relay deployment plan",
        vector: mockEmbedding("EnvoyMesh relay deployment plan"),
      },
      {
        id: "chat:owner:msg-2",
        collection: "chat:envoy:owner:alice",
        sourceKey: "msg-2",
        textPreview: "weather is nice today",
        vector: mockEmbedding("weather is nice today"),
      },
    ]);

    const hits = store.search(
      "chat:envoy:owner:alice",
      mockEmbedding("relay deployment EnvoyMesh"),
      2,
    );
    expect(hits[0]?.sourceKey).toBe("msg-1");
  });
});
