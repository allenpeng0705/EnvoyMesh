import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDashboardConfig } from "../src/main/dashboard-service.js";

let fakeWorkspace: string;

beforeEach(async () => {
  fakeWorkspace = await mkdtemp(join(tmpdir(), "envoymesh-workspace-"));
  await writeFile(
    join(fakeWorkspace, "package.json"),
    JSON.stringify({ name: "envoy-mesh", private: true }),
  );
});

afterEach(async () => {
  await rm(fakeWorkspace, { recursive: true, force: true });
});

describe("createDashboardConfig", () => {
  it("defaults profile and vault paths under ENVOYMESH_WORKSPACE", () => {
    const config = createDashboardConfig({
      ENVOYMESH_WORKSPACE: fakeWorkspace,
    } as NodeJS.ProcessEnv);

    expect(config.profileDir).toBe(join(fakeWorkspace, "data/default"));
    expect(config.vaultDir).toBe(join(fakeWorkspace, "shared_vault"));
  });
});
