/** Build trusted OpenClaw GroupSystemPrompt from EnvoyMesh webhook fields. */
export function composeEnvoyMeshGroupSystemPrompt(msg: {
  policyPrompt?: string;
  retrievedContext?: string;
  systemPrompt?: string;
}): string | undefined {
  const policy = (msg.policyPrompt ?? msg.systemPrompt ?? "").trim();
  const retrieved = (msg.retrievedContext ?? "").trim();
  const parts: string[] = [];
  if (policy) parts.push(`## EnvoyMesh policy\n${policy}`);
  if (retrieved) parts.push(`## EnvoyMesh retrieved context\n${retrieved}`);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
