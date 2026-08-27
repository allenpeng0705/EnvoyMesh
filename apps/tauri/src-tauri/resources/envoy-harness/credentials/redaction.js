/**
 * Phase C / Item 13 — redacting Tracer wrapper.
 */
function redactString(text, secrets, names) {
    let out = text;
    for (const secret of secrets) {
        if (secret.length === 0)
            continue;
        if (!out.includes(secret))
            continue;
        const label = names?.get(secret);
        const replacement = label !== undefined ? `[REDACTED:${label}]` : "[REDACTED]";
        out = out.split(secret).join(replacement);
    }
    return out;
}
function redactValue(value, secrets, names) {
    if (typeof value === "string") {
        return redactString(value, secrets, names);
    }
    if (Array.isArray(value)) {
        return value.map((v) => redactValue(v, secrets, names));
    }
    if (value !== null && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = redactValue(v, secrets, names);
        }
        return out;
    }
    return value;
}
/** Wrap a Tracer so emitted events never contain revealed secrets. */
export function createRedactingTracer(inner, options) {
    return {
        emit(event) {
            const secrets = options.secrets();
            if (secrets.size === 0) {
                inner.emit(event);
                return;
            }
            const names = options.secretNames?.();
            inner.emit(redactValue(event, secrets, names));
        },
    };
}
//# sourceMappingURL=redaction.js.map