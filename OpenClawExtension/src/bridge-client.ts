import { bridgeAuthHeaders } from "./bridge-auth.js";
import { bridgeExecuteToolUrl, bridgeListToolsUrl } from "./bridge-url.js";

export type BridgeMeshTool = {
  name: string;
  description?: string;
  parameters?: unknown;
};

export async function sendBridgeMessage(params: {
  bridgeUrl: string;
  bridgeSecret?: string;
  to: string;
  text: string;
  /** Passed through so the bridge can match async replies to pending ask() calls. */
  correlationId?: string;
}): Promise<boolean> {
  const body: Record<string, unknown> = { to: params.to, text: params.text };
  if (params.correlationId) body.correlationId = params.correlationId;
  const res = await fetch(params.bridgeUrl, {
    method: "POST",
    headers: bridgeAuthHeaders(params.bridgeSecret),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(310_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`EnvoyMesh bridge returned ${res.status}: ${body}`);
  }
  const data = (await res.json().catch(() => null)) as { ok?: boolean } | null;
  return data?.ok !== false;
}

export async function listBridgeMeshTools(params: {
  bridgeUrl: string;
  bridgeSecret?: string;
}): Promise<BridgeMeshTool[]> {
  const res = await fetch(bridgeListToolsUrl(params.bridgeUrl), {
    method: "GET",
    headers: bridgeAuthHeaders(params.bridgeSecret),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`EnvoyMesh bridge list-tools returned ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { ok?: boolean; tools?: BridgeMeshTool[] };
  if (data.ok === false) {
    throw new Error("EnvoyMesh bridge list-tools failed");
  }
  return Array.isArray(data.tools) ? data.tools : [];
}

export async function executeBridgeMeshTool(params: {
  bridgeUrl: string;
  bridgeSecret?: string;
  toolName: string;
  params?: Record<string, unknown>;
}): Promise<unknown> {
  const res = await fetch(bridgeExecuteToolUrl(params.bridgeUrl), {
    method: "POST",
    headers: bridgeAuthHeaders(params.bridgeSecret),
    body: JSON.stringify({
      toolName: params.toolName,
      params: params.params ?? {},
    }),
    signal: AbortSignal.timeout(310_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`EnvoyMesh bridge execute-tool returned ${res.status}: ${body}`);
  }
  const data = (await res.json()) as { ok?: boolean; result?: unknown; reason?: string };
  if (data.ok === false) {
    throw new Error(data.reason ?? "EnvoyMesh bridge execute-tool failed");
  }
  return data.result ?? data;
}
