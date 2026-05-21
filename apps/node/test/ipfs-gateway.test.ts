import { describe, expect, it, vi, afterEach } from "vitest";
import {
  buildIpfsGatewayContentUrl,
  fetchIpfsGatewayBytes,
  normalizeGatewayBaseUrl,
  resolveAllowlistedGateway,
} from "../src/ipfs-gateway.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ipfs-gateway", () => {
  it("normalizes gateway bases", () => {
    expect(normalizeGatewayBaseUrl("ipfs.io")).toBe("https://ipfs.io");
    expect(normalizeGatewayBaseUrl("https://dweb.link/")).toBe("https://dweb.link");
    expect(normalizeGatewayBaseUrl("http://127.0.0.1:8080")).toBe("http://127.0.0.1:8080");
  });

  it("rejects insecure and credential gateway URLs", () => {
    expect(() => normalizeGatewayBaseUrl("http://example.com")).toThrow(/https|localhost/i);
    expect(() => normalizeGatewayBaseUrl("https://user:pass@ipfs.io")).toThrow(/credentials/i);
    expect(() => normalizeGatewayBaseUrl("not a url!!!")).toThrow(/Invalid gateway URL/);
  });

  it("builds standard /ipfs/<cid> URLs", () => {
    expect(buildIpfsGatewayContentUrl("https://ipfs.io", "bafyTEST")).toBe("https://ipfs.io/ipfs/bafyTEST");
    expect(buildIpfsGatewayContentUrl("https://ipfs.io", "bafy/with/slash")).toBe(
      "https://ipfs.io/ipfs/bafy%2Fwith%2Fslash",
    );
  });

  it("resolveAllowlistedGateway requires allowlist membership", () => {
    expect(resolveAllowlistedGateway(["https://ipfs.io"], "https://ipfs.io")).toBe("https://ipfs.io");
    expect(resolveAllowlistedGateway(["ipfs.io"], undefined)).toBe("https://ipfs.io");
    expect(() => resolveAllowlistedGateway(["https://ipfs.io"], "https://evil.example")).toThrow(/allowlist/);
    expect(() => resolveAllowlistedGateway([], undefined)).toThrow(/allowlist/);
  });

  it("fetchIpfsGatewayBytes rejects oversized content-length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: (h: string) => (h === "content-length" ? "999999999" : null) },
        arrayBuffer: async () => new ArrayBuffer(0),
      }),
    );

    await expect(fetchIpfsGatewayBytes("https://ipfs.io", "bafybig", 1024)).rejects.toThrow(/too large/i);
  });

  it("fetchIpfsGatewayBytes rejects non-OK HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        statusText: "Gateway Timeout",
        headers: { get: () => null },
      }),
    );

    await expect(fetchIpfsGatewayBytes("https://ipfs.io", "bafy", 1024)).rejects.toThrow(/504/);
  });

  it("fetchIpfsGatewayBytes rejects oversized body when content-length is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array(2048).buffer,
      }),
    );

    await expect(fetchIpfsGatewayBytes("https://ipfs.io", "bafy", 1024)).rejects.toThrow(/too large/i);
  });
});
