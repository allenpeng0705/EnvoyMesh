#!/usr/bin/env node
/**
 * `envoy-reuse-host` — the runnable form of the second product.
 *
 * The package proved a non-social host is *buildable* from the reusable layer;
 * this proves it is *runnable*: `npx envoy-reuse-host --token … --owner-id …`
 * starts a host, prints the URL, and prints the pairing URI a QR code would
 * carry.
 *
 * ## What it serves
 *
 * Three methods, which is the honest size of a host whose product has not been
 * written yet — and enough to prove the path end to end:
 *
 *   * `ping`   → `"pong"` (unauthenticated; see `--pre-auth`)
 *   * `whoami` → the session the transport resolved from the connect URL's token
 *   * `hostInfo` → version, bind address, and the transport's own status
 *
 * Everything else is the product's. There is no store, no profile directory and
 * no identity model here: the identity arrives on the command line.
 *
 * ## Why the CLI is a function, not a script
 *
 * `runReuseHostCli(argv, io)` returns `{ code, host }` and writes through an
 * injected `io`, so the tests exercise the real argument parsing and the real
 * startup path without spawning a process or opening a socket they cannot close.
 * The `import.meta` guard at the bottom is what makes the same file a CLI.
 */

import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { pathToFileURL } from "node:url";
import { ENVOYMESH_VERSION } from "@envoymesh/protocol";
import {
  createReuseHost,
  type HostNodeService,
  type HostRpcDispatcher,
  type ReuseHost,
  type SessionIdentityResolver,
} from "./index.js";

export interface CliIo {
  out: (line: string) => void;
  err: (line: string) => void;
}

