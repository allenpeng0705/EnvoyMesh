import { describe, expect, it } from "vitest";
import { isEmbedOperationInFlight } from "../../src/hooks/useEnvoyLocalEmbedReadiness.js";
import type { EnvoyLocalEmbedStatus } from "@envoymesh/api";

function status(partial: Partial<EnvoyLocalEmbedStatus>): EnvoyLocalEmbedStatus {
  return {
    enabled: true,
    running: false,
    phase: "idle",
    port: 18791,
    endpoint: "http://127.0.0.1:18791/v1",
    runtimeInstalled: true,
    operationInProgress: false,
    ...partial,
  };
}

describe("isEmbedOperationInFlight", () => {
  it("treats a ready/running sidecar as not downloading", () => {
    expect(
      isEmbedOperationInFlight(
        status({
          running: true,
          phase: "ready",
          operationInProgress: true,
        }),
      ),
    ).toBe(false);
    expect(
      isEmbedOperationInFlight(
        status({
          running: false,
          phase: "ready",
          operationInProgress: true,
        }),
      ),
    ).toBe(false);
  });

  it("is true only during real install phases", () => {
    expect(
      isEmbedOperationInFlight(
        status({ phase: "downloading-model", operationInProgress: true }),
      ),
    ).toBe(true);
    expect(
      isEmbedOperationInFlight(status({ phase: "starting", operationInProgress: true })),
    ).toBe(true);
    expect(isEmbedOperationInFlight(status({ phase: "error" }))).toBe(false);
  });
});
