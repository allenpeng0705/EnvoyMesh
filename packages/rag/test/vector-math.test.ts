import { describe, expect, it } from "vitest";
import { cosineSimilarity, topKByCosine } from "../src/vector-math.js";

describe("vector-math", () => {
  it("scores identical vectors as 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it("returns top matches by cosine similarity", () => {
    const hits = topKByCosine(
      [1, 0],
      [
        { id: "a", vector: [1, 0] },
        { id: "b", vector: [0, 1] },
        { id: "c", vector: [0.9, 0.1] },
      ],
      2,
    );
    expect(hits.map((hit) => hit.id)).toEqual(["a", "c"]);
  });
});
