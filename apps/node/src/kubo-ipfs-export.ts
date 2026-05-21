/**
 * Kubo-aligned IPFS fingerprinting for EnvoyMesh (interop recipe v1).
 * Canonical CID MUST match mainline Kubo {@link https://github.com/ipfs/kubo}: `ipfs <args> <file>`
 * See docs/external-distribution-ipfs-plan.md §6.
 */
import {
  kuboCliAvailableSync,
  kuboSpawnSync,
  readKuboVersionSync,
  resolveIpfsPath,
} from "./kubo-ipfs-cli.js";

/** EnvoyMesh manifest / audit — bump only when CLI template below changes semantics. */
export const IPFSInteropRecipeV1Id = "kubo-ipfs-export-v1";

/**
 * Arguments appended after binary name `ipfs`, before trailing `<absoluteFilePath>` when adding a local file snapshot.
 */
export const KUBO_EXPORT_ADD_CLI_ARGS_V1 = ["add", "--cid-version", "1", "--pin=false", "-Q"] as const;

export function ipfsInteropRecipeV1CliTemplate(): string {
  return ["ipfs", ...KUBO_EXPORT_ADD_CLI_ARGS_V1, "<absoluteFile>"].join(" ");
}

export function kuboIpfsCliAvailableSync(profileDir?: string): boolean {
  return kuboCliAvailableSync(resolveIpfsPath(profileDir));
}

export function readKuboVersionNumberSync(profileDir?: string): string {
  return readKuboVersionSync(resolveIpfsPath(profileDir));
}

export interface KuboIpfsExportAddOutcome {
  ok: boolean;
  cid?: string;
  kuboVersion: string;
  stderr: string;
  errorHint?: string;
}

/**
 * Add a single vault file snapshot and return Kubo's quiet root CID (UnixFS-aligned).
 */
export function kuboIpfsAddFileInteropRecipeV1(
  absFilePath: string,
  profileDir?: string,
): KuboIpfsExportAddOutcome {
  const ipfsPath = resolveIpfsPath(profileDir);
  const kuboVersion = readKuboVersionSync(ipfsPath);

  const r = kuboSpawnSync([...KUBO_EXPORT_ADD_CLI_ARGS_V1, absFilePath], ipfsPath, {
    maxBuffer: 32 * 1024 * 1024,
  });

  if (r.error?.code === "ENOENT") {
    return {
      ok: false,
      kuboVersion,
      stderr: "",
      errorHint:
        "IPFS engine is not available. Restart EnvoyMesh or reinstall the desktop app with IPFS support.",
    };
  }

  const stderr = r.stderr.trim();
  if (r.status !== 0) {
    const tail = stderr || r.stdout.trim();
    return {
      ok: false,
      kuboVersion,
      stderr,
      errorHint:
        tail || `IPFS export failed (exit ${r.status ?? "unknown"}) — the IPFS engine may still be starting; try again.`,
    };
  }

  const cid = r.stdout.trim().split(/\s+/)[0]?.trim();

  if (!cid) {
    return {
      ok: false,
      kuboVersion,
      stderr,
      errorHint: "IPFS export produced no CID",
    };
  }

  return {
    ok: true,
    cid,
    kuboVersion,
    stderr,
  };
}
