import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENVOY_LOCAL_SERVER_PARAMS,
  normalizeEnvoyLocalConfig,
  normalizeEnvoyLocalEmbedConfig,
  resolveEnvoyLocalServerParams,
} from "../src/envoy-local.js";
import {
  defaultEnvoyLocalEmbedEndpoint,
  envoyLocalEmbedPort,
  ENVOY_LOCAL_EMBED_PORT_BASE,
} from "../src/embedding-presets.js";

describe("envoy-local config", () => {
  it("defaults enabled to false", () => {
    expect(normalizeEnvoyLocalConfig(undefined).enabled).toBe(false);
    expect(normalizeEnvoyLocalConfig({}).enabled).toBe(false);
  });

  it("preserves active model and params when enabled", () => {
    const n = normalizeEnvoyLocalConfig({
      enabled: true,
      activeModelId: "qwen3.5-0.8b-q4_k_m",
      serverParams: { ctxSize: 2048 },
    });
    expect(n.enabled).toBe(true);
    expect(n.activeModelId).toBe("qwen3.5-0.8b-q4_k_m");
    expect(n.serverParams?.ctxSize).toBe(2048);
  });

  it("ships sensible server defaults", () => {
    expect(DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.ctxSize).toBe(32768);
    expect(DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.nGpuLayers).toBe("auto");
    expect(DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.parallel).toBe(1);
    expect(DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.flashAttn).toBe("auto");
    expect(DEFAULT_ENVOY_LOCAL_SERVER_PARAMS.fit).toBe("on");
  });

  it("resolveEnvoyLocalServerParams merges over defaults", () => {
    const p = resolveEnvoyLocalServerParams({ ctxSize: 16384, nGpuLayers: 0 });
    expect(p.ctxSize).toBe(16384);
    expect(p.nGpuLayers).toBe(0);
    expect(p.parallel).toBe(1);
    expect(p.flashAttn).toBe("auto");
    expect(p.fit).toBe("on");
  });
});

describe("envoy-local-embed config", () => {
  it("defaults enabled to true (auto-provision on boot)", () => {
    expect(normalizeEnvoyLocalEmbedConfig(undefined).enabled).toBe(true);
    expect(normalizeEnvoyLocalEmbedConfig({}).enabled).toBe(true);
  });

  it("honors explicit disable", () => {
    expect(normalizeEnvoyLocalEmbedConfig({ enabled: false }).enabled).toBe(false);
  });

  it("default embed endpoint tracks port offset helpers", () => {
    expect(envoyLocalEmbedPort()).toBe(ENVOY_LOCAL_EMBED_PORT_BASE + 0);
    expect(defaultEnvoyLocalEmbedEndpoint()).toContain(`:${envoyLocalEmbedPort()}/v1`);
  });
});
