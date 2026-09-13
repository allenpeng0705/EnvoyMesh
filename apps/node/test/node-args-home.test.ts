/**
 * The node's profile default moved from `./data/default` to the shared root.
 *
 * That relative default resolved against the working directory, so the same
 * machine produced a different identity depending on where the node was started —
 * and nothing could tell the user which one was theirs. These assertions pin the
 * new behaviour *and* that the explicit overrides still win, because breaking
 * `--profile`/`ENVOYMESH_PROFILE` would strand every developer and every test
 * fixture that points at its own directory.
 *
 * Design: `docs/envoymesh-multi-product-design.md` §4, §6 (state 3).
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENVOYMESH_HOME_MARKER,
  HOME_ENV_VAR,
  profileDirIn,
  resolveHomeDir,
} from "@envoymesh/node-core";
import { parseNodeArgs } from "../src/args.js";

describe("the node's profile default", () => {
  it("is the shared root, not a path relative to the working directory", () => {
    const args = parseNodeArgs([]);
    expect(path.isAbsolute(args.profileDir)).toBe(true);
    // A relative path here is the bug this replaced: it changed with `cd`.
    expect(args.profileDir).not.toMatch(/^\./);
    expect(args.profileDir).toBe(profileDirIn(resolveHomeDir()));
  });

  it("honours ENVOYMESH_HOME", () => {
    const previous = process.env[HOME_ENV_VAR];
    process.env[HOME_ENV_VAR] = "/tmp/envoymesh-home-under-test";
    try {
      expect(parseNodeArgs([]).profileDir).toBe(
        path.join("/tmp/envoymesh-home-under-test", "profile"),
      );
    } finally {
      if (previous === undefined) delete process.env[HOME_ENV_VAR];
      else process.env[HOME_ENV_VAR] = previous;
    }
  });

  it("still lets an explicit profile directory win", () => {
    const previous = process.env["ENVOYMESH_PROFILE"];
    process.env["ENVOYMESH_PROFILE"] = "/tmp/explicit-profile-dir";
    try {
      expect(parseNodeArgs([]).profileDir).toBe("/tmp/explicit-profile-dir");
    } finally {
      if (previous === undefined) delete process.env["ENVOYMESH_PROFILE"];
      else process.env["ENVOYMESH_PROFILE"] = previous;
    }
    expect(parseNodeArgs(["--profile", "/tmp/flag-profile-dir"]).profileDir).toBe(
      "/tmp/flag-profile-dir",
    );
  });

  it("keeps the marker filename stable — it is a contract between products", () => {
    // Renaming this silently would orphan every existing home on every machine.
    expect(ENVOYMESH_HOME_MARKER).toBe("envoymesh.json");
  });
});
