/**
 * Attach a TuiSession to an existing ACP stdio pair.
 */
import { EnvoyHarnessClient, } from "@envoymesh/envoy-harness-client";
import { TuiSession } from "./session.js";
/** Create a TuiSession over host-provided ACP streams (no server spawn). */
export function createAttachedTui(options) {
    let sessionRef;
    const client = new EnvoyHarnessClient({
        input: options.input,
        output: options.output,
        onPermissionRequest: async (req) => {
            if (sessionRef === undefined)
                return "deny";
            return sessionRef.handlePermissionRequest(req);
        },
        ...(options.onEvent !== undefined ? { onEvent: options.onEvent } : {}),
    });
    const session = new TuiSession({
        client,
        ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
        ...(options.onPermission !== undefined
            ? { onPermission: options.onPermission }
            : {}),
    });
    sessionRef = session;
    return {
        session,
        client,
        close() {
            session.close();
        },
    };
}
//# sourceMappingURL=attached.js.map