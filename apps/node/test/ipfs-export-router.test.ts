import { afterEach, describe, expect, it, vi } from "vitest";
import * as kuboEngine from "../src/ipfs-export-engine-kubo.js";
import {
  addFileViaHeliaExportEngine,
  addFileViaPrimaryIpfsExportEngine,
  getIpfsEngineStatus,
  getIpfsExportEngine,
  isHeliaShadowSelection,
  normalizeIpfsExportEngineSelection,
  resolveIpfsExportEngineSelection,
  resolvePrimaryExportEngineId,
} from "../src/ipfs-export-router.js";

describe("ipfs-export-router", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("resolveIpfsExportEngineSelection defaults to kubo", () => {
    expect(resolveIpfsExportEngineSelection()).toBe("kubo");
    expect(resolveIpfsExportEngineSelection({ externalPublish: {} })).toBe("kubo");
  });

  it("resolveIpfsExportEngineSelection reads node config", () => {
    expect(
      resolveIpfsExportEngineSelection({
        externalPublish: { ipfsExportEngine: "kubo-with-helia-shadow" },
      }),
    ).toBe("kubo-with-helia-shadow");
  });

  it("resolveIpfsExportEngineSelection prefers ENVOYMESH_IPFS_EXPORT_ENGINE", () => {
    vi.stubEnv("ENVOYMESH_IPFS_EXPORT_ENGINE", "helia");
    expect(
      resolveIpfsExportEngineSelection({
        externalPublish: { ipfsExportEngine: "kubo" },
      }),
    ).toBe("helia");
  });

  it("resolvePrimaryExportEngineId maps shadow mode to kubo primary", () => {
    expect(resolvePrimaryExportEngineId("kubo")).toBe("kubo");
    expect(resolvePrimaryExportEngineId("kubo-with-helia-shadow")).toBe("kubo");
    expect(resolvePrimaryExportEngineId("helia")).toBe("helia");
  });

  it("isHeliaShadowSelection identifies shadow mode", () => {
    expect(isHeliaShadowSelection("kubo-with-helia-shadow")).toBe(true);
    expect(isHeliaShadowSelection("kubo")).toBe(false);
  });

  it("getIpfsExportEngine returns kubo and helia engines", () => {
    expect(getIpfsExportEngine("kubo").id).toBe("kubo");
    expect(getIpfsExportEngine("helia").id).toBe("helia");
  });

  it("addFileViaPrimaryIpfsExportEngine delegates to kubo for default selection", async () => {
    const addSpy = vi.spyOn(kuboEngine.kuboExportEngine, "addFile").mockResolvedValue({
      ok: true,
      cid: "bafyrouter",
      engineId: "kubo",
      engineVersion: "0.32.1",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
    });

    const outcome = await addFileViaPrimaryIpfsExportEngine({
      absFilePath: "/vault/file.txt",
      profileDir: "/profile",
      selection: "kubo",
    });

    expect(addSpy).toHaveBeenCalledWith("/vault/file.txt", "/profile");
    expect(outcome.cid).toBe("bafyrouter");
  });

  it("addFileViaPrimaryIpfsExportEngine delegates to helia when helia is selected", async () => {
    const helia = await import("../src/ipfs-export-engine-helia.js");
    const addSpy = vi.spyOn(helia.heliaExportEngine, "addFile").mockResolvedValue({
      ok: true,
      cid: "bafyhelia",
      engineId: "helia",
      engineVersion: "6.1.4",
      ipfsInteropRecipe: "helia-unixfs-export-v1",
    });

    const outcome = await addFileViaPrimaryIpfsExportEngine({
      absFilePath: "/vault/file.txt",
      profileDir: "/profile",
      selection: "helia",
    });

    expect(addSpy).toHaveBeenCalledWith("/vault/file.txt", "/profile");
    expect(outcome.cid).toBe("bafyhelia");
  });

  it("addFileViaHeliaExportEngine uses helia engine", async () => {
    const helia = await import("../src/ipfs-export-engine-helia.js");
    const addSpy = vi.spyOn(helia.heliaExportEngine, "addFile").mockResolvedValue({
      ok: true,
      cid: "bafyhelia",
      engineId: "helia",
      engineVersion: "6.1.4",
      ipfsInteropRecipe: "helia-unixfs-export-v1",
    });

    const outcome = await addFileViaHeliaExportEngine({
      absFilePath: "/vault/file.txt",
      profileDir: "/profile",
    });

    expect(addSpy).toHaveBeenCalled();
    expect(outcome.cid).toBe("bafyhelia");
  });

  it("normalizeIpfsExportEngineSelection coerces invalid values to kubo", () => {
    expect(normalizeIpfsExportEngineSelection(undefined)).toBe("kubo");
    expect(normalizeIpfsExportEngineSelection("not-an-engine")).toBe("kubo");
    expect(normalizeIpfsExportEngineSelection("helia")).toBe("helia");
  });

  it("getIpfsEngineStatus maps primary fields from Helia when helia is selected", () => {
    const status = getIpfsEngineStatus({
      profileDir: "/profile",
      selection: "helia",
    });
    expect(status.available).toBe(true);
    expect(status.helia?.available).toBe(true);
    expect(status.kubo).toBeDefined();
  });

  it("getIpfsEngineStatus reports kubo and helia slices", () => {
    const status = getIpfsEngineStatus({
      profileDir: "/profile",
      selection: "kubo-with-helia-shadow",
    });
    expect(status.helia?.available).toBe(true);
    expect(status.helia?.heliaVersion).toMatch(/^\d+\.\d+\.\d+/);
  });
});
