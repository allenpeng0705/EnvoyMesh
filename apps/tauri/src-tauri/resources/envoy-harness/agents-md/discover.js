/**
 * AGENTS.md discovery — verbatim Codex pattern.
 *
 * Walks up from `cwd` to the nearest ancestor with a `projectRootMarker`
 * (e.g. `.git`), collecting every `AGENTS.md` (and any `fallbackFilenames`)
 * along the way. Concatenates them into a single `assembled` string
 * with origin/path comments, respecting a `maxBytes` budget.
 *
 * **Design doc:** `docs/design.md` §9. Mirrors
 * `codex-rs/core/src/agents_md.rs:1-90` line-for-line.
 *
 * **The algorithm (5 steps):**
 *
 * 1. **Find the project root.** Walk up from `cwd` looking for any
 *    `projectRootMarker`. Stop at the first match. If no match is
 *    found, the cwd itself is the project root.
 *
 * 2. **Collect doc paths.** From the project root down to the cwd
 *    (inclusive), at each directory, look for `AGENTS_MD_FILENAME`
 *    and any `fallbackFilenames`. The list is ordered root-first
 *    (project root first, cwd last) so the byte budget favors the
 *    project root's instructions — the Codex pattern. The design
 *    doc §9 sketch (which reverses the walk) is authoritative.
 *
 * 3. **Read each doc, respecting `maxBytes`.** Truncate the LAST doc
 *    that would exceed the budget; never start a new one. This is the
 *    same byte-budget policy as Codex: the project root's instructions
 *    are always included; the most specific (cwd) instructions are
 *    truncated if everything together is too big.
 *
 * 4. **Read the override.** `AGENTS_OVERRIDE_FILENAME` in `cwd` is
 *    appended last, so it wins on conflicts. The same byte budget
 *    applies; the override may itself be truncated.
 *
 * 5. **Assemble.** Each doc is preceded by an HTML comment with the
 *    origin and path, so the model can see where each piece came
 *    from. The separator is `'\n\n--- project-doc ---\n\n'`.
 *
 * **Why this is a separate module from the rest of the runtime:**
 * the discovery algorithm is pure (input → output, no side effects
 * beyond file reads). It's easy to test in isolation, and easy to
 * reason about. The runtime reads the assembled string and injects
 * it into the system prompt.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { AGENTS_MD_FILENAME, AGENTS_OVERRIDE_FILENAME, DEFAULT_PROJECT_DOC_MAX_BYTES, DEFAULT_PROJECT_ROOT_MARKERS, } from "../types.js";
/** Separator between assembled docs. Visible to the model. */
const SEPARATOR = "\n\n--- project-doc ---\n\n";
/**
 * Walk up from `cwd` to find the project root, collect AGENTS.md
 * along the way, read the override, and assemble. See file header
 * for the 5-step algorithm.
 */
export async function discoverAgentsMd(options) {
    const { cwd, projectRootMarkers = DEFAULT_PROJECT_ROOT_MARKERS, fallbackFilenames = [], maxBytes = DEFAULT_PROJECT_DOC_MAX_BYTES, userDocs = [], } = options;
    // 1. Find the project root.
    const projectRoot = await findProjectRoot(cwd, projectRootMarkers);
    // 2. Collect doc paths (root-first).
    const docPaths = collectDocPaths({
        fromDir: projectRoot,
        toDir: cwd,
        filenames: [AGENTS_MD_FILENAME, ...fallbackFilenames],
    });
    // 3. Read each doc, respecting maxBytes.
    const entries = [...userDocs];
    let totalBytes = userDocs.reduce((sum, d) => sum + d.byteLength, 0);
    for (const p of docPaths) {
        if (totalBytes >= maxBytes)
            break;
        const doc = await tryReadDoc(p, "project", maxBytes - totalBytes);
        if (doc) {
            entries.push(doc);
            totalBytes += doc.byteLength;
        }
    }
    // 4. Read the override (last, so it wins on conflicts).
    const overridePath = path.join(cwd, AGENTS_OVERRIDE_FILENAME);
    if (totalBytes < maxBytes) {
        const doc = await tryReadDoc(overridePath, "override", maxBytes - totalBytes);
        if (doc) {
            entries.push(doc);
            totalBytes += doc.byteLength;
        }
    }
    // 5. Assemble with origin/path comments.
    const assembled = entries
        .map((e) => `<!-- origin: ${e.origin} path: ${e.path} -->\n${e.contents}`)
        .join(SEPARATOR);
    return { entries, totalBytes, assembled };
}
/**
 * Walk up from `cwd` looking for a `projectRootMarker`. Returns the
 * first directory containing one. If no marker is found, returns
 * `cwd` (the cwd itself is the project root).
 *
 * Uses a `visited` set to defend against symlink cycles. Stops at
 * the filesystem root.
 */
