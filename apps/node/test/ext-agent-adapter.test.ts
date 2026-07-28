import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { join } from "node:path";
import {
  _backendTest,
  startExtAgentHttpServer,
  syncExtAgentSidecar,
  stopExtAgentSidecar,
  getRunningExtAgentSidecar,
  _resetExtAgentSidecarForTests,
  isExtAgentSidecarKind,
  setPiExtAgentAsk,
} from "../src/ext-agent-adapter/index.js";

describe("ext-agent-adapter backends", () => {
  it("parses OpenAI-style Hermes content", () => {
    expect(
      _backendTest.extractOpenAiContent({
        choices: [{ message: { content: "hello from hermes" } }],
      }),
    ).toBe("hello from hermes");
  });

  it("parses OpenHuman RpcOutcome string value", () => {
    expect(
      _backendTest.extractOpenHumanText({
        jsonrpc: "2.0",
        id: 1,
        result: { value: "hello from openhuman" },
      }),
    ).toBe("hello from openhuman");
  });

  it("reads API_SERVER_KEY from dotenv text", () => {
    const raw = [
      "# comment",
      "API_SERVER_ENABLED=true",
      'API_SERVER_KEY="abc-def-123" # inline',
      "OTHER=1",
    ].join("\n");
    expect(_backendTest.readDotEnvKey(raw, "API_SERVER_KEY")).toBe("abc-def-123");
    expect(_backendTest.readDotEnvKey("API_SERVER_KEY=plain\n", "API_SERVER_KEY")).toBe("plain");
    expect(_backendTest.readDotEnvKey("# API_SERVER_KEY=nope\n", "API_SERVER_KEY")).toBeUndefined();
  });

  it("hermesEnvCandidatePaths prefers explicit overrides then platform defaults", () => {
    const hermesHome = join("/opt", "hermes-data");
    const localAppData = join("/win", "Local");
    const appData = join("/win", "Roaming");
    const userProfile = join("/win", "Users", "alice");
    const paths = _backendTest.hermesEnvCandidatePaths({
      HERMES_ENV_FILE: "/explicit/hermes.env",
      HERMES_HOME: hermesHome,
      LOCALAPPDATA: localAppData,
      APPDATA: appData,
      USERPROFILE: userProfile,
      HOME: userProfile,
    } as NodeJS.ProcessEnv);
    expect(paths[0]).toBe("/explicit/hermes.env");
    expect(paths).toContain(join(hermesHome, ".env"));
    expect(paths).toContain(join(userProfile, ".hermes", ".env"));
    expect(paths).toContain(join(localAppData, "hermes", ".env"));
    expect(paths).toContain(join(appData, "hermes", ".env"));
  });

  it("openHumanTokenCandidatePaths covers workspace, home, AppData, and XDG roots", () => {
    const workspace = join("/opt", "oh-ws");
    const userProfile = join("C:", "Users", "alice");
    const localAppData = join(userProfile, "AppData", "Local");
    const xdgData = join("/var", "xdg-data");
    const paths = _backendTest.openHumanTokenCandidatePaths({
      OPENHUMAN_TOKEN_FILE: "/explicit/core.token",
      OPENHUMAN_WORKSPACE: workspace,
      OPENHUMAN_HOME: join("/opt", "oh-home"),
      USERPROFILE: userProfile,
      HOME: userProfile,
      LOCALAPPDATA: localAppData,
      XDG_DATA_HOME: xdgData,
    } as NodeJS.ProcessEnv);
    expect(paths[0]).toBe("/explicit/core.token");
    expect(paths).toContain(join(workspace, "core.token"));
    expect(paths).toContain(join("/opt", "oh-home", "core.token"));
    expect(paths).toContain(join(userProfile, ".openhuman", "core.token"));
    expect(paths).toContain(join(userProfile, ".openhuman-staging", "core.token"));
    expect(paths).toContain(join(localAppData, "openhuman", "core.token"));
    expect(paths).toContain(join(xdgData, "openhuman", "core.token"));
  });

  it("openHumanEnvCandidatePaths and staging root prefer OPENHUMAN_APP_ENV", () => {
    const home = join("/home", "dev");
    const stagingDirs = _backendTest.openHumanWorkspaceCandidateDirs({
      HOME: home,
      USERPROFILE: home,
      OPENHUMAN_APP_ENV: "staging",
    } as NodeJS.ProcessEnv);
    const staging = join(home, ".openhuman-staging");
    const prod = join(home, ".openhuman");
    expect(stagingDirs).toContain(staging);
    expect(stagingDirs).toContain(prod);
    expect(stagingDirs.indexOf(staging)).toBeLessThan(stagingDirs.indexOf(prod));

    const envPaths = _backendTest.openHumanEnvCandidatePaths({
      OPENHUMAN_ENV_FILE: "/explicit/openhuman.env",
      OPENHUMAN_WORKSPACE: join("/ws", "oh"),
    } as NodeJS.ProcessEnv);
    expect(envPaths[0]).toBe("/explicit/openhuman.env");
    expect(envPaths).toContain(join("/ws", "oh", ".env"));
  });

  it("readOpenHumanActiveUserId parses active_user.toml", () => {
    expect(_backendTest.readOpenHumanActiveUserId('user_id = "abc123"\n')).toBe("abc123");
    expect(_backendTest.readOpenHumanActiveUserId("nope")).toBeUndefined();
  });

  it("parseOpenHumanKeychainTokenPayload reads token field", () => {
    expect(
      _backendTest.parseOpenHumanKeychainTokenPayload(
        JSON.stringify({ token: "abc", access_token: null }),
      ),
    ).toBe("abc");
    expect(_backendTest.parseOpenHumanKeychainTokenPayload("plain-bearer")).toBe("plain-bearer");
    expect(_backendTest.parseOpenHumanKeychainTokenPayload("{}")).toBeUndefined();
  });

  it("openHumanApiKeyFileCandidates includes EnvoyMesh cache paths", () => {
    const home = join("/home", "dev");
    const paths = _backendTest.openHumanApiKeyFileCandidates({
      OPENHUMAN_API_KEY_FILE: "/explicit/key",
      HOME: home,
      USERPROFILE: home,
      LOCALAPPDATA: join(home, "AppData", "Local"),
    } as NodeJS.ProcessEnv);
    expect(paths[0]).toBe("/explicit/key");
    expect(paths).toContain(join(home, ".envoymesh", "openhuman.api-key"));
    expect(paths).toContain(join(home, "AppData", "Local", "EnvoyMesh", "openhuman.api-key"));
  });

  it("openHumanTransport prefers rpc when bearer set, else v1", () => {
    const prevTransport = process.env.OPENHUMAN_TRANSPORT;
    const prevRpc = process.env.OPENHUMAN_CORE_TOKEN;
    const prevApi = process.env.OPENHUMAN_API_KEY;
    const prevAuto = process.env.OPENHUMAN_AUTO_PROVISION_API_KEY;
    try {
      process.env.OPENHUMAN_AUTO_PROVISION_API_KEY = "0";
      delete process.env.OPENHUMAN_TRANSPORT;
      delete process.env.OPENHUMAN_CORE_TOKEN;
      delete process.env.OPENHUMAN_RPC_TOKEN;
      delete process.env.OPENHUMAN_API_KEY;
      expect(_backendTest.openHumanTransport()).toBe("v1");

      process.env.OPENHUMAN_CORE_TOKEN = "rpc-secret";
      expect(_backendTest.openHumanTransport()).toBe("rpc");

      process.env.OPENHUMAN_TRANSPORT = "v1";
      expect(_backendTest.openHumanTransport()).toBe("v1");
    } finally {
      if (prevTransport === undefined) delete process.env.OPENHUMAN_TRANSPORT;
      else process.env.OPENHUMAN_TRANSPORT = prevTransport;
      if (prevRpc === undefined) delete process.env.OPENHUMAN_CORE_TOKEN;
      else process.env.OPENHUMAN_CORE_TOKEN = prevRpc;
      if (prevApi === undefined) delete process.env.OPENHUMAN_API_KEY;
      else process.env.OPENHUMAN_API_KEY = prevApi;
      if (prevAuto === undefined) delete process.env.OPENHUMAN_AUTO_PROVISION_API_KEY;
      else process.env.OPENHUMAN_AUTO_PROVISION_API_KEY = prevAuto;
    }
  });

  it("isExtAgentSidecarKind only hermes/openhuman", () => {
    expect(isExtAgentSidecarKind("hermes")).toBe(true);
    expect(isExtAgentSidecarKind("openhuman")).toBe(true);
    expect(isExtAgentSidecarKind("homeclaw")).toBe(false);
  });
});

