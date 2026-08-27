/**
 * Phase C / Item 13 — credentials types (P1 seam).
 *
 * Mesh credentials stay in the adapter (`source: "mesh"`
 * is reserved and rejected here).
 */
export class CredentialError extends Error {
    code;
    name = "CredentialError";
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
//# sourceMappingURL=types.js.map