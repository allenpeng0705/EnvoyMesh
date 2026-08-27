/**
 * Phase A / Item 2 (chunks 2.1) — memory citations.
 *
 * **Reference:** codex `codex-rs/memories/`
 * progressive disclosure (the `MEMORY.md` is a
 * navigational index; individual memories are loaded
 * on-demand). Citations are the model's "I read this"
 * signal — humans copy-paste them into emails / docs.
 *
 * **Citation syntax:**
 *
 *   - Whole-file: `[memory:<name>]`
 *     e.g. `[memory:typescript-harness]`
 *   - Section:    `[memory:<name>#<anchor>]`
 *     e.g. `[memory:mesh-bootstrap#Setup]`
 *
 * The anchor is the slugified heading (the convention
 * used by GitHub-flavored markdown — lowercase, dashes
 * for spaces, drop punctuation). The `parseCitation`
 * function is the inverse of `renderCitation` for any
 * input the model produces.
 *
 * **Why two functions (parse + render):** the model
 * writes citations in its output. Humans (or
 * downstream tools) need to round-trip them through
 * a stable string. Having both halves in one module
 * keeps the convention in one place.
 *
 * **Stability:** additive. New citation shapes
 * (e.g. line ranges: `[memory:foo#L10-20]`) are
 * additive when added.
 */
/** A single citation extracted from text. */
export interface MemoryCitation {
    /** Memory name (file name without `.md`). */
    name: string;
    /** Optional section anchor (slugified heading).
     *  Undefined for whole-file citations. */
    anchor?: string;
}
/**
 * Extract all memory citations from `text`. The order
 * in the returned array matches the order they
 * appear in `text`. Duplicates are preserved (the
 * caller can dedup if needed).
 *
 * **Edge cases:**
 * - Non-citation text returns `[]`.
 * - Malformed citations (e.g. `[memory:foo]` with
 *   no closing bracket, `[memory:Invalid Name]`,
 *   `[memory:foo#]`) are NOT matched.
 *
 * @example
 *   parseCitation("see [memory:foo] and [memory:bar#Setup]")
 *   // → [
 *   //   { name: "foo" },
 *   //   { name: "bar", anchor: "Setup" },
 *   // ]
 */
export declare function parseCitation(text: string): MemoryCitation[];
/**
 * Render a citation back to its string form. The
 * round-trip `parseCitation(renderCitation(c))` is
 * identity for any valid citation.
 *
 * @example
 *   renderCitation({ name: "foo" })        // → "[memory:foo]"
 *   renderCitation({ name: "bar", anchor: "Setup" })
 *   // → "[memory:bar#Setup]"
 */
export declare function renderCitation(c: MemoryCitation): string;
/**
 * Slugify a heading into a citation anchor. Mirrors
 * the GitHub-flavored convention: lowercase, dashes
 * for spaces, drop punctuation. Used by the model
 * when generating a citation for a specific section
 * and by readers that want to verify the anchor
 * matches the heading.
 *
 * @example
 *   slugify("How to Bootstrap")        // → "how-to-bootstrap"
 *   slugify("Setup: 1.2.x")            // → "setup-12x"
 *   slugify("Hello, World!")          // → "hello-world"
 */
export declare function slugify(heading: string): string;
//# sourceMappingURL=citations.d.ts.map