describe("ext-agent HTTP sidecar", () => {
  afterEach(async () => {
    await stopExtAgentSidecar();
    _resetExtAgentSidecarForTests();
    setPiExtAgentAsk(null);
    vi.unstubAllGlobals();
  });

  it("accepts /message and POSTs reply to bridge", async () => {
    const bridgePort = await getFreePort();
    const seen: Array<{ to: string; text: string }> = [];
    const bridge = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/bridge/send") {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.from(c)));
        req.on("end", () => {
          seen.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          res.writeHead(200).end(JSON.stringify({ ok: true }));
        });
        return;
      }
      res.writeHead(404).end();
    });
    await listen(bridge, bridgePort);

    const ask = vi.fn(async () => "pong");
    const handle = await startExtAgentHttpServer(
      {
        kind: "hermes",
        label: "test",
        ask,
        probe: async () => true,
      },
      {
        host: "127.0.0.1",
        port: await getFreePort(),
        bridgeSendUrl: `http://127.0.0.1:${bridgePort}/bridge/send`,
      },
    );

    try {
      const resp = await fetch(`http://127.0.0.1:${handle.port}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "12D3Sender",
          fromOwnerId: "envoy:owner:test",
          text: "ping",
          messageId: "m1",
        }),
      });
      expect(resp.status).toBe(200);
      expect(await resp.json()).toEqual({ status: "accepted", text: null });

      await vi.waitFor(() => expect(seen.length).toBe(1));
      expect(seen[0]).toEqual({ to: "12D3Sender", text: "pong" });
      expect(ask).toHaveBeenCalledWith("ping", "envoy:owner:test");
    } finally {
      await handle.stop();
      await close(bridge);
    }
  });

  it("syncExtAgentSidecar starts hermes and stops for homeclaw", async () => {
    process.env.ENVOYMESH_HERMES_PORT = String(await getFreePort());

    await syncExtAgentSidecar({
      bridgeEnabled: true,
      activeExtAgentId: "hermes",
      bridgeListenPort: 3031,
    });
    const running = getRunningExtAgentSidecar();
    expect(running?.kind).toBe("hermes");
    expect(running?.port).toBe(Number(process.env.ENVOYMESH_HERMES_PORT));

    await syncExtAgentSidecar({
      bridgeEnabled: true,
      activeExtAgentId: "homeclaw",
      bridgeListenPort: 3031,
    });
    expect(getRunningExtAgentSidecar()).toBeNull();
    delete process.env.ENVOYMESH_HERMES_PORT;
  });

  it("syncExtAgentSidecar starts pi sidecar", async () => {
    process.env.ENVOYMESH_PI_EXT_PORT = String(await getFreePort());
    expect(isExtAgentSidecarKind("pi")).toBe(true);

    await syncExtAgentSidecar({
      bridgeEnabled: true,
      activeExtAgentId: "pi",
      bridgeListenPort: 3031,
    });
    const running = getRunningExtAgentSidecar();
    expect(running?.kind).toBe("pi");
    expect(running?.port).toBe(Number(process.env.ENVOYMESH_PI_EXT_PORT));

    await stopExtAgentSidecar();
    expect(getRunningExtAgentSidecar()).toBeNull();
    delete process.env.ENVOYMESH_PI_EXT_PORT;
  });

  it("createPiBackend uses registered ask", async () => {
    setPiExtAgentAsk(async (text) => `echo:${text}`);
    try {
      const { createPiBackend } = await import("../src/ext-agent-adapter/index.js");
      const backend = createPiBackend();
      expect(backend.kind).toBe("pi");
      expect(await backend.ask("hi", "sess")).toBe("echo:hi");
      expect(await backend.probe?.()).toBe(true);
    } finally {
      setPiExtAgentAsk(null);
    }
  });
});

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (!addr || typeof addr === "string") {
        s.close();
        reject(new Error("no port"));
        return;
      }
      const port = addr.port;
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function listen(server: ReturnType<typeof createServer>, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}
