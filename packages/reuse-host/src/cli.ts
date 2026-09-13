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
 *   * `ping`   → `"pong"`
 *   * `whoami` → the session the transport resolved from the connect URL's token
 *   * `hostInfo` → version, bind address, and the transport's own status
 *
 * Everything else is the product's. There is no store, no profile directory and
 * no identity model here: the identity arrives on the command line.
 *
 * ## What `--token` does and does not gate
 *
 * Measured against the running binary, because the help text used to imply access
 * control and the truth is narrower — and better:
 *
 *   * a token that **matches** → owner session (`whoami` reports `ownerId`, and
 *     `isOwnerScope: true`);
 *   * a token that is **present but wrong** → `UNAUTHORIZED`; it is refused rather
 *     than silently downgraded to anonymous, so a typo cannot pass as a stranger;
 *   * **no token** → no error, and an *anonymous* session (`scopeKey: null`). The
 *     transport's job is to say **who** is asking, never what they may do, so this
 *     CLI's dispatcher answers its three diagnostics and nothing else. A product
 *     writes its own dispatcher and decides what an anonymous caller may reach.
 *
 * Both halves matter for a second product: the token is not a capability, and the
 * identity (or its absence) reaches the dispatcher so policy can live there.
 *
 * ## Why the CLI is a function, not a script
 *
 * `runReuseHostCli(argv, io)` returns `{ code, host }` and writes through an
 * injected `io`, so the tests exercise the real argument parsing and the real
 * startup path without spawning a process or opening a socket they cannot close.
 * The `import.meta` guard at the bottom is what makes the same file a CLI.
 */

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { ENVOYMESH_VERSION } from "@envoymesh/protocol";
import { resolveHomeDir, resolveRunningNode } from "@envoymesh/node-core";
import { requestProductSession } from "./index.js";
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
  "  --port <n>            port to bind (default 0: a free port is picked and reported)",
  "  --path <p>            WebSocket path (default /ws)",
  "  --token <t>           session token clients present for the owner session (required)",
  "  --owner-id <id>       owner id for the pairing payload",
  "  --owner-public-key <p>  owner public key (PEM) for the pairing payload",
  "  --owner-public-key-file <f>  read the PEM from a file (a PEM is multi-line)",
  "  --name <label>        human-readable name shown before pairing completes",
  "  --home <dir>          shared EnvoyMesh home to look for a running node in",
  "  --product <name>      product name to attach as (default ReuseHost)",
  "  --standalone          always serve this host, even if a node is already running",
  "  --pre-auth <method>   allow a method before authentication (repeatable)",
  "  --help                print this",
  "",
  "The host serves ping / whoami / hostInfo. Everything else belongs to a product.",
].join("\n");

interface ParsedArgs {
  port: number;
  path: string;
  token: string;
  /** Shared EnvoyMesh home to look for a running node in; default: resolved. */
  home?: string;
  /** Attach as this product, when a node is already running. */
  product?: string;
  /** Always serve our own host, even when a node is running. */
  standalone: boolean;
  ownerId?: string;
  ownerPublicKey?: string;
  ownerPublicKeyFile?: string;
  name?: string;
  preAuth: string[];
}

/** Every flag this CLI accepts — used to tell an omitted value from a PEM. */
const KNOWN_FLAGS = new Set([
  "--port",
  "--path",
  "--token",
  "--owner-id",
  "--owner-public-key",
  "--owner-public-key-file",
  "--name",
  "--pre-auth",
  "--home",
  "--product",
  "--standalone",
  "--help",
  "-h",
]);

