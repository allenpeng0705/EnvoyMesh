import { describe, expect, it } from "vitest";
import { buildConnectivityDiagnostics } from "../src/connectivity-diagnostics.js";

describe("buildConnectivityDiagnostics", () => {
  it("returns WAN axes from audit events", async () => {
    const diagnostics = await buildConnectivityDiagnostics({
      mesh: undefined,
      nodeOnline: false,
      config: undefined,
      auditEvents: [
        {
          type: "p2p.trace",
          protocol: "connectivity.profile",
          summary:
            "connectivity profile=wan-default mdns=false dht=true relay=true autonat=true dcutr=true bootstrap=2",
          createdAt: "2026-05-20T10:00:00.000Z",
        },
        {
          type: "p2p.trace",
          protocol: "connectivity.bootstrap.ok",
          summary: "bootstrap ok",
          createdAt: "2026-05-20T10:00:01.000Z",
        },
      ],
    });

    expect(diagnostics.axes.bootstrapReachability.state).toBe("ok");
    expect(diagnostics.signOffChecklist.length).toBeGreaterThan(0);
    expect(diagnostics.hints.length).toBeGreaterThan(0);
  });
});
