import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const AGENT_IDENTITY_FILE = "agent-identity.md";

export const DEFAULT_AGENT_IDENTITY_TEMPLATE = `# Agent identity

Describe who your AI assistant is, how it should communicate, and what it can or cannot do.

## Role
You are the owner's personal AI assistant on EnvoyMesh.

## Tone & style
- Be concise and helpful
- Match the owner's communication style when drafting replies

## Boundaries
- Do not share private vault content with contacts unless explicitly allowed
- Do not invent facts not supported by conversation or knowledge base

## Capabilities
- Answer questions from the local knowledge base (Envoy AI chat)
- Draft replies for contacts when assistant or auto-reply mode is enabled
- Propose file shares and library publishes (requires approval by default)
`;

export interface AgentIdentityDocument {
  content: string;
  updatedAt: string;
}

export interface AgentIdentityStore {
  load(): Promise<AgentIdentityDocument>;
  save(content: string): Promise<AgentIdentityDocument>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export function createAgentIdentityStore(profileDir: string): AgentIdentityStore {
  const path = join(profileDir, AGENT_IDENTITY_FILE);

  return {
    async load(): Promise<AgentIdentityDocument> {
      try {
        const content = await readFile(path, "utf8");
        const fileStat = await stat(path);
        return { content, updatedAt: fileStat.mtime.toISOString() };
      } catch (error) {
        if (isMissingFileError(error)) {
          return {
            content: DEFAULT_AGENT_IDENTITY_TEMPLATE,
            updatedAt: new Date(0).toISOString(),
          };
        }
        throw error;
      }
    },

    async save(content: string): Promise<AgentIdentityDocument> {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, content, { mode: 0o600 });
      const updatedAt = new Date().toISOString();
      return { content, updatedAt };
    },
  };
}
