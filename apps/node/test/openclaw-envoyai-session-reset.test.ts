import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import {
  _isEnvoyAiOpenClawSessionKeyForTest,
  resetOpenClawEnvoyAiSessions,
} from "../src/openclaw-envoyai-session-reset.js";

describe("isEnvoyAiOpenClawSessionKey", () => {
  it("matches main and envoymesh keys", () => {
    expect(_isEnvoyAiOpenClawSessionKeyForTest("agent:main:main")).toBe(true);
    expect(
      _isEnvoyAiOpenClawSessionKeyForTest(
        "agent:main:envoymesh:default:direct:envoy:owner:abc",
      ),
    ).toBe(true);
    expect(_isEnvoyAiOpenClawSessionKeyForTest("agent:main:other")).toBe(false);
  });
});

describe("resetOpenClawEnvoyAiSessions", () => {
  let profileDir = "";

  afterEach(async () => {
    if (profileDir) {
      await rm(profileDir, { recursive: true, force: true });
      profileDir = "";
    }
  });

  it("removes EnvoyAI sessions and trajectory files, keeps unrelated keys", async () => {
    profileDir = await mkdtemp(join(tmpdir(), "oc-envoyai-reset-"));
    const sessionsDir = join(
      profileDir,
      "openclaw-gateway",
      "agents",
      "main",
      "sessions",
    );
    await mkdir(sessionsDir, { recursive: true });

    const keepFile = join(sessionsDir, "keep-session.jsonl");
    const dropFile = join(sessionsDir, "drop-session.jsonl");
    const dropTrajectory = join(sessionsDir, "drop-session.trajectory.jsonl");
    await writeFile(keepFile, "keep\n", "utf8");
    await writeFile(dropFile, "drop\n", "utf8");
    await writeFile(dropTrajectory, "traj\n", "utf8");

    await writeFile(
      join(sessionsDir, "sessions.json"),
      JSON.stringify(
        {
          "agent:main:other-channel": {
            sessionId: "keep",
            sessionFile: keepFile,
          },
          "agent:main:main": {
            sessionId: "drop",
            sessionFile: dropFile,
          },
          "agent:main:envoymesh:default:direct:x": {
            sessionId: "drop2",
            sessionFile: dropFile,
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const result = await resetOpenClawEnvoyAiSessions(profileDir);
    expect(result.removedSessions).toBe(2);
    expect(result.removedFiles).toBeGreaterThanOrEqual(2);

    const index = JSON.parse(
      await readFile(join(sessionsDir, "sessions.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(Object.keys(index)).toEqual(["agent:main:other-channel"]);
    expect(await readFile(keepFile, "utf8")).toBe("keep\n");
  });
});