async function findProjectRoot(cwd, markers) {
    if (markers.length === 0)
        return cwd;
    let dir = path.resolve(cwd);
    const visited = new Set();
    while (!visited.has(dir)) {
        visited.add(dir);
        for (const marker of markers) {
            if (await exists(path.join(dir, marker)))
                return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            return cwd; // hit filesystem root, no marker found
        dir = parent;
    }
    return cwd; // symlink cycle, bail out
}
/**
 * Collect every `{dir}/{filename}` for each dir in the root-to-leaf
 * range, returning the paths in root-first order. The project root
 * is first; the cwd (leaf) is last. The byte budget therefore
 * favors the project root's instructions, matching Codex.
 */
function collectDocPaths(input) {
    const { fromDir, toDir, filenames } = input;
    const out = [];
    let dir = path.resolve(toDir);
    const stop = path.resolve(fromDir);
    // Hard cap at 100 directories to prevent infinite loops on weird
    // symlink configurations. Real projects have at most a handful.
    for (let i = 0; i < 100; i++) {
        for (const filename of filenames) {
            out.push(path.join(dir, filename));
        }
        if (dir === stop)
            break;
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return out.reverse();
}
/**
 * Try to read a doc file. Returns `null` if the file doesn't exist
 * or can't be read. Truncates to fit within the remaining budget.
 * Reports `byteLength` as the BYTE count (not character count) so
 * the budget is consistent across encodings.
 */
async function tryReadDoc(p, origin, remaining) {
    if (remaining <= 0)
        return null;
    let contents;
    try {
        contents = await fs.readFile(p, "utf8");
    }
    catch {
        return null; // missing file, permission error, etc.
    }
    // Truncate by BYTE count (not character count) so multi-byte
    // encodings (e.g. CJK) cannot overshoot the budget by 2-3x.
    // The slice is backed off to a UTF-8 character boundary so the
    // last character is never split mid-sequence.
    const buf = Buffer.from(contents, "utf8");
    const slice = buf.byteLength > remaining ? truncateUtf8(buf, remaining) : buf;
    const trimmed = slice.toString("utf8");
    const byteLength = slice.byteLength;
    // Truncation produced nothing usable (e.g. a 1-byte budget with a
    // 3-byte leading character) — skip the entry instead of adding an
    // empty doc.
    if (buf.byteLength > remaining && trimmed.length === 0)
        return null;
    return {
        path: p,
        contents: trimmed,
        origin,
        byteLength,
    };
}
/**
 * Return the largest prefix of `buf` that is at most `maxBytes`
 * bytes AND ends on a UTF-8 character boundary.
 */
function truncateUtf8(buf, maxBytes) {
    if (buf.byteLength <= maxBytes)
        return buf;
    let end = maxBytes;
    // Back off while the byte before `end` is a continuation byte
    // (we're mid-character).
    while (end > 0 && (buf[end - 1] & 0xc0) === 0x80)
        end--;
    if (end === 0)
        return buf.subarray(0, maxBytes);
    // The byte at `end - 1` is a leading byte. Compute how many
    // bytes its character needs; if more are required than remain
    // between `end - 1` and the original `maxBytes`, cut before it.
    const lead = buf[end - 1];
    let charLen = 1;
    if ((lead & 0xe0) === 0xc0)
        charLen = 2;
    else if ((lead & 0xf0) === 0xe0)
        charLen = 3;
    else if ((lead & 0xf8) === 0xf0)
        charLen = 4;
    if (end - 1 + charLen > maxBytes)
        end -= 1;
    return buf.subarray(0, end);
}
/** Promise-friendly `fs.access` (returns boolean, not throws). */
async function exists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=discover.js.map