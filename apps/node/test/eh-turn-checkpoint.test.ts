import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  completeEhTurnCheckpoint,
  createEhTurnCheckpoint,
  loadEhTurnCheckpoint,
  persistEhTurnCheckpoint,
  revertEhTurnCheckpoint,
} from "../src/eh-turn-checkpoint.js";

const run = promisify(execFile);

async function repo(): Promise<string> {
  const cwd = await mkdtemp(join(tmpdir(), "eh-checkpoint-"));
  await run("git", ["init", "-q"], { cwd });
  await run("git", ["config", "user.email", "test@example.com"], { cwd });
  await run("git", ["config", "user.name", "Test"], { cwd });
  await writeFile(join(cwd, "tracked.txt"), "committed\n");
  await run("git", ["add", "tracked.txt"], { cwd });
  await run("git", ["commit", "-qm", "initial"], { cwd });
  return cwd;
}

describe("EH turn checkpoints", () => {
  it("restores the pre-turn working copy rather than HEAD", async () => {
    const cwd = await repo();
    await writeFile(join(cwd, "tracked.txt"), "user draft\n");
    const pending = await createEhTurnCheckpoint(cwd, "turn-1", "chat-1");
    expect(pending).toBeDefined();
    await writeFile(join(cwd, "tracked.txt"), "agent edit\n");
    await writeFile(join(cwd, "new.txt"), "created\n");
    const complete = await completeEhTurnCheckpoint(pending!, ["tracked.txt", "new.txt"]);
    expect(complete.review.files.map((file) => file.status)).toEqual(["modified", "added"]);
    const result = await revertEhTurnCheckpoint(complete);
    expect(result.reverted).toBe(true);
    expect(await readFile(join(cwd, "tracked.txt"), "utf8")).toBe("user draft\n");
    await expect(readFile(join(cwd, "new.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to overwrite edits made after the turn", async () => {
    const cwd = await repo();
    const pending = await createEhTurnCheckpoint(cwd, "turn-2");
    await writeFile(join(cwd, "tracked.txt"), "agent edit\n");
    const complete = await completeEhTurnCheckpoint(pending!, ["tracked.txt"]);
    await writeFile(join(cwd, "tracked.txt"), "later user edit\n");
    const result = await revertEhTurnCheckpoint(complete);
    expect(result).toMatchObject({
      reverted: false,
      reason: "files_changed_after_turn",
      conflicts: ["tracked.txt"],
    });
    expect(await readFile(join(cwd, "tracked.txt"), "utf8")).toBe("later user edit\n");
  });

  it("omits files whose reported activity did not change their contents", async () => {
    const cwd = await repo();
    const pending = await createEhTurnCheckpoint(cwd, "turn-unchanged");
    const complete = await completeEhTurnCheckpoint(pending!, ["tracked.txt"]);
    expect(complete.review.files).toEqual([]);
    expect(complete.review.canRevert).toBe(false);
  });

  it("shows workspace-detected changes without making uncertain files revertible", async () => {
    const cwd = await repo();
    const pending = await createEhTurnCheckpoint(cwd, "turn-inferred");
    await writeFile(join(cwd, "tracked.txt"), "unreported edit\n");
    const complete = await completeEhTurnCheckpoint(pending!, []);
    expect(complete.review.files).toEqual([
      expect.objectContaining({
        path: "tracked.txt",
        attribution: "workspace",
        revertible: false,
      }),
    ]);
    expect(complete.review).toMatchObject({
      canRevert: false,
      revertBlockedReason: "changes_not_attributed_to_runtime",
    });
  });

  it("preserves a pre-turn rename as the revert baseline", async () => {
    const cwd = await repo();
    await run("git", ["mv", "tracked.txt", "renamed.txt"], { cwd });
    const pending = await createEhTurnCheckpoint(cwd, "turn-rename");
    await writeFile(join(cwd, "renamed.txt"), "agent edit\n");
    const complete = await completeEhTurnCheckpoint(pending!, ["renamed.txt"]);
    const result = await revertEhTurnCheckpoint(complete);
    expect(result.reverted).toBe(true);
    expect(await readFile(join(cwd, "renamed.txt"), "utf8")).toBe("committed\n");
  });

  it("survives a node restart without storing unrelated dirty files", async () => {
    const cwd = await repo();
    const profileDir = await mkdtemp(join(tmpdir(), "eh-profile-"));
    await writeFile(join(cwd, "unrelated.txt"), "private draft\n");
    const pending = await createEhTurnCheckpoint(cwd, "turn-persist", "chat-1");
    await writeFile(join(cwd, "tracked.txt"), "agent edit\n");
    const complete = await completeEhTurnCheckpoint(pending!, ["tracked.txt"]);
    await persistEhTurnCheckpoint(profileDir, complete);
    const loaded = await loadEhTurnCheckpoint(profileDir, "turn-persist");
    expect(loaded?.review).toEqual(complete.review);
    expect([...loaded!.dirty.keys()]).toEqual(["tracked.txt"]);
    const result = await revertEhTurnCheckpoint(loaded!);
    expect(result.reverted).toBe(true);
    expect(await readFile(join(cwd, "tracked.txt"), "utf8")).toBe("committed\n");
    expect(await readFile(join(cwd, "unrelated.txt"), "utf8")).toBe("private draft\n");
  });
});
