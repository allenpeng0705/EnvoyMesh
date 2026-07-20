/**
 * Phase 45 — Web Content Browsing manifest store.
 *
 * Loads and queries `web-content.json` from the profile's `web/`
 * directory. The manifest declares metadata for published items:
 * title, summary, kind, visibility, updatedAt. Items without a
 * manifest entry are still served (defaulting to `private` visibility),
 * but they are not listed in directory indexes.
 *
 * Design: docs/web-content-browsing-design.md §4.2.
 */

import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Visibility flag carried by each manifest entry. Maps to Bonds tiers. */
export type WebContentVisibility = "public" | "bonded" | "contacts" | "private";

/** Content kind for UI rendering hints. */
export type WebContentKind = "article" | "note" | "photo" | "gallery" | "file" | "profile";

/** A single entry in the web-content.json manifest. */
export interface WebContentEntry {
  /** URL path relative to the web/ root, no leading slash (e.g. "blog/posts/hello"). */
  path: string;
  /** sha256 of the file bytes, for integrity + dedup. */
  contentHash: string;
  byteLength: number;
  /** Human-readable title for listings. */
  title: string;
  /** Short excerpt for listing displays. */
  summary?: string;
  /** Templated site type for UI rendering hints. */
  kind: WebContentKind;
  /** MIME type (e.g. "text/markdown", "image/jpeg"). */
  mimeType: string;
  /** Per-item visibility flag. */
  visibility: WebContentVisibility;
  /** ISO 8601 timestamp of the last content update. */
  updatedAt: string;
  /** When the item was first published. */
  publishedAt?: string;
  /** Pretty URL slug (defaults to filename when not set). */
  urlSlug?: string;
  /** For visibility: "contacts" — owner IDs permitted to read. */
  contactIds?: string[];
  /** Free-form tags for Step 2 topic matching. */
  tags?: string[];
}

/** Top-level manifest shape. */
export interface WebContentManifest {
  version: "0.1";
  entries: WebContentEntry[];
}

/** Empty manifest used when the file is missing or invalid. */
const EMPTY_MANIFEST: WebContentManifest = { version: "0.1", entries: [] };

/**
 * Store interface for loading and querying the web-content manifest.
 *
 * Reads are cached per-instance; callers should construct a new store
 * (or call `reload()`) after writes. Writes are atomic via temp+rename.
 */
export interface WebContentStore {
  /** Load the full manifest (cached after first call until `reload`). */
  load(): Promise<WebContentManifest>;
  /** Force a fresh read from disk (clears the cache). */
  reload(): Promise<WebContentManifest>;
  /** Look up a single entry by URL path. Returns undefined if not declared. */
  findByPath(path: string): Promise<WebContentEntry | undefined>;
  /** List all entries (optionally filtered by kind or visibility). */
  list(filter?: { kind?: WebContentKind; visibility?: WebContentVisibility }): Promise<WebContentEntry[]>;
  /** True if the manifest declares at least one entry. */
  hasAnyPublished(): Promise<boolean>;
  /** Upsert an entry (writes through to disk). */
  upsert(entry: WebContentEntry): Promise<void>;
  /** Remove an entry by path (writes through to disk). */
  remove(path: string): Promise<void>;
}

/** Normalize a URL path for comparison: strip leading slash, collapse `//`. */
export function normalizeWebPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+/g, "/");
}

export function createWebContentStore(webDir: string): WebContentStore {
  const manifestPath = join(webDir, "web-content.json");
  let cached: WebContentManifest | null = null;

  async function readFromDisk(): Promise<WebContentManifest> {
    try {
      const raw = await readFile(manifestPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<WebContentManifest>;
      if (parsed && parsed.version === "0.1" && Array.isArray(parsed.entries)) {
        return { version: "0.1", entries: parsed.entries };
      }
      return EMPTY_MANIFEST;
    } catch {
      // Missing file or invalid JSON — treat as empty.
      return EMPTY_MANIFEST;
    }
  }

  async function persist(manifest: WebContentManifest): Promise<void> {
    // Atomic write via temp+rename would be ideal; for the manifest we use
    // direct write with 0o600 to mirror published-library-store.ts.
    const json = `${JSON.stringify(manifest, null, 2)}\n`;
    await writeFile(manifestPath, json, { mode: 0o600 });
    cached = manifest;
  }

  return {
    async load(): Promise<WebContentManifest> {
      if (cached) return cached;
      cached = await readFromDisk();
      return cached;
    },

    async reload(): Promise<WebContentManifest> {
      cached = await readFromDisk();
      return cached;
    },

    async findByPath(path: string): Promise<WebContentEntry | undefined> {
      const m = await this.load();
      const normalized = normalizeWebPath(path);
      return m.entries.find((e) => normalizeWebPath(e.path) === normalized);
    },

    async list(filter?: {
      kind?: WebContentKind;
      visibility?: WebContentVisibility;
    }): Promise<WebContentEntry[]> {
      const m = await this.load();
      return m.entries.filter((e) => {
        if (filter?.kind && e.kind !== filter.kind) return false;
        if (filter?.visibility && e.visibility !== filter.visibility) return false;
        return true;
      });
    },

    async hasAnyPublished(): Promise<boolean> {
      const m = await this.load();
      return m.entries.length > 0;
    },

    async upsert(entry: WebContentEntry): Promise<void> {
      const m = await this.load();
      const normalizedPath = normalizeWebPath(entry.path);
      const idx = m.entries.findIndex((e) => normalizeWebPath(e.path) === normalizedPath);
      const cleaned: WebContentEntry = { ...entry, path: normalizedPath };
      if (idx >= 0) {
        m.entries[idx] = cleaned;
      } else {
        m.entries.push(cleaned);
      }
      m.entries.sort((a, b) => a.path.localeCompare(b.path));
      await persist(m);
    },

    async remove(path: string): Promise<void> {
      const m = await this.load();
      const normalized = normalizeWebPath(path);
      const next = m.entries.filter((e) => normalizeWebPath(e.path) !== normalized);
      if (next.length === m.entries.length) return; // not found — no-op
      await persist({ version: "0.1", entries: next });
    },
  };
}

/**
 * Default visibility for an item not declared in the manifest.
 * Manifest-absent files default to private — they can be served to the
 * owner (self) for preview, but not to remote peers. The owner must
 * explicitly publish by adding a manifest entry.
 */
export const DEFAULT_VISIBILITY: WebContentVisibility = "private";

/**
 * Map a manifest visibility to a Bonds sensitivity tier for the policy
 * gate. See docs/web-content-browsing-design.md §4.3.2.
 */
export function visibilityToSensitivity(v: WebContentVisibility): "public" | "friends" | "private" {
  switch (v) {
    case "public":
      return "public";
    case "bonded":
      return "friends";
    case "contacts":
      return "friends";
    case "private":
      return "private";
  }
}
