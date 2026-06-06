import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  loadPersistedAssistState,
  savePersistedAssistState,
  sessionToPersisted,
} from "../src/terminal-assist-persist.js";

describe("terminal-assist-persist", () => {
  let profileDir: string;

  beforeEach(async () => {
    profileDir = await mkdtemp(join(tmpdir(), "envoy-assist-persist-"));
  });

  afterEach(async () => {
    //
  });

  it("round-trips assist state file", async () => {
    await savePersistedAssistState(profileDir, {
      version: 1,
      sessions: {
        s1: {
          lastGoal: "deploy",
          goalLoop: { goal: "deploy", stepCount: 2, maxSteps: 10, suspended: true },
        },
      },
    });
    const loaded = await loadPersistedAssistState(profileDir);
    expect(loaded.sessions.s1?.lastGoal).toBe("deploy");
    expect(loaded.sessions.s1?.goalLoop?.suspended).toBe(true);
  });

  it("sessionToPersisted omits empty sessions", () => {
    expect(sessionToPersisted({})).toBeUndefined();
    expect(sessionToPersisted({ lastGoal: "test" })?.lastGoal).toBe("test");
  });
});
