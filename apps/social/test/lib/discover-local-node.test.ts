import { describe, expect, it } from "vitest";
import {
  loopbackWsUrlForPort,
  orderedDevLoopbackWsPorts,
  parseLoopbackWsPort,
} from "../../src/lib/discover-local-node.js";

describe("discover-local-node helpers", () => {
  it("parses loopback ws ports", () => {
    expect(parseLoopbackWsPort("ws://127.0.0.1:4030/ws")).toBe(4030);
    expect(parseLoopbackWsPort("ws://127.0.0.1/ws")).toBe(3030);
    expect(parseLoopbackWsPort("ws://example.com:3030/ws")).toBeNull();
  });

  it("orders prefer port before defaults", () => {
    expect(orderedDevLoopbackWsPorts(4030)).toEqual([4030, 3030]);
    expect(orderedDevLoopbackWsPorts(3030)).toEqual([3030, 4030]);
    expect(orderedDevLoopbackWsPorts(null)).toEqual([3030, 4030]);
  });

  it("builds loopback ws urls", () => {
    expect(loopbackWsUrlForPort(4030)).toBe("ws://127.0.0.1:4030/ws");
  });
});
