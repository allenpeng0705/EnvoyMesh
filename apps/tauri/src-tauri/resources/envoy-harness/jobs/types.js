/**
 * Phase C / Item 7 — background jobs types (L3 port of
 * deepseek `dsh-jobs`, Cordis-free).
 *
 * Producer returns {@link JobHooks}; the registry owns
 * identity, snapshots, waiters, and owner fencing.
 * Owner is an opaque string (typically `session.id`).
 */
export class JobError extends Error {
    code;
    name = "JobError";
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
//# sourceMappingURL=types.js.map