import { describe, expect, it, vi, afterEach } from "vitest";
import { postOpenClawWebhook } from "../src/node-service-openclaw-runtime.js";

describe("postOpenClawWebhook", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries 429 with Retry-After then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("busy", {
          status: 429,
          headers: { "Retry-After": "0" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const resp = await postOpenClawWebhook("http://127.0.0.1:19999/webhook/envoymesh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      timeoutMs: 5_000,
    });

    expect(resp.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
