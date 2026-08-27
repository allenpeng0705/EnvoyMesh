/**
 * Phase C / Item 9 — owner-fenced terminal session registry.
 *
 * Backends own PTY mechanics; this service owns ids,
 * publication, authorization, exclusive sends, and cleanup.
 * Owner is an opaque string (typically `session.id`).
 */
import { TerminalError } from "./types.js";
/** Create an in-process {@link TerminalSessionService}. */
export function createTerminalSessionService() {
    const backends = new Map();
    const sessions = new Map();
    const reservedNames = new Map();
    let nextId = 0;
    let disposing = false;
    function assertActive() {
        if (disposing) {
            throw new TerminalError("PTY service is disposing", "SERVICE_DISPOSING");
        }
    }
    function snapshot(record, motd) {
        const base = {
            sessionId: record.id,
            type: record.type,
            status: record.session.status(),
            ...(record.name !== undefined ? { name: record.name } : {}),
            ...(record.session.pid !== undefined
                ? { pid: record.session.pid }
                : {}),
        };
        if (motd !== undefined)
            return { ...base, motd };
        return base;
    }
    function expectOwned(owner, sessionId) {
        const record = sessions.get(sessionId);
        if (record === undefined) {
            throw new TerminalError(`unknown PTY session ${sessionId}`, "NO_SESSION");
        }
        if (record.owner !== owner) {
            throw new TerminalError(`PTY session ${sessionId} belongs to another owner`, "FOREIGN_SESSION");
        }
        return record;
    }
    function reserveName(owner, name) {
        if (name === undefined)
            return () => { };
        if (name.length === 0) {
            throw new Error("PTY session name must be non-empty");
        }
        for (const record of sessions.values()) {
            if (record.owner === owner && record.name === name) {
                throw new TerminalError(`PTY session name "${name}" already exists for this owner`, "DUPLICATE_NAME");
            }
        }
        const reserved = reservedNames.get(owner) ?? new Set();
        if (reserved.has(name)) {
            throw new TerminalError(`PTY session name "${name}" is already being created`, "DUPLICATE_NAME");
        }
        reserved.add(name);
        reservedNames.set(owner, reserved);
        return () => {
            reserved.delete(name);
            if (reserved.size === 0)
                reservedNames.delete(owner);
        };
    }
    async function closeRecords(records, reason) {
        const results = await Promise.allSettled(records.map(async (record) => {
            const closing = record.closing ?? record.session.close(reason);
            record.closing = closing;
            try {
                await closing;
                sessions.delete(record.id);
            }
            catch (error) {
                if (record.closing === closing)
                    record.closing = undefined;
                throw error;
            }
        }));
        const failures = results
            .filter((r) => r.status === "rejected")
            .map((r) => r.reason);
        if (failures.length > 0) {
            throw new AggregateError(failures, `failed to close ${failures.length} PTY session(s)`);
        }
    }
    return {
        registerBackend(backend) {
            assertActive();
            if (backend.type.length === 0) {
                throw new Error("pty backend type must be non-empty");
            }
            if (backends.has(backend.type)) {
                throw new TerminalError(`a PTY backend named "${backend.type}" is already registered`, "DUPLICATE_BACKEND");
            }
            backends.set(backend.type, backend);
            return () => {
                if (backends.get(backend.type) === backend) {
                    backends.delete(backend.type);
                }
            };
        },
        listBackends() {
            return [...backends.keys()];
        },
        async spawn(owner, request, signal) {
            assertActive();
            signal?.throwIfAborted();
            const backend = backends.get(request.type);
            if (backend === undefined) {
                throw new TerminalError(`no PTY backend registered for "${request.type}"`, "NO_BACKEND");
            }
            const releaseName = reserveName(owner, request.name);
            const sessionId = `pty-${++nextId}`;
            let session;
            try {
                const spawnSpec = {
                    sessionId,
                    owner,
                    type: request.type,
                    ...(request.name !== undefined ? { name: request.name } : {}),
                    ...(request.cwd !== undefined ? { cwd: request.cwd } : {}),
                    ...(signal !== undefined ? { signal } : {}),
                };
                session = await backend.spawn(spawnSpec);
                signal?.throwIfAborted();
                if (disposing) {
                    throw new TerminalError("PTY service is disposing", "SERVICE_DISPOSING");
                }
                const record = {
                    id: sessionId,
                    owner,
                    name: request.name,
                    type: request.type,
                    session,
                    active: undefined,
                    closing: undefined,
                };
                sessions.set(sessionId, record);
                return snapshot(record, session.motd);
            }
            catch (error) {
                if (session !== undefined && !sessions.has(sessionId)) {
                    try {
                        await session.close("PTY spawn rolled back");
                    }
                    catch (closeError) {
                        throw new AggregateError([error, closeError], "PTY spawn and rollback both failed");
                    }
                }
                throw error;
            }
            finally {
                releaseName();
            }
        },
        startSend(owner, sessionId, request) {
            const record = expectOwned(owner, sessionId);
            if (record.closing !== undefined) {
                throw new Error(`PTY session ${sessionId} is closing`);
            }
            if (record.active !== undefined) {
                throw new TerminalError(`PTY session ${sessionId} already has an active send`, "SEND_ACTIVE");
            }
            const operation = record.session.startSend(request);
            record.active = operation;
            void operation.done.then(() => {
                if (record.active === operation)
                    record.active = undefined;
            }, () => {
                if (record.active === operation)
                    record.active = undefined;
            });
            return operation;
        },
        read(owner, sessionId, request = {}) {
            return expectOwned(owner, sessionId).session.read(request);
        },
        async signal(owner, sessionId, signal) {
            return expectOwned(owner, sessionId).session.signal(signal);
        },
        async kill(owner, sessionId, reason = "model request") {
            const record = expectOwned(owner, sessionId);
            if (record.closing !== undefined) {
                await record.closing;
                return false;
            }
            const closing = record.session.close(reason);
            record.closing = closing;
            try {
                await closing;
                sessions.delete(sessionId);
                return true;
            }
            catch (error) {
                record.closing = undefined;
                throw error;
            }
        },
        list(owner) {
            return [...sessions.values()]
                .filter((record) => record.owner === owner)
                .map((record) => snapshot(record));
        },
        async dispose() {
            if (disposing)
                return;
            disposing = true;
            try {
                await closeRecords([...sessions.values()], "PTY service disposed");
            }
            finally {
                backends.clear();
                reservedNames.clear();
                sessions.clear();
            }
        },
    };
}
//# sourceMappingURL=service.js.map