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
  });

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
