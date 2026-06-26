import { describe, expect, it } from "vitest";
import { bondReachabilityClass } from "../../src/hooks/useBondsReachability.js";

describe("bondReachabilityClass", () => {
  it("maps connection info to CSS class", () => {
    expect(bondReachabilityClass(undefined)).toBe("offline");
    expect(bondReachabilityClass({ connected: false, direct: false })).toBe("offline");
    expect(bondReachabilityClass({ connected: true, direct: true })).toBe("online-direct");
    expect(bondReachabilityClass({ connected: true, direct: false })).toBe("online-relay");
  });
});
