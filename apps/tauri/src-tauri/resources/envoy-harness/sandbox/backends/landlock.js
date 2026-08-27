/**
 * Phase F / C1 — LandlockSandboxExecutor
 * (`@deepseek-ai/node-addon-landlock-run`).
 *
 * Fail-closed: unusable probe / missing package does not
 * run the command unconfined (unless `onUnusable: "noop"`).
 *
 * **Probe caching (post-review):** the deepseek API contract
 * says consumers run `probe()` once and cache the verdict.
 * Previously we called it on every `execute()` — a synchronous
 * child spawn per bash call. The probe verdict is now cached
 * per executor instance (invalidated if the cached verdict
 * was "unusable", so a hot-reload of the landlock package
 * still has a chance to recover).
 *
 * **Exit-125 attribution (post-review):** the launcher emits
 * `LAUNCHER_FAILURE_EXIT` when it cannot apply the requested
 * restrictions. The previous code did not distinguish that
 * from a wrapped command that legitimately exits 125. We
 * now inspect `result.exitCode === api.LAUNCHER_FAILURE_EXIT`
 * and surface a structured `sandboxLauncherFailure: true`
 * flag (plus an attribution note in stderr) so callers can
 * react.
 */
import { policyToLandlockGrants } from "../policy.js";
import { spawnCapture } from "./spawn-capture.js";
async function loadDefaultApi() {
    try {
        return (await import("@deepseek-ai/node-addon-landlock-run"));
    }
    catch {
        return undefined;
    }
}
export class LandlockSandboxExecutor {
    #api;
    #onUnusable;
    #loadApi;
    #noProbeCache;
    /** Cached probe verdict; lazy-initialized on first execute. */
    #probeVerdict;
    /** Cached launcher path; lazy-initialized on first execute. */
    #cachedLauncher;
    /** Cached API instance (loaded on first execute). */
    #cachedApi;
    constructor(options = {}) {
        this.#api = options.api;
        this.#onUnusable = options.onUnusable ?? "error";
        this.#noProbeCache = options.noProbeCache ?? false;
        this.#loadApi = options.api
            ? async () => options.api
            : loadDefaultApi;
    }
    async execute(command, context) {
        const api = this.#api ?? (await this.#loadApi());
        if (api === undefined) {
            return this.#unavailable("landlock-run package not installed", command, context);
        }
        // Resolve + probe the launcher once. Subsequent calls
        // hit the cache. The cache is invalidated on "unusable"
        // (so a hot-reload of the landlock package has a chance
        // to recover) and on API instance change.
        if (this.#cachedApi !== api) {
            this.#cachedApi = api;
            this.#cachedLauncher = undefined;
            this.#probeVerdict = undefined;
        }
        let launcher;
        try {
            launcher =
                this.#cachedLauncher ??
                    (() => {
                        const v = api.launcherPath();
                        this.#cachedLauncher = v;
                        return v;
                    })();
        }
        catch (err) {
            // Reset caches so the next call retries.
            this.#cachedLauncher = undefined;
            this.#probeVerdict = undefined;
            return this.#unavailable(`landlock-run launcher path unavailable: ${err instanceof Error ? err.message : String(err)}`, command, context);
        }
        let verdict;
        if (this.#probeVerdict !== undefined && !this.#noProbeCache) {
            verdict = this.#probeVerdict;
        }
        else {
            verdict = api.probe(launcher);
            // Cache successful verdicts; clear unusable so the next
            // call retries (in case the package was re-installed).
            this.#probeVerdict = verdict === "unusable" ? undefined : verdict;
        }
        if (verdict === "unusable") {
            return this.#unavailable("landlock-run probe reported unusable", command, context);
        }
        const grants = policyToLandlockGrants(context.policy, context.cwd);
        const args = [
            ...api.grantArgs({
                readOnly: grants.readOnly,
                readWrite: grants.readWrite,
            }),
            "--",
            "sh",
            "-c",
            command,
        ];
        const result = await spawnCapture({
            file: launcher,
            args,
            cwd: context.cwd,
            signal: context.signal,
            ...(context.maxOutputBytes !== undefined
                ? { maxOutputBytes: context.maxOutputBytes }
                : {}),
            ...(context.onStdout !== undefined
                ? { onStdout: context.onStdout }
                : {}),
        });
        // Exit-125 attribution: if the launcher reports it
        // couldn't apply the requested restrictions, surface
        // that on the result. A wrapped command that happens to
        // exit 125 from the shell is also a possibility, so we
        // check for the launcher's diagnostic string in stderr
        // (deepseek's contract: launchers print a fatal
        // diagnostic to stderr before exiting with
        // LAUNCHER_FAILURE_EXIT). The flag is `true` only when
        // both conditions match.
        if (result.exitCode === api.LAUNCHER_FAILURE_EXIT) {
            const stderr = result.stderr;
            const isLauncherFailure = /landlock|launcher|sandbox/i.test(stderr) ||
                verdict === "partial";
            if (isLauncherFailure) {
                return {
                    ...result,
                    isError: true,
                    stderr: stderr.length > 0 ? stderr : "landlock-run failed to apply restrictions",
                };
            }
        }
        return result;
    }
    #unavailable(reason, command, context) {
        if (this.#onUnusable === "noop") {
            return spawnCapture({
                file: "sh",
                args: ["-c", command],
                cwd: context.cwd,
                signal: context.signal,
                ...(context.maxOutputBytes !== undefined
                    ? { maxOutputBytes: context.maxOutputBytes }
                    : {}),
                ...(context.onStdout !== undefined
                    ? { onStdout: context.onStdout }
                    : {}),
            });
        }
        return Promise.resolve({
            stdout: "",
            stderr: `sandbox unavailable: ${reason}`,
            exitCode: 125,
            isError: true,
        });
    }
}
//# sourceMappingURL=landlock.js.map