/**
 * Spawn `envoy-harness --acp` and attach a TuiSession.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnAcpServer, } from "@envoymesh/envoy-harness-client";
import { TuiSession } from "./session.js";
/** Resolve `envoy-harness --acp` for monorepo + installed layouts. */
export function resolveHarnessAcpCommand(extraArgs = []) {
    const harnessArgs = ["--acp", ...extraArgs];
    if (process.env.ENVOY_HARNESS_BIN) {
        return { command: process.env.ENVOY_HARNESS_BIN, args: harnessArgs };
    }
    const here = path.dirname(fileURLToPath(import.meta.url));
    const siblingTs = path.resolve(here, "../../envoy-harness/bin/envoy-harness.ts");
    if (existsSync(siblingTs)) {
        return {
            command: process.execPath,
            args: ["--import", "tsx", siblingTs, ...harnessArgs],
        };
    }
    return { command: "envoy-harness", args: harnessArgs };
}
/** Spawn harness `--acp` and return an attached TuiSession. */
export function createSpawnedTui(options = {}) {
    const resolved = options.command !== undefined
        ? { command: options.command, args: options.args ?? ["--acp"] }
        : resolveHarnessAcpCommand(options.harnessArgs);
    let sessionRef;
    const spawned = spawnAcpServer({
        command: resolved.command,
        args: resolved.args,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.env !== undefined ? { env: options.env } : {}),
        ...(options.stderr !== undefined ? { stderr: options.stderr } : {}),
        onPermissionRequest: async (req) => {
            if (sessionRef === undefined)
                return "deny";
            return sessionRef.handlePermissionRequest(req);
        },
    });
    const session = new TuiSession({
        client: spawned.client,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.initialAutoRun !== undefined
            ? { initialAutoRun: options.initialAutoRun }
            : {}),
        ...(options.onPermission !== undefined
            ? { onPermission: options.onPermission }
            : {}),
    });
    sessionRef = session;
    return {
        session,
        close() {
            session.close();
            spawned.close();
        },
    };
}
//# sourceMappingURL=spawn.js.map