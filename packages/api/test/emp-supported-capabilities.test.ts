import { describe, expect, it } from "vitest";
import { resolveEmpSupportedCapabilities } from "../src/emp-supported-capabilities.js";

describe("resolveEmpSupportedCapabilities", () => {
  it("returns empty when no postures enabled", () => {
    expect(resolveEmpSupportedCapabilities({})).toEqual([]);
  });

  it("advertises enabled postures", () => {
    expect(
      resolveEmpSupportedCapabilities({
        socialProxyEnabled: true,
        documentAcquisitionEnabled: true,
        capabilityProviderEnabled: true,
      }),
    ).toEqual(["social-proxy", "document-acquisition", "agent-network-worker"]);
  });
});
