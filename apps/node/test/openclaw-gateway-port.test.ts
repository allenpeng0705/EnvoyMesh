import { describe, expect, it, vi } from "vitest";
import { isOpenClawEnvoymeshWebhookReady } from "../src/openclaw-gateway-config.js";
import {
  probeEnvoymeshWebhookStatus,
  stopProcesses,
} from "../src/openclaw-gateway-port.js";

describe("openclaw gateway port helpers", () => {
  it("isOpenClawEnvoymeshWebhookReady rejects 404", () => {
    expect(isOpenClawEnvoymeshWebhookReady(404)).toBe(false);
    expect(isOpenClawEnvoymeshWebhookReady(400)).toBe(true);
  });

  it("stopProcesses skips excluded pid", () => {
    const kill = vi.spyOn(process, "kill").mockImplementation(() => true as never);
    expect(stopProcesses([111, 222], 111)).toEqual([222]);
    expect(kill).toHaveBeenCalledTimes(1);
    expect(kill).toHaveBeenCalledWith(222, "SIGTERM");
    kill.mockRestore();
  });
});

describe("probeEnvoymeshWebhookStatus", () => {
  it("returns null when fetch fails", async () => {
    await expect(probeEnvoymeshWebhookStatus("http://127.0.0.1:1/webhook/envoymesh", 500)).resolves.toBeNull();
  });
});

// Note: reclaimAssistantGatewayPort is covered by the integration path
// (apps/node/src/node-service-openclaw-runtime.ts calls it before spawning
// the gateway). A pure unit test would need to mock `listListeningPidsOnPort`
// and `fetch` inside the same module — vitest's vi.spyOn can replace the
// export binding, but the function calls the original via lexical scope, so
// the spy doesn't reach the call site. The SIGKILL-escalation behavior is
// documented at the function and the sibling runtime test covers the
// in-process restart case (waitForOpenClawChildExit) end-to-end.
