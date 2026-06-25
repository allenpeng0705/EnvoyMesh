import { spawn, type ChildProcess } from "node:child_process";
import { createServer as createNetServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { applyBridgeConfigResolution, BridgeConfigSchema } from "../src/bridge/config.js";
import { ExtAgentSidecarManager } from "../src/bridge/ext-agent-sidecar-spawn.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function getFreePort(): Promise<number> {
  const server = createNetServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

describe("ExtAgentSidecarManager", () => {
  const managers: ExtAgentSidecarManager[] = [];
  const extraProcs: ChildProcess[] = [];

  afterEach(async () => {
    await Promise.all(managers.splice(0).map((m) => m.stopAll()));
    for (const proc of extraProcs.splice(0)) {
      proc.kill("SIGTERM");
    }
  });

  it("auto-starts hermes sidecar when bridge enabled", async () => {
    const port = await getFreePort();
    const manager = new ExtAgentSidecarManager();
    managers.push(manager);

    const resolved = applyBridgeConfigResolution(
      BridgeConfigSchema.parse({
        enabled: true,
        listenPort: 3031,
        activeExtAgent: "hermes",
        extAgents: [
          {
            id: "hermes",
            name: "Hermes",
            adapter: "envoymesh-message",
            url: `http://127.0.0.1:${port}/message`,
            enabled: true,
          },
        ],
      }),
    );

    await manager.sync(resolved, {
      nodeCwd: REPO_ROOT,
      listenPort: 3031,
    });

    const res = await fetch(`http://127.0.0.1:${port}/status`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { status?: string; backend?: string };
    expect(body.status).toBe("OK");
    expect(["echo", "hermes-cmd"]).toContain(body.backend);
  });
});
