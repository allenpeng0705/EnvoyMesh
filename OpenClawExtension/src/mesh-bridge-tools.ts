import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { Type } from "typebox";
import { listAccountIds, resolveAccount } from "./accounts.js";
import { executeBridgeMeshTool, listBridgeMeshTools } from "./bridge-client.js";

const ExecuteToolParamsSchema = Type.Object({
  toolName: Type.String({ description: "EnvoyMesh tool name (from envoymesh_list_mesh_tools)" }),
  params: Type.Optional(
    Type.Record(Type.String(), Type.Unknown(), {
      description: "Tool parameters object",
    }),
  ),
});

export function registerEnvoymeshMeshBridgeTools(api: OpenClawPluginApi): void {
  const cfg = api.config;
  if (!cfg) {
    return;
  }
  const accountIds = listAccountIds(cfg);
  if (accountIds.length === 0) {
    return;
  }
  const account = resolveAccount(cfg, accountIds[0]);
  if (!account.enabled || !account.bridgeUrl.trim()) {
    return;
  }

  api.registerTool(
    {
      name: "envoymesh_list_mesh_tools",
      label: "EnvoyMesh List Tools",
      description:
        "List mesh tools exposed by the local EnvoyMesh node bridge (mesh_findCapability, mesh_sendChat, etc.).",
      parameters: Type.Object({}),
      async execute() {
        const tools = await listBridgeMeshTools({
          bridgeUrl: account.bridgeUrl,
          bridgeSecret: account.bridgeSecret,
        });
        const text = tools.length
          ? tools.map((t) => `- ${t.name}: ${t.description ?? "(no description)"}`).join("\n")
          : "(no tools returned)";
        return {
          content: [{ type: "text", text }],
        };
      },
    },
    { name: "envoymesh_list_mesh_tools" },
  );

  api.registerTool(
    {
      name: "envoymesh_execute_mesh_tool",
      label: "EnvoyMesh Execute Tool",
      description:
        "Execute a mesh tool via the EnvoyMesh bridge. Tool runs on the home node with bond policy and redaction.",
      parameters: ExecuteToolParamsSchema,
      async execute(_id, params) {
        const parsed = params as { toolName?: string; params?: Record<string, unknown> };
        const toolName = parsed.toolName?.trim();
        if (!toolName) {
          throw new Error("toolName is required");
        }
        const result = await executeBridgeMeshTool({
          bridgeUrl: account.bridgeUrl,
          bridgeSecret: account.bridgeSecret,
          toolName,
          params: parsed.params,
        });
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      },
    },
    { name: "envoymesh_execute_mesh_tool" },
  );
}

