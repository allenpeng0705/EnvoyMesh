/**
 * Phase C / Item 7 — in-memory {@link JobRegistry}.
 */
import { JobError } from "./types.js";
const DEFAULT_MAX_PER_OWNER = 10;
function isTerminal(status) {
    return (status === "completed" || status === "killed" || status === "failed");
}
function truncateBytes(text, limit) {
    if (limit === undefined)
        return text;
    const buf = Buffer.from(text, "utf8");
    if (buf.byteLength <= limit)
        return text;
    return buf.subarray(0, limit).toString("utf8") + "\n…[truncated]";
}
/** Create a process-local job registry. */
export function createLocalJobRegistry(options = {}) {
    const maxPerOwner = options.maxConcurrentJobsPerOwner ?? DEFAULT_MAX_PER_OWNER;
    const store = new Map();
    const counters = new Map();
    const doneListeners = new Set();
    let disposed = false;
    function assertNotDisposed() {
        if (disposed)
            throw new JobError("job registry disposed", "INVALID");
    }
    function snapshot(job) {
        const snap = {
            id: job.id,
            kind: job.kind,
            label: job.label,
            status: job.status,
            startedAt: job.startedAt,
        };
        if (job.outputLimitBytes !== undefined) {
            snap.outputLimitBytes = job.outputLimitBytes;
        }
        if (job.owner !== undefined)
            snap.owner = job.owner;
        if (job.detail !== undefined)
            snap.detail = job.detail;
        if (job.finishedAt !== undefined)
            snap.finishedAt = job.finishedAt;
        return snap;
    }
    function assertAccess(job, caller) {
        if (job.owner === undefined)
            return;
        if (caller === undefined || caller !== job.owner) {
            throw new JobError(`job '${job.id}' is owned by another session`, "FOREIGN_OWNER");
        }
    }
    function expect(id, caller) {
        const job = store.get(id);
        if (job === undefined) {
            throw new JobError(`job '${id}' not found`, "NOT_FOUND");
        }
        assertAccess(job, caller);
        return job;
    }
    function activeCount(owner) {
        let n = 0;
        for (const job of store.values()) {
            if (job.owner !== owner)
                continue;
            if (!isTerminal(job.status))
                n += 1;
        }
        return n;
    }
    function settle(job, outcome) {
        if (isTerminal(job.status))
            return;
        job.status = outcome.status;
        if (outcome.detail !== undefined)
            job.detail = outcome.detail;
        job.finishedAt = Date.now();
        const snap = snapshot(job);
        for (const w of job.waiters.splice(0)) {
            w.resolve(snap);
        }
        for (const listener of doneListeners) {
            try {
                listener(snap);
            }
            catch {
                // ignore
            }
        }
    }
    return {
        start(spec) {
            assertNotDisposed();
            if (spec.kind.length === 0) {
                throw new JobError("invalid job kind", "INVALID");
            }
            if (spec.label.length === 0) {
                throw new JobError("invalid job label", "INVALID");
            }
            if (spec.outputLimitBytes !== undefined &&
                (!Number.isSafeInteger(spec.outputLimitBytes) ||
                    spec.outputLimitBytes <= 0)) {
                throw new JobError("invalid outputLimitBytes", "INVALID");
            }
            if (activeCount(spec.owner) >= maxPerOwner) {
                throw new JobError(`background job limit reached (limit: ${maxPerOwner})`, "LIMIT");
            }
            const hooks = spec.run();
            const count = (counters.get(spec.kind) ?? 0) + 1;
            counters.set(spec.kind, count);
            const id = `${spec.kind}-${count}`;
            const job = {
                id,
                kind: spec.kind,
                label: spec.label,
                outputLimitBytes: spec.outputLimitBytes,
                owner: spec.owner,
                status: "running",
                detail: undefined,
                startedAt: Date.now(),
                finishedAt: undefined,
                hooks,
                waiters: [],
            };
            store.set(id, job);
            void hooks.done.then((outcome) => settle(job, outcome), (err) => settle(job, {
                status: "failed",
                detail: err instanceof Error ? err.message : String(err),
            }));
            return id;
        },
        list(caller) {
            assertNotDisposed();
            return [...store.values()]
                .filter((job) => job.owner === undefined ||
                (caller !== undefined && job.owner === caller))
                .map(snapshot);
        },
        get(id, caller) {
            assertNotDisposed();
            return snapshot(expect(id, caller));
        },
        read(id, caller) {
            assertNotDisposed();
            const job = expect(id, caller);
            const raw = job.hooks.readOutput?.() ?? "";
            return {
                text: truncateBytes(raw, job.outputLimitBytes),
                snapshot: snapshot(job),
            };
        },
        kill(id, caller, reason) {
            assertNotDisposed();
            const job = expect(id, caller);
            if (isTerminal(job.status))
                return "already-finished";
            job.hooks.cancel(reason);
            job.status = "stopping";
            if (reason !== undefined)
                job.detail = reason;
            return "requested";
        },
        async wait(id, timeoutMs, caller, signal) {
            assertNotDisposed();
            const job = expect(id, caller);
            if (isTerminal(job.status))
                return snapshot(job);
            return new Promise((resolve, reject) => {
                const waiter = { resolve, reject };
                job.waiters.push(waiter);
                const onAbort = () => {
                    const idx = job.waiters.indexOf(waiter);
                    if (idx >= 0)
                        job.waiters.splice(idx, 1);
                    reject(signal?.reason instanceof Error
                        ? signal.reason
                        : new JobError("wait aborted", "WAIT_TIMEOUT"));
                };
                if (signal !== undefined) {
                    if (signal.aborted) {
                        onAbort();
                        return;
                    }
                    signal.addEventListener("abort", onAbort, { once: true });
                }
                const timer = setTimeout(() => {
                    const idx = job.waiters.indexOf(waiter);
                    if (idx >= 0)
                        job.waiters.splice(idx, 1);
                    signal?.removeEventListener("abort", onAbort);
                    reject(new JobError(`wait timed out after ${timeoutMs}ms`, "WAIT_TIMEOUT"));
                }, timeoutMs);
                const origResolve = waiter.resolve;
                waiter.resolve = (snap) => {
                    clearTimeout(timer);
                    signal?.removeEventListener("abort", onAbort);
                    origResolve(snap);
                };
            });
        },
        onJobDone(listener) {
            doneListeners.add(listener);
            return () => {
                doneListeners.delete(listener);
            };
        },
        async disposeOwner(owner) {
            const owned = [...store.values()].filter((j) => j.owner === owner);
            for (const job of owned) {
                if (!isTerminal(job.status)) {
                    try {
                        job.hooks.cancel("owner disposed");
                        job.status = "stopping";
                    }
                    catch {
                        settle(job, {
                            status: "failed",
                            detail: "cancel threw during owner dispose",
                        });
                    }
                }
            }
            await Promise.all(owned.map((job) => isTerminal(job.status)
                ? Promise.resolve()
                : job.hooks.done.catch(() => undefined)));
            for (const job of owned)
                store.delete(job.id);
        },
        async dispose() {
            if (disposed)
                return;
            disposed = true;
            const all = [...store.values()];
            for (const job of all) {
                if (!isTerminal(job.status)) {
                    try {
                        job.hooks.cancel("registry disposed");
                    }
                    catch {
                        // ignore
                    }
                }
            }
            await Promise.all(all.map((job) => job.hooks.done.catch(() => undefined)));
            store.clear();
            doneListeners.clear();
        },
    };
}
//# sourceMappingURL=registry.js.map