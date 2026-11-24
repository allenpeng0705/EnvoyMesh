import { describe, expect, it } from "vitest";
import {
  filterEhChildAllowTools,
  parseEhTaskChildren,
} from "../src/agent-runtime-envoy/eh-subagent-patterns.js";

describe("eh-subagent-patterns (FH-P2-B)", () => {
  it("filters dangerous child tools and caps allow-list length", () => {
    expect(
      filterEhChildAllowTools([
        "read_file",
        "task",
        "mcp__foo",
        "bash",
        "  ",
      ]),
    ).toEqual(["read_file", "bash"]);
  });

  it("parses single-objective task args", () => {
    expect(
      parseEhTaskChildren({ objective: "scan lib", allowTools: ["read_file"] }),
    ).toEqual([
      {
        objective: "scan lib",
        allowTools: ["read_file"],
      },
    ]);
  });

  it("parses tasks[] batch", () => {
    expect(
      parseEhTaskChildren({
        tasks: [{ prompt: "a" }, { objective: "b", allowTools: ["bash"] }],
      }),
    ).toEqual([
      {
        objective: "a",
        allowTools: ["read_file", "list_dir", "search_files"],
      },
      { objective: "b", allowTools: ["bash"] },
    ]);
  });

  it("returns empty when args lack objectives", () => {
    expect(parseEhTaskChildren({ tasks: [{ objective: "  " }] })).toEqual([]);
  });
});