import { describe, expect, it, vi } from "vitest";
import * as kuboExport from "../src/kubo-ipfs-export.js";
import * as kuboEngine from "../src/kubo-ipfs-engine.js";
import { kuboExportEngine } from "../src/ipfs-export-engine-kubo.js";

vi.mock("../src/kubo-ipfs-engine.js", () => ({
  ensureKuboIpfsReady: vi.fn().mockResolvedValue(undefined),
  getKuboIpfsEngineStatus: vi.fn().mockReturnValue({
    available: true,
    running: true,
    managed: true,
    kuboVersion: "0.32.1",
  }),
}));

describe("ipfs-export-engine-kubo", () => {
  it("wraps kubo add outcome with engine metadata", async () => {
    vi.spyOn(kuboExport, "kuboIpfsAddFileInteropRecipeV1").mockReturnValue({
      ok: true,
      cid: "bafywrapped",
      kuboVersion: "0.32.1",
      stderr: "",
    });

    const outcome = await kuboExportEngine.addFile("/tmp/file.bin", "/profile");
    expect(outcome).toEqual({
      ok: true,
      cid: "bafywrapped",
      engineId: "kubo",
      engineVersion: "0.32.1",
      ipfsInteropRecipe: "kubo-ipfs-export-v1",
      stderr: "",
      errorHint: undefined,
    });
  });

  it("ensureReady delegates to kubo engine", async () => {
    await kuboExportEngine.ensureReady("/profile");
    expect(kuboEngine.ensureKuboIpfsReady).toHaveBeenCalledWith({ profileDir: "/profile" });
  });
});
