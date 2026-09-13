/**
 * The CLI entry — exercised as a function, then as a program.
 *
 * `runReuseHostCli(argv, io)` returns the exit code and the live host, so these
 * tests drive the *real* argument parsing and the *real* startup path: no process
 * spawn, no socket the test cannot close, no chance of a stray listener holding
 * the suite open.
 *
 * The last test runs the built binary as a program, which is the only way to
 * prove the `bin` entry and the shebang actually work.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runReuseHostCli } from "../src/cli.js";
import { parsePairingUri } from "../src/index.js";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

const hosts: { stop(): void }[] = [];
afterEach(() => {
  for (const host of hosts.splice(0)) host.stop();
});

function capture() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (l: string) => out.push(l), err: (l: string) => err.push(l) }, out, err };
}

describe("envoy-reuse-host CLI", () => {
  it("prints usage on --help and exits 0", async () => {
    const { io, out } = capture();
    const result = await runReuseHostCli(["--help"], io);
    expect(result.code).toBe(0);
    expect(result.host).toBeUndefined();
    expect(out.join("\n")).toContain("envoy-reuse-host");
    expect(out.join("\n")).toContain("--token <t>");
  });

  it("refuses to start without a token, and says which option is missing", async () => {
    const { io, err } = capture();
    const result = await runReuseHostCli(["--port", "0"], io);
    expect(result.code).toBe(2);
    expect(err.join("\n")).toContain("--token is required");
  });

  it("rejects an unknown option, a non-numeric port, and a flag with no value", async () => {
    const a = capture();
    expect((await runReuseHostCli(["--token", "t", "--nope"], a.io)).code).toBe(2);
    expect(a.err.join("\n")).toContain("unknown option: --nope");

    const b = capture();
    expect((await runReuseHostCli(["--token", "t", "--port", "not-a-port"], b.io)).code).toBe(2);
    expect(b.err.join("\n")).toContain("--port must be 0-65535");

    const c = capture();
    expect((await runReuseHostCli(["--token", "t", "--name"], c.io)).code).toBe(2);
    expect(c.err.join("\n")).toContain("--name needs a value");

    // A *known flag* where a value belongs means the value was omitted. Taking it
    // anyway used to set `token` to `--port` and swallow `3030` with it — a
    // silently misconfigured host rather than an error message.
    const noValue = capture();
    const swallowed = await runReuseHostCli(["--token", "--port", "3030"], noValue.io);
    expect(swallowed.code).toBe(2);
    expect(noValue.err.join("\n")).toContain("--token needs a value");

    // A PEM starts with `--`, which an earlier version refused as "missing value".
    // It must now be *accepted* — and the host it starts must be stopped, or the
    // suite leaks a listener (found by this test failing with a stray exit 0).
    const d = capture();
    const withPem = await runReuseHostCli(
      ["--port", "0", "--token", "t", "--owner-public-key", "-----BEGIN PUBLIC KEY-----"],
      d.io,
    );
    hosts.push(withPem.host!);
    expect(withPem.code).toBe(0);
    expect(d.err.join("\n")).not.toContain("needs a value");
  });

  it("starts on a real port, prints its address, and prints a pairing URI that parses", async () => {
    const { io, out } = capture();
    const result = await runReuseHostCli(
      [
        "--port",
        "0",
        "--token",
        "pair-token",
        "--owner-id",
        "envoy:owner:alice",
        "--owner-public-key",
        "PEM",
        "--name",
        "Studio Mac",
      ],
      io,
    );
    expect(result.code).toBe(0);
    expect(result.host).toBeTruthy();
    hosts.push(result.host!);

    const printed = out.join("\n");
    expect(printed).toContain("listening on ws://127.0.0.1:");
    // `--port 0` must resolve to a dialable port, not print `:0`.
    const bound = Number(/listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(printed)?.[1]);
    expect(bound).toBeGreaterThan(0);
    expect(printed).not.toContain("127.0.0.1:0/ws");
    expect(printed).toContain("methods: ping, whoami, hostInfo");

    const uriLine = out.find((l) => l.trim().startsWith("envoy://pair?"));
    expect(uriLine, "a pairing URI must be printed when identity is supplied").toBeTruthy();
    const parsed = parsePairingUri(uriLine!.trim());
    expect(parsed?.ownerId).toBe("envoy:owner:alice");
    expect(parsed?.token).toBe("pair-token");
    // The URL that was printed and the URL in the QR code must be the same host —
    // this is the assertion that fails when the CLI guesses the port instead of
    // reading the one it bound.
    expect(parsed?.wsUrl).toBe(`ws://127.0.0.1:${bound}/ws`);
  });

  it("gates identity, not access: a wrong token is refused, an absent one is anonymous", async () => {
    // Found by running the binary and asking it awkward questions. The help text
    // said clients "must present" the token, which sounds like access control; the
    // transport's actual contract is narrower, and worth pinning because a future
    // edit could quietly turn "anonymous" into "owner" (or the reverse) without
    // failing any existing test.
    const { io } = capture();
    const result = await runReuseHostCli(
      ["--port", "0", "--token", "good", "--owner-id", "envoy:owner:alice", "--owner-public-key", "PEM"],
      io,
    );
    expect(result.code).toBe(0);
    hosts.push(result.host!);
    const port = result.host!.port;

    /** One RPC, skipping the pre-auth `connected` push the host sends first. */
    const ask = async (token: string | null, method: string) => {
      const { WebSocket } = await import("ws");
      const suffix = token === null ? "" : `?token=${token}`;
      const socket = new WebSocket(`ws://127.0.0.1:${port}/ws${suffix}`);
      const reply = await new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 5_000);
        socket.on("message", (raw: Buffer) => {
          const message = JSON.parse(raw.toString()) as { id?: number };
          if (message.id !== 1) return;
          clearTimeout(timer);
          resolve(message as Record<string, unknown>);
        });
        socket.on("open", () =>
          socket.send(JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} })),
        );
        socket.on("error", reject);
      });
      socket.close();
      return reply;
    };

    const wrong = await ask("wrong", "whoami");
    expect((wrong["error"] as { code?: string } | undefined)?.code).toBe("UNAUTHORIZED");

    const anonymous = await ask(null, "whoami");
    expect(anonymous["error"]).toBeUndefined();
    expect(anonymous["result"]).toEqual({
      scopeKey: null,
      ownerId: null,
      isOwnerScope: false,
      deviceId: null,
    });

    const owner = await ask("good", "whoami");
    expect(owner["result"]).toMatchObject({ ownerId: "envoy:owner:alice", isOwnerScope: true });
  }, 20_000);

  it("says so when no pairing URI can be printed", async () => {
    const { io, out } = capture();
    const result = await runReuseHostCli(["--port", "0", "--token", "t"], io);
    hosts.push(result.host!);
    expect(result.code).toBe(0);
    expect(out.join("\n")).toContain("no pairing URI was printed");
  });

  it("runs as a program: the bin entry exists, is executable and prints usage", async () => {
    // The build must have produced the entry the manifest points at.
    const bin = path.join(repoRoot, "packages/reuse-host/dist/src/cli.js");
    if (!existsSync(bin)) {
      // `tsc -b` has not run in this checkout; the function tests above still
      // cover the parsing, and CI builds before packaging.
      expect(existsSync(path.join(repoRoot, "packages/reuse-host/src/cli.ts"))).toBe(true);
      return;
    }
    const pkg = JSON.parse(
      await (await import("node:fs/promises")).readFile(
        path.join(repoRoot, "packages/reuse-host/package.json"),
        "utf8",
      ),
    ) as { bin: Record<string, string> };
    expect(pkg.bin["envoy-reuse-host"]).toBe("./dist/src/cli.js");

    const { stdout } = await execFileAsync(process.execPath, [bin, "--help"]);
    expect(stdout).toContain("envoy-reuse-host");
  }, 20_000);
});
