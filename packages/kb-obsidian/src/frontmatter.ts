/**
 * Lightweight YAML frontmatter parser for Obsidian-style Markdown notes.
 *
 * Handles the subset of YAML that Obsidian uses in frontmatter:
 * - String values (quoted or unquoted)
 * - Boolean values (true/false)
 * - Number values
 * - Arrays of strings (inline: `[a, b, c]` or multiline `- a\n- b`)
 *
 * No external YAML parser dependency — keeps the package lean.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parsed frontmatter key-value pairs.
 * Values are normalized to `string | boolean | number | string[]`.
 */
export type FrontmatterValue = string | boolean | number | string[];

export interface ParsedFrontmatter {
  /** Key-value pairs extracted from the YAML block. */
  data: Record<string, FrontmatterValue>;
  /** The Markdown content after the frontmatter block (may be empty). */
  content: string;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Opening delimiter for YAML frontmatter. */
const FRONTMATTER_OPEN = /^---[ \t]*\r?\n/

/** Closing delimiter for YAML frontmatter (multiline). */
const FRONTMATTER_CLOSE = /^[ \t]*---[ \t]*\r?\n/m

/**
 * Extract and parse YAML frontmatter from a Markdown string.
 *
 * Returns `{ data, content }` where:
 * - `data` contains the parsed key-value pairs (empty if no frontmatter)
 * - `content` is the body after the frontmatter block
 *
 * If the file does not start with `---`, returns `{ data: {}, content }` unchanged.
 */
export function parseFrontmatter(markdown: string): ParsedFrontmatter {
  if (!FRONTMATTER_OPEN.test(markdown)) {
    return { data: {}, content: markdown };
  }

  // Find the closing `---` after the opening one.
  const afterOpen = markdown.slice(markdown.indexOf("\n") + 1);
  const closeIdx = afterOpen.search(FRONTMATTER_CLOSE);

  if (closeIdx === -1) {
    // No closing delimiter — treat entire file as content (malformed).
    return { data: {}, content: markdown };
  }

  const yamlBlock = afterOpen.slice(0, closeIdx);
  // Find end of closing `---` line (skip the `---` + newline).
  const closeLineEnd = afterOpen.indexOf("\n", closeIdx)
  const raw = closeLineEnd === -1 ? "" : afterOpen.slice(closeLineEnd + 1)
  // Strip the blank separator line between frontmatter and content.
  const content = raw.replace(/^\r?\n/, "")

  return {
    data: parseYamlBlock(yamlBlock),
    content,
  };
}

// ---------------------------------------------------------------------------
// Simple YAML block parser (subset)
// ---------------------------------------------------------------------------

function parseYamlBlock(yaml: string): Record<string, FrontmatterValue> {
  const result: Record<string, FrontmatterValue> = {};
  const lines = yaml.split(/\r?\n/);

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines and comments.
    if (/^[ \t]*$/.test(line) || /^[ \t]*#/.test(line)) {
      i++;
      continue;
    }

    // Array items (multiline): `- value` — collect into the previous key.
    if (/^[ \t]*-[ \t]/.test(line)) {
      // This shouldn't happen at the top level without a preceding key,
      // but handle gracefully by skipping.
      i++;
      continue;
    }

    // Key: value pair.
    const kvMatch = line.match(/^([a-zA-Z_][a-zA-Z0-9_ -]*)[ \t]*:[ \t]?(.*)/);
    if (kvMatch) {
      const key = kvMatch[1].trim();
      const rawValue = kvMatch[2].trim();

      // Check for multiline array (next line starts with `- `).
      if (rawValue === "" && i + 1 < lines.length && /^[ \t]*-[ \t]/.test(lines[i + 1])) {
        const arr: string[] = [];
        i++;
        while (i < lines.length && /^[ \t]*-[ \t]+(.+)/.test(lines[i])) {
          const val = lines[i].match(/^[ \t]*-[ \t]+(.+)/)?.[1].trim();
          if (val !== undefined) arr.push(val);
          i++;
        }
        result[key] = arr;
        continue;
      }

      // Inline array: `[a, b, c]`.
      if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
        const inner = rawValue.slice(1, -1);
        result[key] = inner
          .split(",")
          .map((s) => s.trim().replace(/^["']|["']$/g, ""))
          .filter((s) => s.length > 0);
        i++;
        continue;
      }

      // Boolean.
      if (rawValue === "true") {
        result[key] = true;
        i++;
        continue;
      }
      if (rawValue === "false") {
        result[key] = false;
        i++;
        continue;
      }

      // Number (int or float).
      const num = Number(rawValue);
      if (rawValue !== "" && !isNaN(num)) {
        result[key] = num;
        i++;
        continue;
      }

      // String — strip optional quotes.
      result[key] = rawValue.replace(/^["']|["']$/g, "");
      i++;
      continue;
    }

    // Unrecognised line — skip.
    i++;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Accessor helpers
// ---------------------------------------------------------------------------

/**
 * Get a string value from frontmatter data, or `undefined` if missing / wrong type.
 */
export function frontmatterString(
  data: Record<string, FrontmatterValue>,
  key: string,
): string | undefined {
  const v = data[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * Get a boolean value from frontmatter data, or `undefined` if missing / wrong type.
 */
export function frontmatterBoolean(
  data: Record<string, FrontmatterValue>,
  key: string,
): boolean | undefined {
  const v = data[key];
  return typeof v === "boolean" ? v : undefined;
}

/**
 * Get a string-array value from frontmatter data, or `undefined` if missing / wrong type.
 */
export function frontmatterStringArray(
  data: Record<string, FrontmatterValue>,
  key: string,
): string[] | undefined {
  const v = data[key];
  return Array.isArray(v) && v.every((item) => typeof item === "string") ? v : undefined;
}

/**
 * Set or update a boolean frontmatter key (`published`, etc.) in a Markdown file.
 *
 * - With existing frontmatter: updates the key in place, or appends it before the closing `---`.
 * - Without frontmatter: prepends a new YAML block.
 * Returns the full file text (unchanged if the value is already correct).
 */
export function setFrontmatterBoolean(
  markdown: string,
  key: string,
  value: boolean,
): string {
  const boolText = value ? "true" : "false"
  const keyLine = `${key}: ${boolText}`

  if (!FRONTMATTER_OPEN.test(markdown)) {
    return `---\n${keyLine}\n---\n\n${markdown}`
  }

  const openEnd = markdown.indexOf("\n") + 1
  const afterOpen = markdown.slice(openEnd)
  const closeIdx = afterOpen.search(FRONTMATTER_CLOSE)
  if (closeIdx === -1) {
    return `---\n${keyLine}\n---\n\n${markdown}`
  }

  const yamlBlock = afterOpen.slice(0, closeIdx)
  const closeLineEnd = afterOpen.indexOf("\n", closeIdx)
  const rest = closeLineEnd === -1 ? "" : afterOpen.slice(closeLineEnd + 1)

  const keyRe = new RegExp(`^([ \\t]*)${escapeRegExp(key)}[ \\t]*:[ \\t]*.*$`, "m")
  let nextYaml: string
  if (keyRe.test(yamlBlock)) {
    nextYaml = yamlBlock.replace(keyRe, `$1${keyLine}`)
  } else {
    const trimmed = yamlBlock.replace(/\s+$/, "")
    nextYaml = trimmed.length > 0 ? `${trimmed}\n${keyLine}\n` : `${keyLine}\n`
  }

  if (nextYaml === yamlBlock) return markdown
  return `---\n${nextYaml}---\n${rest}`
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
