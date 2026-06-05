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
