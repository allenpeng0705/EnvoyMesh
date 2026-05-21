import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  HELIA_UNIXFS_EXPORT_RECIPE_V1_ID,
  heliaUnixfsAddFileInteropRecipeV1,
} from "../src/helia-ipfs-export.js";
import {
  IPFSInteropRecipeV1Id,
  kuboIpfsAddFileInteropRecipeV1,
  kuboIpfsCliAvailableSync,
} from "../src/kubo-ipfs-export.js";
import {
  buildIpfsGoldenLargeFixtureBytes,
  IPFS_GOLDEN_SMALL_FIXTURE,
  IPFS_GOLDEN_SMALL_FIXTURE_BYTES,
  ipfsParityTestEnabled,
} from "./ipfs-golden-fixtures.js";

function assertKuboDaemonReady(): void {
  if (!kuboIpfsCliAvailableSync()) {
    throw new Error("Helia/Kubo parity tests expect `ipfs` on PATH");
  }
  const daemonProbe = spawnSync("ipfs", ["id"], { encoding: "utf8", shell: false });
  if (daemonProbe.status !== 0) {
    throw new Error("Kubo daemon must be running (try `ipfs daemon`) for Helia/Kubo parity tests");
  }
}

describe.skipIf(!ipfsParityTestEnabled())("Helia / Kubo CID parity (requires Kubo + daemon)", () => {
  let tempDir: string;
  let largeFixturePath: string;

  beforeAll(async () => {
    assertKuboDaemonReady();
    tempDir = await mkdtemp(join(tmpdir(), "envoymesh-ipfs-parity-"));
    largeFixturePath = join(tempDir, "ipfs-interop-large-v1.bin");
    await writeFile(largeFixturePath, buildIpfsGoldenLargeFixtureBytes());
  });

  afterAll(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("frozen small fixture bytes unchanged", async () => {
    const bytes = await readFile(IPFS_GOLDEN_SMALL_FIXTURE, "utf8");
    expect(bytes).toBe(IPFS_GOLDEN_SMALL_FIXTURE_BYTES);
  });

  it("small fixture: Helia CID matches Kubo interop recipe v1", async () => {
    const kubo = kuboIpfsAddFileInteropRecipeV1(IPFS_GOLDEN_SMALL_FIXTURE);
    const helia = await heliaUnixfsAddFileInteropRecipeV1(IPFS_GOLDEN_SMALL_FIXTURE);

    expect(kubo.ok, kubo.errorHint ?? kubo.stderr).toBe(true);
    expect(helia.ok, helia.errorHint ?? helia.stderr).toBe(true);
    expect(helia.cid).toBe(kubo.cid);
    expect(kubo.cid).toMatch(/^baf/i);
  });

  it("large multi-chunk fixture: Helia CID matches Kubo interop recipe v1", async () => {
    const kubo = kuboIpfsAddFileInteropRecipeV1(largeFixturePath);
    const helia = await heliaUnixfsAddFileInteropRecipeV1(largeFixturePath);

    expect(kubo.ok, kubo.errorHint ?? kubo.stderr).toBe(true);
    expect(helia.ok, helia.errorHint ?? helia.stderr).toBe(true);
    expect(helia.cid).toBe(kubo.cid);
    expect(kubo.cid).toMatch(/^baf/i);
  });

  it("reports both recipe ids when parity holds", async () => {
    const kubo = kuboIpfsAddFileInteropRecipeV1(IPFS_GOLDEN_SMALL_FIXTURE);
    const helia = await heliaUnixfsAddFileInteropRecipeV1(IPFS_GOLDEN_SMALL_FIXTURE);
    expect(kubo.cid).toBe(helia.cid);
    expect(IPFSInteropRecipeV1Id).toBe("kubo-ipfs-export-v1");
    expect(HELIA_UNIXFS_EXPORT_RECIPE_V1_ID).toBe("helia-unixfs-export-v1");
  });
});
