import { afterEach, describe, expect, it, vi } from "vitest";

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock,
}));

import {
  IPFSInteropRecipeV1Id,
  KUBO_EXPORT_ADD_CLI_ARGS_V1,
  ipfsInteropRecipeV1CliTemplate,
  kuboIpfsAddFileInteropRecipeV1,
  kuboIpfsCliAvailableSync,
} from "../src/kubo-ipfs-export.js";

afterEach(() => {
  spawnSyncMock.mockReset();
});

describe("kubo-ipfs-export", () => {
  it("exposes frozen interop recipe v1 template", () => {
    expect(IPFSInteropRecipeV1Id).toBe("kubo-ipfs-export-v1");
    expect([...KUBO_EXPORT_ADD_CLI_ARGS_V1]).toEqual(["add", "--cid-version", "1", "--pin=false", "-Q"]);
    expect(ipfsInteropRecipeV1CliTemplate()).toBe(
      "ipfs add --cid-version 1 --pin=false -Q <absoluteFile>",
    );
  });

  it("kuboIpfsCliAvailableSync is false when ipfs missing", () => {
    spawnSyncMock.mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "",
      pid: 0,
      output: [],
      signal: null,
      error: Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    });

    expect(kuboIpfsCliAvailableSync()).toBe(false);
  });

  it("kuboIpfsAddFileInteropRecipeV1 surfaces ENOENT hint", () => {
    spawnSyncMock.mockImplementation((_cmd, args) => {
      if (args?.[0] === "version") {
        return { status: 1, stdout: "", stderr: "", pid: 0, output: [], signal: null };
      }
      return {
        status: 1,
        stdout: "",
        stderr: "",
        pid: 0,
        output: [],
        signal: null,
        error: Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }),
      };
    });

    const outcome = kuboIpfsAddFileInteropRecipeV1("/tmp/file.bin");
    expect(outcome.ok).toBe(false);
    expect(outcome.errorHint).toMatch(/IPFS engine|PATH|Kubo/i);
  });

  it("kuboIpfsAddFileInteropRecipeV1 returns quiet stdout CID", () => {
    spawnSyncMock.mockImplementation((_cmd, args) => {
      if (args?.[0] === "version") {
        return { status: 0, stdout: "0.24.0\n", stderr: "", pid: 0, output: [], signal: null };
      }
      return {
        status: 0,
        stdout: "bafyquietroot\n",
        stderr: "",
        pid: 0,
        output: [],
        signal: null,
      };
    });

    const outcome = kuboIpfsAddFileInteropRecipeV1("/vault/export.md");
    expect(outcome).toMatchObject({
      ok: true,
      cid: "bafyquietroot",
      kuboVersion: "0.24.0",
    });
    expect(spawnSyncMock).toHaveBeenCalledWith(
      "ipfs",
      [...KUBO_EXPORT_ADD_CLI_ARGS_V1, "/vault/export.md"],
      expect.objectContaining({ shell: false }),
    );
  });

  it("kuboIpfsAddFileInteropRecipeV1 fails when add exits non-zero", () => {
    spawnSyncMock.mockImplementation((_cmd, args) => {
      if (args?.[0] === "version") {
        return { status: 0, stdout: "0.24.0\n", stderr: "", pid: 0, output: [], signal: null };
      }
      return {
        status: 1,
        stdout: "",
        stderr: "Error: connect to api: connection refused",
        pid: 0,
        output: [],
        signal: null,
      };
    });

    const outcome = kuboIpfsAddFileInteropRecipeV1("/vault/export.md");
    expect(outcome.ok).toBe(false);
    expect(outcome.errorHint).toMatch(/connection refused|daemon/i);
  });

  it("kuboIpfsAddFileInteropRecipeV1 fails when add succeeds but stdout is empty", () => {
    spawnSyncMock.mockImplementation((_cmd, args) => {
      if (args?.[0] === "version") {
        return { status: 0, stdout: "0.24.0\n", stderr: "", pid: 0, output: [], signal: null };
      }
      return { status: 0, stdout: "\n", stderr: "", pid: 0, output: [], signal: null };
    });

    const outcome = kuboIpfsAddFileInteropRecipeV1("/vault/export.md");
    expect(outcome.ok).toBe(false);
    expect(outcome.errorHint).toMatch(/no CID/i);
  });
});
