export interface TerminalAssistContextSnippet {
  label: string;
  content: string;
}

export interface TerminalAssistContextReaders {
  readVaultSnippet?: (relativePath: string, maxBytes: number) => Promise<string>;
  readWorkspaceSnippet?: (relativePath: string, maxBytes: number) => Promise<string>;
  runReadOnlyGit?: (cwd: string, gitArgs: string[], maxBytes: number) => Promise<string>;
}

const VAULT_PATTERN = /@vault:([^\s]+)/gi;
const WORKSPACE_PATTERN = /@workspace:([^\s]+)/gi;
const GIT_PATTERN = /@git:([a-z_-]+)/gi;

const MAX_SNIPPET_BYTES = 8192;
const MAX_SNIPPETS = 3;

export function stripAssistContextMarkers(prompt: string): string {
  return prompt
    .replace(VAULT_PATTERN, "")
    .replace(WORKSPACE_PATTERN, "")
    .replace(GIT_PATTERN, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function collectAssistContextRequests(prompt: string): {
  vaultPaths: string[];
  workspacePaths: string[];
  gitCommands: string[];
} {
  const vaultPaths = [...prompt.matchAll(VAULT_PATTERN)].map((m) => m[1]!.trim()).filter(Boolean);
  const workspacePaths = [...prompt.matchAll(WORKSPACE_PATTERN)].map((m) => m[1]!.trim()).filter(Boolean);
  const gitCommands = [...prompt.matchAll(GIT_PATTERN)].map((m) => m[1]!.trim().toLowerCase()).filter(Boolean);
  return {
    vaultPaths: [...new Set(vaultPaths)],
    workspacePaths: [...new Set(workspacePaths)],
    gitCommands: [...new Set(gitCommands)],
  };
}

function gitArgsForToken(token: string): string[] | null {
  switch (token) {
    case "diff":
    case "stat":
      return ["diff", "--stat"];
    case "last":
    case "log":
      return ["log", "-1", "--oneline"];
    case "status":
      return ["status", "--short"];
    default:
      return null;
  }
}

export async function loadAssistContextSnippets(input: {
  prompt: string;
  cwd: string;
  readers: TerminalAssistContextReaders;
}): Promise<TerminalAssistContextSnippet[]> {
  const { vaultPaths, workspacePaths, gitCommands } = collectAssistContextRequests(input.prompt);
  const snippets: TerminalAssistContextSnippet[] = [];

  for (const relativePath of vaultPaths) {
    if (snippets.length >= MAX_SNIPPETS) break;
    if (!input.readers.readVaultSnippet) continue;
    try {
      const content = await input.readers.readVaultSnippet(relativePath, MAX_SNIPPET_BYTES);
      snippets.push({ label: `@vault:${relativePath}`, content: content.slice(0, MAX_SNIPPET_BYTES) });
    } catch {
      snippets.push({ label: `@vault:${relativePath}`, content: "(unavailable)" });
    }
  }

  for (const relativePath of workspacePaths) {
    if (snippets.length >= MAX_SNIPPETS) break;
    if (!input.readers.readWorkspaceSnippet) continue;
    try {
      const content = await input.readers.readWorkspaceSnippet(relativePath, MAX_SNIPPET_BYTES);
      snippets.push({ label: `@workspace:${relativePath}`, content: content.slice(0, MAX_SNIPPET_BYTES) });
    } catch {
      snippets.push({ label: `@workspace:${relativePath}`, content: "(unavailable)" });
    }
  }

  for (const token of gitCommands) {
    if (snippets.length >= MAX_SNIPPETS) break;
    if (!input.readers.runReadOnlyGit) continue;
    const args = gitArgsForToken(token);
    if (!args) continue;
    try {
      const content = await input.readers.runReadOnlyGit(input.cwd, args, MAX_SNIPPET_BYTES);
      snippets.push({ label: `@git:${token}`, content: content.slice(0, MAX_SNIPPET_BYTES) });
    } catch {
      snippets.push({ label: `@git:${token}`, content: "(unavailable — not a git repo or git failed)" });
    }
  }

  return snippets;
}

export function formatAssistContextBlock(snippets: readonly TerminalAssistContextSnippet[]): string {
  if (snippets.length === 0) return "";
  const blocks = snippets.map((s) => `[${s.label}]\n${s.content}`);
  return `Approved read-only context:\n---\n${blocks.join("\n---\n")}\n---\n`;
}
