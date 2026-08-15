import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmEnvoyLocalEmbedInferenceReady,
  createEnvoyLocalEmbedRuntimeState,
  probeEnvoyLocalEmbedInference,
  probeEnvoyLocalEmbedModels,
  type EnvoyLocalEmbedRuntimeDeps,
} from "../src/envoy-local-embed-runtime.js";

function minimalDeps(
  patch: Partial<EnvoyLocalEmbedRuntimeDeps> = {},
): EnvoyLocalEmbedRuntimeDeps {
  return {
    getProfileDir: () => "/tmp/envoy-embed-test",
    loadEnvoyLocalEmbedConfig: async () => ({
      enabled: true,
      activeModelId: "test-embed-model",
    }),
    saveEnvoyLocalEmbedConfig: async () => undefined,
    ...patch,
  };
}

describe("envoy-local-embed probes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("probeEnvoyLocalEmbedModels returns true on HTTP 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    await expect(
      probeEnvoyLocalEmbedModels("http://127.0.0.1:18791/v1"),
    ).resolves.toBe(true);
  });

  it("probeEnvoyLocalEmbedModels returns false on network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(
      probeEnvoyLocalEmbedModels("http://127.0.0.1:18791/v1"),
    ).resolves.toBe(false);
  });

  it("probeEnvoyLocalEmbedInference requires a non-empty vector", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ data: [{ embedding: [0.1, 0.2] }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    await expect(
      probeEnvoyLocalEmbedInference("http://127.0.0.1:18791/v1", "qwen3-embedding-0.6b"),
    ).resolves.toBe(true);
  });

  it("probeEnvoyLocalEmbedInference returns false when embeddings hang (abort)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const signal = init?.signal;
        return await new Promise<Response>((_resolve, reject) => {
          if (!signal) {
            reject(new Error("missing abort signal"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted", "AbortError"));
          });
        });
      }),
    );
    await expect(
      probeEnvoyLocalEmbedInference("http://127.0.0.1:18791/v1", "m", 50),
    ).resolves.toBe(false);
  });

  it("probeEnvoyLocalEmbedInference returns false on empty embedding", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ embedding: [] }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      probeEnvoyLocalEmbedInference("http://127.0.0.1:18791/v1", "m"),
    ).resolves.toBe(false);
  });

  it("confirmEnvoyLocalEmbedInferenceReady requires models + embeddings", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith("/models")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ data: [{ embedding: [0.01] }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const state = createEnvoyLocalEmbedRuntimeState();
    await expect(
      confirmEnvoyLocalEmbedInferenceReady(state, minimalDeps()),
    ).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });

  it("confirmEnvoyLocalEmbedInferenceReady is false when embeddings empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/models")) {
          return new Response(JSON.stringify({ data: [] }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ data: [{ embedding: [] }] }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const state = createEnvoyLocalEmbedRuntimeState();
    await expect(
      confirmEnvoyLocalEmbedInferenceReady(state, minimalDeps()),
    ).resolves.toBe(false);
  });

  it("createEnvoyLocalEmbedRuntimeState tracks watchdog tick in-flight", () => {
    const state = createEnvoyLocalEmbedRuntimeState();
    expect(state.watchdogTickInFlight).toBe(false);
  });
});
