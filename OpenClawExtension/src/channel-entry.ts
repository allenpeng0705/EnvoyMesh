import type { OpenClawPluginApi } from "openclaw/plugin-sdk/plugin-entry";
import { registerEnvoymeshMeshBridgeTools } from "./mesh-bridge-tools.js";
import { registerEnvoymeshRemindTool } from "./remind-tool.js";

export function registerEnvoymeshFull(api: OpenClawPluginApi): void {
  registerEnvoymeshMeshBridgeTools(api);
  registerEnvoymeshRemindTool(api);
}