const defaultIo: CliIo = {
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

const USAGE = [
  "envoy-reuse-host — a mesh host, built only from EnvoyMesh's reusable layer",
  "",
  "Usage: envoy-reuse-host [options]",
  "",
  "  --port <n>            port to bind (default 3030; 0 picks a free one)",
  "  --path <p>            WebSocket path (default /ws)",
  "  --token <t>           session token clients must present (required)",
  "  --owner-id <id>       owner id for the pairing payload",
  "  --owner-public-key <p>  owner public key (PEM) for the pairing payload",
  "  --owner-public-key-file <f>  read the PEM from a file (a PEM is multi-line)",
  "  --name <label>        human-readable name shown before pairing completes",
  "  --pre-auth <method>   allow a method before authentication (repeatable)",
  "  --help                print this",
  "",
  "The host serves ping / whoami / hostInfo. Everything else belongs to a product.",
].join("\n");

interface ParsedArgs {
  port: number;
  path: string;
  token: string;
  ownerId?: string;
  ownerPublicKey?: string;
  ownerPublicKeyFile?: string;
  name?: string;
  preAuth: string[];
}

function parseArgs(argv: string[]): { ok: true; args: ParsedArgs } | { ok: false; error: string } {
  const args: ParsedArgs = { port: 3030, path: "/ws", token: "", preAuth: [] };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    // A value is only "missing" when there is none. An earlier version also
    // rejected anything starting with `--`, which made a PEM public key
    // (`-----BEGIN PUBLIC KEY-----`) impossible to pass — found by running the
    // CLI rather than by reading it.
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      i++;
      return next;
    };
    try {
      switch (flag) {
        case "--port": {
          const raw = Number(value());
          if (!Number.isInteger(raw) || raw < 0 || raw > 65535) throw new Error(`--port must be 0-65535`);
          args.port = raw;
          break;
        }
        case "--path":
          args.path = value();
          break;
        case "--token":
          args.token = value();
          break;
        case "--owner-id":
          args.ownerId = value();
          break;
        case "--owner-public-key":
          args.ownerPublicKey = value();
          break;
        case "--owner-public-key-file":
          args.ownerPublicKeyFile = value();
          break;
        case "--name":
          args.name = value();
          break;
        case "--pre-auth":
          args.preAuth.push(value());
          break;
        default:
          return { ok: false, error: `unknown option: ${flag}` };
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
  if (!args.token) return { ok: false, error: "--token is required" };
  if (args.ownerPublicKeyFile) {
    try {
      args.ownerPublicKey = readFileSync(args.ownerPublicKeyFile, "utf8").trim();
    } catch (err) {
      return {
        ok: false,
        error: `could not read --owner-public-key-file: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  return { ok: true, args };
}

/** The host surface: three methods, no stores. */
export function createCliDispatcher(): HostRpcDispatcher {
  return async (method, _params, session) => {
    switch (method) {
      case "ping":
        return "pong";
      case "whoami":
        return {
          scopeKey: session?.scopeKey ?? null,
          ownerId: session?.ownerId ?? null,
          isOwnerScope: session?.isOwnerScope ?? false,
          deviceId: session?.deviceId ?? null,
        };
      case "hostInfo":
        return { version: ENVOYMESH_VERSION, product: "reuse-host" };
      default:
        throw new Error(`unknown method: ${method}`);
    }
  };
}

export interface CliResult {
  code: number;
  host?: ReuseHost;
}

/**
 * Resolve a concrete free port for `--port 0`.
 *
 * The host cannot report the port the OS chose — `WsServer` binds a number it was
 * given and exposes no bound-port accessor — so a host started on `0` would print
 * `ws://127.0.0.1:0/ws` and a pairing URI nobody could dial. Picking the port here
 * keeps the printed URL true. (Running the CLI is how this was found: the unit
 * tests asserted the *shape* of the URL, not that its port was reachable.)
 */
async function resolveFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Run the CLI. Returns the exit code and (when it started) the live host, which
 * the caller is responsible for stopping — the tests do exactly that.
 */
export async function runReuseHostCli(argv: string[], io: Partial<CliIo> = {}): Promise<CliResult> {
  const out = io.out ?? defaultIo.out;
  const err = io.err ?? defaultIo.err;

  if (argv.includes("--help") || argv.includes("-h")) {
    out(USAGE);
    return { code: 0 };
  }

  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    err(`envoy-reuse-host: ${parsed.error}`);
    err("");
    err(USAGE);
    return { code: 2 };
  }
  const args = parsed.args;

  const sessionIdentity: SessionIdentityResolver = {
    localScopeKey: "local",
    resolveSession: async (token) =>
      token === args.token
        ? { scopeKey: "local", ownerId: args.ownerId ?? "local", isOwnerScope: true, caller: undefined }
        : null,
  };

  const nodeService: HostNodeService = {
    on: () => undefined,
    onCallEvent: () => () => undefined,
    getNodeStatus: () => "running",
    getConnectionStatus: () => ({ peerId: "", multiaddrs: [] }),
    noteClientActivity: () => undefined,
  };

  const port = args.port === 0 ? await resolveFreePort() : args.port;

  const host = createReuseHost({
    port,
    path: args.path,
    ...(args.name ? { displayName: args.name } : {}),
    sessionIdentity,
    dispatch: createCliDispatcher(),
    ...(args.preAuth.length ? { preAuthMethods: args.preAuth } : {}),
  });

  try {
    host.serve(nodeService);
  } catch (e) {
    err(`envoy-reuse-host: could not start: ${e instanceof Error ? e.message : String(e)}`);
    return { code: 1 };
  }

  out(`envoy-reuse-host ${ENVOYMESH_VERSION} listening on ws://127.0.0.1:${port}${args.path}`);
  out("methods: ping, whoami, hostInfo");
  if (args.ownerId && args.ownerPublicKey) {
    out("");
    out("Pairing URI (encode this as a QR code):");
    out(
      `  ${host.pairingUri(args.token, { ownerId: args.ownerId, ownerPublicKey: args.ownerPublicKey })}`,
    );
  } else {
    out("");
    out("--owner-id and --owner-public-key were not both given, so no pairing URI was printed.");
  }
  out("");
  out("Press Ctrl-C to stop.");

  return { code: 0, host };
}

// Run only when invoked as a program, so the tests can import the function above.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runReuseHostCli(process.argv.slice(2));
  if (result.host) {
    const stop = () => {
      result.host?.stop();
      process.exit(0);
    };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  } else {
    process.exit(result.code);
  }
}