function parseArgs(argv: string[]): { ok: true; args: ParsedArgs } | { ok: false; error: string } {
  // Default to an ephemeral port, **not 3030**. 3030 is EnvoyMesh's own social port:
  // a second product defaulting to it means installing both and starting this one
  // either dies with `EADDRINUSE` or — worse, before S3 — takes the port and makes
  // EnvoyMesh's own liveness check believe its node is healthy. A host that reports
  // the port it bound (see `serve()`) has no reason to guess.
  const args: ParsedArgs = { port: 0, path: "/ws", token: "", preAuth: [], standalone: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    // A value is only "missing" when there is none. An earlier version also
    // rejected anything starting with `--`, which made a PEM public key
    // (`-----BEGIN PUBLIC KEY-----`) impossible to pass — found by running the
    // CLI rather than by reading it.
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      // ...but a *known flag* in value position means the value was omitted.
      // Taking it anyway silently ate both the flag and its value: `--token
      // --port 3030` set the token to `--port` and dropped `3030` entirely. A
      // PEM starts with `-----`, which is not a flag name, so it still passes.
      if (KNOWN_FLAGS.has(next)) throw new Error(`${flag} needs a value`);
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
        case "--home":
          args.home = value();
          break;
        case "--product":
          args.product = value();
          break;
        case "--standalone":
          args.standalone = true;
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
  /** Set when the CLI attached to a running node instead of serving its own host. */
  attached?: { grant: { scopeKey: string; ownerId: string; wsUrl: string }; node: { port: number; app: string; pid: number } };
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

  // ─── attach-first: the second product joins, it does not compete ──────────────
  //
  // This is the path the design calls D2, and the one that had no caller: a product on a
  // machine where a node is already running asks **that** node for a session of its own,
  // instead of starting a second mesh, holding a second copy of the key, or refusing to
  // start. `resolveRunningNode` only returns `running` for a node whose identity it
  // verified — the loser of a race for the lock is exactly who this is for.
  if (!args.standalone) {
    const home = args.home?.trim() || resolveHomeDir();
    const product = args.product?.trim() || "ReuseHost";
    try {
      const running = await resolveRunningNode(home);
      if (running.status === "running" && running.endpoint) {
        const grant = await requestProductSession(
          { port: running.endpoint.port, path: running.endpoint.path },
          { product, version: ENVOYMESH_VERSION },
        );
        out(
          `envoy-reuse-host ${ENVOYMESH_VERSION} attached to the running ${running.endpoint.app} ` +
            `(pid ${running.endpoint.pid}) instead of starting a second node.`,
        );
        out(`session scope: ${grant.scopeKey}`);
        out(`owner: ${grant.ownerId}`);
        out("");
        out("Connect with:");
        out(`  ${grant.wsUrl}`);
        out("");
        out("This host serves nothing of its own — see --standalone to force one.");
        return { code: 0, attached: { grant, node: running.endpoint } };
      }
      if (running.status !== "none") {
        out(
          `No usable node to attach to (${running.status}${running.reason ? `: ${running.reason}` : ""}); ` +
            "starting this host instead.",
        );
      }
    } catch (error) {
      // Attaching is best-effort: a node that refuses (an old build, a permission) must
      // not stop a product from serving its own surface.
      err(
        `Could not attach to the running node (${error instanceof Error ? error.message : String(error)}); ` +
          "starting this host instead.",
      );
    }
  }

  const host = createReuseHost({
    port: args.port,
    path: args.path,
    ...(args.name ? { displayName: args.name } : {}),
    sessionIdentity,
    dispatch: createCliDispatcher(),
    ...(args.preAuth.length ? { preAuthMethods: args.preAuth } : {}),
  });

  try {
    // Awaiting the bind is what makes `--port 0` work: `host.port` is the port
    // the OS chose, so neither the printed URL nor the pairing URI can carry
    // `:0`. It also means an occupied port reports here instead of printing a
    // URL for a host that is not listening.
    await host.serve(nodeService);
  } catch (e) {
    err(`envoy-reuse-host: could not start: ${e instanceof Error ? e.message : String(e)}`);
    return { code: 1 };
  }

  out(`envoy-reuse-host ${ENVOYMESH_VERSION} listening on ws://127.0.0.1:${host.port}${args.path}`);
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
