/**
 * Local verifier scoreboard tests (design §9.1).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateOwnerIdentity, signCanonicalPayload } from "@envoymesh/identity";
import type { VerifierScoreboardEntry } from "../src/verifier-scoreboard.js";
import {
  forScoreboardSigning,
  nextScoreboardVersion,
  VerifierScoreboard,
} from "../src/verifier-scoreboard.js";

let dir: string;
let owner: ReturnType<typeof generateOwnerIdentity>;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "envoy-verifier-scoreboard-"));
  owner = generateOwnerIdentity();
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function entry(overrides: Partial<VerifierScoreboardEntry> = {}): VerifierScoreboardEntry {
  const unsigned: Omit<VerifierScoreboardEntry, "ownerSignature"> = {
    version: 1,
    runtime: "openclaw",
    hypothesis: "verifier missed a bad summary; add a coherence rule",
    rulesetHash: "abc123",
    meanScore: 0.82,
    passRateBefore: 0.6,
    passRateAfter: 0.85,
    nRuns: 50,
    status: "kept",
    createdAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
  return {
    ...unsigned,
    ownerSignature: signCanonicalPayload(unsigned, owner.privateKeyPem),
  };
}

describe("VerifierScoreboard", () => {
  it("appends owner-signed entries and reads them back oldest-first", async () => {
    const board = new VerifierScoreboard({
      filePath: join(dir, "scoreboard.jsonl"),
      ownerPublicKeyPem: owner.publicKeyPem,
    });
    const e1 = entry();
    const e2 = entry({ version: 2, rulesetHash: "def456", status: "reverted" });

    await board.append(e1);
    await board.append(e2);

    const all = await board.readAll();
    expect(all).toEqual([e1, e2]);
  });

  it("latest returns the newest entry per runtime", async () => {
    const board = new VerifierScoreboard({
      filePath: join(dir, "scoreboard.jsonl"),
      ownerPublicKeyPem: owner.publicKeyPem,
    });
    await board.append(entry());
    await board.append(entry({ version: 2, runtime: "pi" }));

    expect((await board.latest("openclaw"))!.version).toBe(1);
    expect((await board.latest("pi"))!.version).toBe(2);
    expect(await board.latest("hermes")).toBeNull();
  });

  it("rejects entries not signed by the owner", async () => {
    const other = generateOwnerIdentity();
    const board = new VerifierScoreboard({
      filePath: join(dir, "scoreboard.jsonl"),
      ownerPublicKeyPem: owner.publicKeyPem,
    });
    const forged = entry();
    const unsigned = forScoreboardSigning(forged);
    const bad = {
      ...unsigned,
      ownerSignature: signCanonicalPayload(unsigned, other.privateKeyPem),
    } as VerifierScoreboardEntry;

    await expect(board.append(bad)).rejects.toThrow("not signed by the owner");
    expect(await board.readAll()).toHaveLength(0);
  });

  it("rejects version regressions within a runtime", async () => {
    const board = new VerifierScoreboard({
      filePath: join(dir, "scoreboard.jsonl"),
      ownerPublicKeyPem: owner.publicKeyPem,
    });
    await board.append(entry({ version: 2 }));

    await expect(board.append(entry({ version: 1 }))).rejects.toThrow("version regressed");
    await expect(board.append(entry({ version: 2 }))).rejects.toThrow("version regressed");
  });

  it("is readable when the file is missing (fresh node)", async () => {
    const board = new VerifierScoreboard({
      filePath: join(dir, "does-not-exist.jsonl"),
      ownerPublicKeyPem: owner.publicKeyPem,
    });
    expect(await board.readAll()).toEqual([]);
    expect(await board.latest("openclaw")).toBeNull();
  });

  it("nextScoreboardVersion advances the per-runtime sequence", () => {
    expect(nextScoreboardVersion(null)).toBe(1);
    expect(nextScoreboardVersion(entry())).toBe(2);
  });
});
