import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
  heliaUnixfsAddBytesInteropRecipeV1,
  heliaUnixfsAddFileInteropRecipeV1,
  readHeliaPackageVersionSync,
} from "../src/index.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "envoymesh-helia-export-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("helia-ipfs-export", () => {
  it("readHeliaPackageVersionSync returns installed helia semver", () => {
    expect(readHeliaPackageVersionSync()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("heliaUnixfsAddBytesInteropRecipeV1 returns reproducible CID for same bytes", async () => {
    const bytes = new TextEncoder().encode("envoymesh helia unixfs recipe v1 fixture\n");
    const first = await heliaUnixfsAddBytesInteropRecipeV1(bytes);
    const second = await heliaUnixfsAddBytesInteropRecipeV1(bytes);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.cid).toBeTruthy();
    expect(second.cid).toBe(first.cid);
    expect(first.cid).toMatch(/^baf/i);
    expect(first.heliaVersion).toBe(readHeliaPackageVersionSync());
  });

  it("heliaUnixfsAddFileInteropRecipeV1 returns reproducible CID for same bytes", async () => {
    const filePath = join(root, "fixture.txt");
    await writeFile(filePath, "envoymesh helia unixfs recipe v1 fixture\n");

    const first = await heliaUnixfsAddFileInteropRecipeV1(filePath);
    const second = await heliaUnixfsAddFileInteropRecipeV1(filePath);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.cid).toBeTruthy();
    expect(second.cid).toBe(first.cid);
    expect(first.cid).toMatch(/^baf/i);
    expect(first.heliaVersion).toBe(readHeliaPackageVersionSync());
  });

  it("heliaUnixfsAddFileInteropRecipeV1 fails for missing file", async () => {
    const outcome = await heliaUnixfsAddFileInteropRecipeV1(join(root, "missing.txt"));
    expect(outcome.ok).toBe(false);
    expect(outcome.errorHint).toMatch(/Helia UnixFS export failed/i);
  });
});

describe("helia recipe id", () => {
  it("exports frozen recipe id constant", () => {
    expect(HELIA_UNIXFS_EXPORT_RECIPE_V1_ID).toBe("helia-unixfs-export-v1");
  });
});
