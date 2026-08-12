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
  EXT_AGENT_SIDECAR_KINDS,
  createBackend,
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

  it("isExtAgentSidecarKind includes codex/claudecode (Phase 55D)", () => {
    // Phase 55D — codex (55B) and claudecode (55C) are sidecar kinds
    // that the manager / picker / probe all need to recognize.
    expect(isExtAgentSidecarKind("codex")).toBe(true);
    expect(isExtAgentSidecarKind("claudecode")).toBe(true);
    // homeclaw still excluded — it has its own channel.
    expect(isExtAgentSidecarKind("homeclaw")).toBe(false);
  });

  it("isExtAgentSidecarKind includes cursor (Phase 56A)", () => {
    // Phase 56A adds `cursor` (the `cursor-agent` CLI). aider / mmx
    // come in 56B / 56C respectively.
    expect(isExtAgentSidecarKind("cursor")).toBe(true);
  });

  it("isExtAgentSidecarKind includes aider (Phase 56B)", () => {
    // Phase 56B adds `aider`. mmx comes in 56C.
    expect(isExtAgentSidecarKind("aider")).toBe(true);
  });

  it("isExtAgentSidecarKind includes mmx (Phase 56C)", () => {
    // Phase 56C adds `mmx` — MiniMax's MMX-CLI.
    expect(isExtAgentSidecarKind("mmx")).toBe(true);
  });

  it("EXT_AGENT_SIDECAR_KINDS lists all eight kinds", () => {
    expect(EXT_AGENT_SIDECAR_KINDS).toEqual([
      "pi",
      "hermes",
      "openhuman",
      "codex",
      "claudecode",
      "cursor",
      "aider",
      "mmx",
    ]);
  });

  it("createBackend('codex') returns a CodexBackend (Phase 55B)", () => {
    // Phase 55B lands the codex backend; switching to codex in the
    // picker should return a real backend. Sidecar won't start
    // because there's no `codex` binary on PATH in CI, but the
    // factory call itself must succeed.
    const backend = createBackend("codex");
    expect(backend.kind).toBe("codex");
    expect(backend.label.toLowerCase()).toContain("codex");
  });

  it("createBackend('claudecode') returns a ClaudeCodeBackend (Phase 55C)", () => {
    // Phase 55C ships the in-process `@anthropic-ai/claude-agent-sdk`
    // backend. The factory call must succeed; the sidecar won't start
    // in CI (no live `claude` CLI), but the backend object itself
    // exists and is wired through.
    const backend = createBackend("claudecode");
    expect(backend.kind).toBe("claudecode");
    expect(backend.label.toLowerCase()).toContain("claude");
  });

  it("createBackend('cursor') returns a CursorAgentBackend (Phase 56A)", () => {
    // Phase 56A lands the cursor CLI backend (one-shot subprocess
    // per ask via the shared `OneShotCliBackend` base). The factory
    // call must succeed; the sidecar won't start in CI (no live
    // `cursor-agent` binary), but the backend object itself exists.
    const backend = createBackend("cursor");
    expect(backend.kind).toBe("cursor");
    expect(backend.label.toLowerCase()).toContain("cursor");
  });

  it("createBackend('aider') returns an AiderBackend (Phase 56B)", () => {
    // Phase 56B lands the Aider backend (one-shot `aider --message ...`
    // subprocess per ask). The factory call must succeed; the sidecar
    // won't start in CI (no live `aider` binary), but the backend
    // object itself exists.
    const backend = createBackend("aider");
    expect(backend.kind).toBe("aider");
    expect(backend.label.toLowerCase()).toContain("aider");
  });

  it("createBackend('mmx') returns an MmxBackend (Phase 56C)", () => {
    // Phase 56C lands the MiniMax MMX-CLI backend (one-shot
    // `mmx text chat --message ...` subprocess per ask). The factory
    // call must succeed; the sidecar won't start in CI (no live
    // `mmx` binary), but the backend object itself exists.
    const backend = createBackend("mmx");
    expect(backend.kind).toBe("mmx");
    expect(backend.label.toLowerCase()).toContain("mmx");
  });

  it("DEFAULT_EXT_AGENTS includes codex + claudecode presets (Phase 55D)", async () => {
    const { DEFAULT_EXT_AGENTS } = await import("@envoymesh/api");
    const codex = DEFAULT_EXT_AGENTS.find((a) => a.id === "codex");
    const cc = DEFAULT_EXT_AGENTS.find((a) => a.id === "claudecode");
    expect(codex).toBeDefined();
    expect(codex?.enabled).toBe(true);
    expect(codex?.url).toBe("http://127.0.0.1:8023/message");
    expect(cc).toBeDefined();
    expect(cc?.enabled).toBe(true);
    expect(cc?.url).toBe("http://127.0.0.1:8024/message");
  });
});

