/**
 * Display-title resolution for vault markdown files.
 *
 * A vault file's stable identity is its `relativePath` (and the hash-based
 * `documentId`), but the *title shown in Knowledge Browse* is meant to be the
 * note's own name, not a random filename stem (e.g. Veda notes sync as
 * `notes/veda/<uuid>.md`). EnvoyMesh's own materializers (blog mirrors, Obsidian
 * imports) already write an explicit `title:` frontmatter key; this module lets
 * the vault index prefer that declared title, then the note's leading `# ` H1,
 * and only then falls back to the filename stem.
 */

/**
 * Read a `title:` value from a leading YAML frontmatter block.
 * Handles plain scalars and double-quoted strings (as written by
 * `yamlEscape` / `wrapMaterializedMarkdown`). Returns null when absent.
 */
function frontmatterTitle(content: string): string | null {
  // Leading `---` block only (standard Obsidian/EnvoyMesh frontmatter).
  const fm = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!fm) return null;
  const yaml = fm[1] ?? "";
  const line = yaml.split(/\r?\n/).find((l) => /^\s*title\s*:/.test(l));
  if (!line) return null;
  const raw = line.replace(/^\s*title\s*:\s*/, "").trim();
  if (!raw) return null;
  // Double-quoted value (JSON-ish) written by yamlEscape for special chars.
  const dq = raw.match(/^"((?:\\.|[^"\\])*)"$/);
  if (dq) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return JSON.parse(`"${dq[1]!}"`) as string;
    } catch {
      return dq[1]!;
    }
  }
  // Strip an inline YAML comment after a plain scalar.
  const plain = raw.replace(/\s+#.*$/, "").trim();
  return plain || null;
}

/**
 * First ATX heading (`# …`) near the top of the body, used when the file
 * declares no frontmatter `title:`. Only a heading that appears before any
 * non-blank paragraph line is honored, so a file whose body begins with prose
 * (but has `#` sections later) keeps its filename-based title.
 */
function leadingHeadingTitle(content: string): string | null {
  const body = content.replace(/^\uFEFF/, "");
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim()) continue;
    // Frontmatter already stripped by callers; a stray second `---` is prose.
    const m = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (m) {
      const heading = (m[1] ?? "").trim();
      return heading || null;
    }
    // First non-empty line is not a heading → no leading-title convention.
    return null;
  }
  return null;
}

/**
 * Resolve the display title for a markdown document:
 * explicit frontmatter `title:` → first `# ` heading → `fallbackTitle`
 * (normally the filename stem, preserving the historical basename behavior).
 */
export function markdownTitleFromContent(content: string, fallbackTitle: string): string {
  const fromFrontmatter = frontmatterTitle(content);
  if (fromFrontmatter) return fromFrontmatter;
  const fromHeading = leadingHeadingTitle(content.replace(/^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/, ""));
  if (fromHeading) return fromHeading;
  return fallbackTitle;
}
