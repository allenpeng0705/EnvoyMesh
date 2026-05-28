import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { registerEnvoymeshMeshBridgeTools } from "./mesh-bridge-tools.js";

export function registerEnvoymeshFull(api: OpenClawPluginApi): void {
  registerEnvoymeshMeshBridgeTools(api);
}
