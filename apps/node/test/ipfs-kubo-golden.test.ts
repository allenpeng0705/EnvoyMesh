import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  KUBO_EXPORT_ADD_CLI_ARGS_V1,
  kuboIpfsAddFileInteropRecipeV1,
  kuboIpfsCliAvailableSync,
} from "../src/kubo-ipfs-export.js";

const fixtureDir = join(fileURLToPath(new URL(".", import.meta.url)), "fixtures");
const fixturePath = join(fixtureDir, "ipfs-interop-v1.txt");

describe.skipIf(process.env.ENVOYMESH_IPFS_CLI_TEST !== "1")("Kubo IPFS golden interop (requires Kubo + daemon)", () => {
  it("fixture produces reproducible CID via interop recipe v1", async () => {
    if (!kuboIpfsCliAvailableSync()) {
      throw new Error("ENVOYMESH_IPFS_CLI_TEST=1 expects `ipfs` on PATH");
    }

    const daemonProbe = spawnSync("ipfs", ["id"], { encoding: "utf8", shell: false });
    if (daemonProbe.status !== 0) {
      throw new Error("Kubo daemon must be running (try `ipfs daemon`) for golden interop test");
    }

    const first = kuboIpfsAddFileInteropRecipeV1(fixturePath);
    const second = kuboIpfsAddFileInteropRecipeV1(fixturePath);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(first.cid).toBeTruthy();
    expect(second.cid).toBe(first.cid);
    expect(first.cid).toMatch(/^baf/i);

    const direct = spawnSync("ipfs", [...KUBO_EXPORT_ADD_CLI_ARGS_V1, fixturePath], {
      encoding: "utf8",
      shell: false,
    });
    expect(direct.status).toBe(0);
    const directCid = (direct.stdout ?? "").trim().split(/\s+/)[0]?.trim();
    expect(directCid).toBe(first.cid);
  });

  it("fixture bytes are frozen for golden reproducibility", async () => {
    const bytes = await readFile(fixturePath, "utf8");
    expect(bytes).toBe("envoymesh kubo interop recipe v1 golden fixture\n");
  });
});
