import { describe, expect, it } from "vitest";
import {
  detectEnvoyLocalModelRegion,
  ENVOY_LOCAL_GITHUB_RELEASE_PROXIES,
  resolveEnvoyLocalDownloadRegion,
  resolveEnvoyLocalModelDownloadUrls,
  resolveEnvoyLocalRuntimeDownloadUrls,
  toHfMirrorUrl,
  wrapGithubUrlWithProxy,
} from "../src/envoy-local-mirrors.js";

describe("envoy-local-mirrors", () => {
  it("rewrites Hugging Face URLs onto hf-mirror.com", () => {
    expect(
      toHfMirrorUrl(
        "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/a.gguf",
      ),
    ).toBe("https://hf-mirror.com/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/a.gguf");
  });

  it("forces cn/global via DOWNLOAD_REGION or MODEL_REGION", () => {
    expect(
      detectEnvoyLocalModelRegion({ ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION: "cn" }),
    ).toBe("cn");
    expect(
      detectEnvoyLocalModelRegion({ ENVOYMESH_ENVOY_LOCAL_MODEL_REGION: "cn" }),
    ).toBe("cn");
    expect(
      detectEnvoyLocalModelRegion({ ENVOYMESH_ENVOY_LOCAL_MODEL_REGION: "global" }),
    ).toBe("global");
  });

  it("detects China from zh_CN locale or Asia/Shanghai TZ", () => {
    expect(detectEnvoyLocalModelRegion({ LANG: "zh_CN.UTF-8", TZ: "UTC" })).toBe(
      "cn",
    );
    expect(detectEnvoyLocalModelRegion({ TZ: "Asia/Shanghai" })).toBe("cn");
    expect(detectEnvoyLocalModelRegion({ LANG: "en_US.UTF-8", TZ: "UTC" })).toBe(
      "global",
    );
  });

  it("honors Settings preference after env, before auto-detect", () => {
    expect(
      resolveEnvoyLocalDownloadRegion({
        preference: "cn",
        env: { LANG: "en_US.UTF-8", TZ: "UTC" },
      }),
    ).toBe("cn");
    expect(
      resolveEnvoyLocalDownloadRegion({
        preference: "global",
        env: { LANG: "zh_CN.UTF-8" },
      }),
    ).toBe("global");
    expect(
      resolveEnvoyLocalDownloadRegion({
        preference: "auto",
        env: { ENVOYMESH_ENVOY_LOCAL_DOWNLOAD_REGION: "cn", TZ: "UTC" },
      }),
    ).toBe("cn");
  });

  it("orders China candidates ModelScope then hf-mirror (no huggingface.co)", () => {
    const urls = resolveEnvoyLocalModelDownloadUrls(
      {
        url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/a.gguf",
        modelScopeUrl:
          "https://www.modelscope.cn/models/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/master/a.gguf",
      },
      "cn",
    );
    expect(urls[0]).toContain("modelscope.cn");
    expect(urls[1]).toContain("hf-mirror.com");
    expect(urls.every((u) => !u.includes("huggingface.co"))).toBe(true);
  });

  it("uses Hugging Face only for global region", () => {
    const urls = resolveEnvoyLocalModelDownloadUrls(
      {
        url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/a.gguf",
      },
      "global",
    );
    expect(urls).toEqual([
      "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/a.gguf",
    ]);
  });

  it("falls back to hf-mirror only when ModelScope URL is absent (CN)", () => {
    const urls = resolveEnvoyLocalModelDownloadUrls(
      {
        url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/a.gguf",
      },
      "cn",
    );
    expect(urls).toEqual([
      "https://hf-mirror.com/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/a.gguf",
    ]);
  });

  it("wraps GitHub release URLs with proxy bases", () => {
    const gh =
      "https://github.com/ggml-org/llama.cpp/releases/download/b10331/llama-b10331-bin-macos-arm64.tar.gz";
    expect(wrapGithubUrlWithProxy("https://ghfast.top", gh)).toBe(
      `https://ghfast.top/${gh}`,
    );
  });

  it("orders China runtime candidates: proxies then GitHub", () => {
    const gh =
      "https://github.com/ggml-org/llama.cpp/releases/download/b10331/llama-b10331-bin-macos-arm64.tar.gz";
    const urls = resolveEnvoyLocalRuntimeDownloadUrls(gh, {
      region: "cn",
      env: {},
    });
    expect(urls[0]).toBe(wrapGithubUrlWithProxy(ENVOY_LOCAL_GITHUB_RELEASE_PROXIES[0], gh));
    expect(urls.at(-1)).toBe(gh);
    expect(urls.length).toBe(ENVOY_LOCAL_GITHUB_RELEASE_PROXIES.length + 1);
  });

  it("uses direct GitHub only for global runtime downloads", () => {
    const gh =
      "https://github.com/ggml-org/llama.cpp/releases/download/b10331/llama-b10331-bin-ubuntu-x64.tar.gz";
    expect(
      resolveEnvoyLocalRuntimeDownloadUrls(gh, { region: "global", env: {} }),
    ).toEqual([gh]);
  });

  it("honors RUNTIME_URL override and MIRROR_BASE CDN/{name}", () => {
    const gh =
      "https://github.com/ggml-org/llama.cpp/releases/download/b10331/llama-b10331-bin-ubuntu-x64.tar.gz";
    expect(
      resolveEnvoyLocalRuntimeDownloadUrls(gh, {
        region: "global",
        env: { ENVOYMESH_ENVOY_LOCAL_RUNTIME_URL: "https://cdn.example/a.tar.gz" },
        assetKind: "runtime",
      }),
    ).toEqual(["https://cdn.example/a.tar.gz"]);

    const withCdn = resolveEnvoyLocalRuntimeDownloadUrls(gh, {
      region: "global",
      env: {
        ENVOYMESH_ENVOY_LOCAL_RUNTIME_MIRROR_BASE:
          "https://cdn.example/envoy-local/{name}",
      },
    });
    expect(withCdn[0]).toBe(
      "https://cdn.example/envoy-local/llama-b10331-bin-ubuntu-x64.tar.gz",
    );
    expect(withCdn[1]).toBe(gh);
  });
});