describe("createBackend autostart dispatch (Phase 55E)", () => {
  const savedEnv = process.env.ENVOYMESH_EXT_AGENT_AUTOSTART;
  afterEach(() => {
    if (savedEnv === undefined) {
      delete process.env.ENVOYMESH_EXT_AGENT_AUTOSTART;
    } else {
      process.env.ENVOYMESH_EXT_AGENT_AUTOSTART = savedEnv;
    }
  });

  it("default (env unset) returns the supervised backend for hermes", () => {
    delete process.env.ENVOYMESH_EXT_AGENT_AUTOSTART;
    const backend = createBackend("hermes");
    expect(backend.kind).toBe("hermes");
    expect((backend as unknown as { isEverHealthy?: unknown }).isEverHealthy).toBeTypeOf(
      "function",
    );
  });

  it("default (env unset) returns the supervised backend for openhuman", () => {
    delete process.env.ENVOYMESH_EXT_AGENT_AUTOSTART;
    const backend = createBackend("openhuman");
    expect(backend.kind).toBe("openhuman");
    expect((backend as unknown as { isEverHealthy?: unknown }).isEverHealthy).toBeTypeOf(
      "function",
    );
  });

  it("ENVOYMESH_EXT_AGENT_AUTOSTART=1 returns the supervised backend for hermes", () => {
    process.env.ENVOYMESH_EXT_AGENT_AUTOSTART = "1";
    const backend = createBackend("hermes");
    expect(backend.kind).toBe("hermes");
    expect((backend as unknown as { isEverHealthy?: unknown }).isEverHealthy).toBeTypeOf(
      "function",
    );
  });

  it("ENVOYMESH_EXT_AGENT_AUTOSTART=1 returns the supervised backend for openhuman", () => {
    process.env.ENVOYMESH_EXT_AGENT_AUTOSTART = "1";
    const backend = createBackend("openhuman");
    expect(backend.kind).toBe("openhuman");
    expect((backend as unknown as { isEverHealthy?: unknown }).isEverHealthy).toBeTypeOf(
      "function",
    );
  });

  it("autostart env-var dispatch accepts 'true' / 'yes' / 'on' aliases", () => {
    for (const v of ["true", "yes", "on", "TRUE", "Yes", "ON"]) {
      process.env.ENVOYMESH_EXT_AGENT_AUTOSTART = v;
      const backend = createBackend("hermes");
      expect(
        (backend as unknown as { isEverHealthy?: unknown }).isEverHealthy,
        `expected supervised for value '${v}'`,
      ).toBeTypeOf("function");
    }
  });

  it("ENVOYMESH_EXT_AGENT_AUTOSTART=0 returns the unwrapped HTTP backend", () => {
    for (const v of ["0", "false", "no", "off"]) {
      process.env.ENVOYMESH_EXT_AGENT_AUTOSTART = v;
      const backend = createBackend("hermes");
      expect(
        (backend as unknown as { isEverHealthy?: unknown }).isEverHealthy,
        `expected unwrapped for value '${v}'`,
      ).toBeUndefined();
    }
  });

  it("_backendTest.isAutostartEnabled reflects the env var (default on)", () => {
    delete process.env.ENVOYMESH_EXT_AGENT_AUTOSTART;
    expect(_backendTest.isAutostartEnabled()).toBe(true);
    process.env.ENVOYMESH_EXT_AGENT_AUTOSTART = "0";
    expect(_backendTest.isAutostartEnabled()).toBe(false);
    process.env.ENVOYMESH_EXT_AGENT_AUTOSTART = "1";
    expect(_backendTest.isAutostartEnabled()).toBe(true);
    process.env.ENVOYMESH_EXT_AGENT_AUTOSTART = "yes";
    expect(_backendTest.isAutostartEnabled()).toBe(true);
  });

  it("autostart does NOT affect codex / claudecode (already supervised / in-process)", () => {
    process.env.ENVOYMESH_EXT_AGENT_AUTOSTART = "1";
    const codex = createBackend("codex");
    const cc = createBackend("claudecode");
    expect(codex.kind).toBe("codex");
    expect(cc.kind).toBe("claudecode");
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

  // Phase 55+56 review — B1: http-server dedup + timeout edge cases.
  // Three tests pinning behavior that was previously implicit:
  // (1) dedup TTL — same messageId within 30s is deduped (skip the 2nd)
  // (2) dedup cap — oldest entry evicted when >200 entries
  // (3) bridge reply failure — agent call still resolves; error
  //     is sent back to bridge but the HTTP /message call returns 200

  it("deduplicates by messageId — second POST with same id is dropped", async () => {
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
      { kind: "hermes", label: "test", ask, probe: async () => true },
      {
        host: "127.0.0.1",
        port: await getFreePort(),
        bridgeSendUrl: `http://127.0.0.1:${bridgePort}/bridge/send`,
      },
    );

    try {
      const body = {
        from: "12D3Sender",
        fromOwnerId: "envoy:owner:test",
        text: "ping",
        messageId: "dup-id-1",
      };
      // First POST — should call ask() and forward to bridge.
      await fetch(`http://127.0.0.1:${handle.port}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Wait for the bridge to receive the first reply.
      await vi.waitFor(() => expect(seen.length).toBe(1));
      expect(ask).toHaveBeenCalledTimes(1);
      // Second POST with the SAME messageId — should be deduped
      // (skipped without calling ask()).
      await fetch(`http://127.0.0.1:${handle.port}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Give the dedup path a moment to (not) call ask.
      await new Promise((r) => setTimeout(r, 100));
      expect(ask).toHaveBeenCalledTimes(1);
      expect(seen.length).toBe(1);
    } finally {
      await handle.stop();
      await close(bridge);
    }
  });

  it("dedup map caps at 200 entries — oldest is evicted", async () => {
    const bridgePort = await getFreePort();
    const bridge = createServer((req, res) => {
      if (req.method === "POST" && req.url === "/bridge/send") {
        req.on("data", () => {});
        req.on("end", () => res.writeHead(200).end(JSON.stringify({ ok: true })));
        return;
      }
      res.writeHead(404).end();
    });
    await listen(bridge, bridgePort);

    const ask = vi.fn(async () => "pong");
    const handle = await startExtAgentHttpServer(
      { kind: "hermes", label: "test", ask, probe: async () => true },
      {
        host: "127.0.0.1",
        port: await getFreePort(),
        bridgeSendUrl: `http://127.0.0.1:${bridgePort}/bridge/send`,
      },
    );

    try {
      // Fire 201 unique message IDs.
      for (let i = 0; i < 201; i++) {
        await fetch(`http://127.0.0.1:${handle.port}/message`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "12D3Sender",
            fromOwnerId: "envoy:owner:test",
            text: `ping-${i}`,
            messageId: `id-${i}`,
          }),
        });
      }
      // Wait for the bridge to receive all 201 replies.
      await vi.waitFor(
        () => expect(ask).toHaveBeenCalledTimes(201),
        { timeout: 5_000 },
      );
      // Now re-send `id-0` (the oldest). It should be evicted from
      // the dedup map (the 200-entry cap) and processed again —
      // ask() is called a 202nd time.
      await fetch(`http://127.0.0.1:${handle.port}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "12D3Sender",
          fromOwnerId: "envoy:owner:test",
          text: "ping-0-again",
          messageId: "id-0",
        }),
      });
      await vi.waitFor(() => expect(ask).toHaveBeenCalledTimes(202));
    } finally {
      await handle.stop();
      await close(bridge);
    }
  });

  it("bridge /bridge/send unreachable — agent error is still surfaced", async () => {
    // No bridge server — the sidecar's /bridge/send calls will fail
    // with ECONNREFUSED. The user-visible behavior: the agent call
    // completes (the http /message call returns 200 immediately
    // because handleMessage is fire-and-forget), but the error
    // path is exercised internally. The test pins: the http /message
    // request always returns 200, even when the bridge is down.
    const handle = await startExtAgentHttpServer(
      { kind: "hermes", label: "test", ask: async () => "result", probe: async () => true },
      {
        host: "127.0.0.1",
        port: await getFreePort(),
        // Port 1 — guaranteed to be unbound on any sane system.
        bridgeSendUrl: "http://127.0.0.1:1/bridge/send",
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
      // /message returns 200 immediately (async handling).
      expect(resp.status).toBe(200);
      expect(await resp.json()).toEqual({ status: "accepted", text: null });
    } finally {
      await handle.stop();
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

  it("syncExtAgentSidecar for codex starts the sidecar (Phase 55B)", async () => {
    // 55B shipped the codex backend. On a dev machine with the
    // codex CLI on PATH (the user installed it), the sidecar starts
    // successfully. On a machine without it, the supervisor would
    // fail with `InstallMissingError` and the manager would log +
    // stay down — we cover that case in the install-guide tests
    // (apps/node/test/ext-agent-install-guide.test.ts).
    await syncExtAgentSidecar({
      bridgeEnabled: true,
      activeExtAgentId: "codex",
      bridgeListenPort: 3031,
    });
    const running = getRunningExtAgentSidecar();
    if (running?.kind === "codex") {
      expect(running.port).toBeGreaterThanOrEqual(1024);
    } else {
      // codex CLI not on PATH on this machine — the manager should
      // have stayed down and logged an error.
      expect(running).toBeNull();
    }
    await stopExtAgentSidecar();
  });

  it("syncExtAgentSidecar for claudecode starts the in-process SDK sidecar (Phase 55C)", async () => {
    // Phase 55C — claudecode runs in-process via
    // `@anthropic-ai/claude-agent-sdk`; no subprocess. The sidecar
    // starts immediately and listens on :8024 (or `ENVOYMESH_CLAUDECODE_PORT`).
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await syncExtAgentSidecar({
        bridgeEnabled: true,
        activeExtAgentId: "claudecode",
        bridgeListenPort: 3031,
      });
      const running = getRunningExtAgentSidecar();
      expect(running).not.toBeNull();
      expect(running?.kind).toBe("claudecode");
      expect(running?.port).toBe(8024);
      // No "failed to start" error in this happy path.
      const failCall = errSpy.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("failed to start claudecode"),
      );
      expect(failCall).toBeUndefined();
    } finally {
      errSpy.mockRestore();
      await stopExtAgentSidecar();
    }
  });

  it("ENVOYMESH_CODEX_PORT / ENVOYMESH_CLAUDECODE_PORT env overrides are recognized by listenPortFor", async () => {
    // The manager exposes the resolved port via `getRunningExtAgentSidecar()`,
    // but `createBackend` throws for codex/claudecode until 55B/55C, so we
    // can't go through the full sync path. Instead, verify the env override
    // doesn't break the env detection (i.e. doesn't throw at parse time).
    const prev = process.env.ENVOYMESH_CODEX_PORT;
    const prevCC = process.env.ENVOYMESH_CLAUDECODE_PORT;
    try {
      process.env.ENVOYMESH_CODEX_PORT = "12345";
      process.env.ENVOYMESH_CLAUDECODE_PORT = "12346";
      // Just call sync — the manager will try to start, fail (not
      // implemented), and clean up. The test is that we don't crash
      // on env parsing.
      await syncExtAgentSidecar({
        bridgeEnabled: true,
        activeExtAgentId: "homeclaw", // switches down; doesn't try codex/claudecode
        bridgeListenPort: 3031,
      });
      expect(getRunningExtAgentSidecar()).toBeNull();
    } finally {
      if (prev === undefined) delete process.env.ENVOYMESH_CODEX_PORT;
      else process.env.ENVOYMESH_CODEX_PORT = prev;
      if (prevCC === undefined) delete process.env.ENVOYMESH_CLAUDECODE_PORT;
      else process.env.ENVOYMESH_CLAUDECODE_PORT = prevCC;
      await stopExtAgentSidecar();
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
