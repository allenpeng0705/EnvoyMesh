#!/usr/bin/env node
/**
 * Generate `packages/api/src/core-node-service.ts` — the reusable half of the
 * RPC contract (plan §10 **E9**, reopened in §8.13).
 *
 * ## What this produces
 *
 * `CoreRpcMethods` (the method names a non-social product may depend on) and
 * `CoreNodeService` (their signatures), with the full `NodeService` /
 * `RpcMethods` extending / containing the core ones. Product consumers are
 * unaffected: `NodeService extends CoreNodeService`, so every existing consumer
 * keeps every method it had.
 *
 * ## How membership is decided — measured, then declared, then vetoed
 *
 * E9 asked for membership "generated from the Axis-1 manifest". Measured, that
 * is **not sufficient**, and this script records why rather than pretending
 * otherwise:
 *
 *   * The manifest's `conceptPattern` is *module-shaped*. Applied to method
 *     signatures it yields **362 of 435** methods "clean" — including
 *     `sendCallInvite`, `listChatHistory` and every commerce method. Meanwhile
 *     the whole `Voice/Video Calls` section (10 methods) is signal-clean while
 *     being unambiguously product. So the signals cannot *decide*.
 *   * What they can do is **veto**: a method that names a product concept, or
 *     reaches a `product-bound` module through the types in its own signature,
 *     is not core — full stop.
 *
 * Membership is therefore a **declared section disposition** (21 sections, the
 * same sections the interface already uses), and every declared `core` section
 * is checked against both manifest signals. That mirrors the store inventory
 * (`scripts/inventory-node-stores.mjs`: `kernel` / `product` / `undecided`,
 * declared with evidence and gated by `--check`) — the repo's existing idiom for
 * "the measurement narrows it; a review decides the residual".
 *
 * `undecided` is **fail-closed**: it is not core. A section reaches `core` only
 * by being declared so *and* passing the veto.
 *
 * ## Usage
 *
 * ```sh
 * node scripts/generate-core-surface.mjs              # write the generated file
 * node scripts/generate-core-surface.mjs --check      # fail if it is stale
 * node scripts/generate-core-surface.mjs --evidence   # per-section evidence table
 * ```
 *
 * **Exit codes:** 0 = ok, 1 = a veto violation, an undeclared section, or
 * (`--check`) a stale generated file.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments, stripCommentsAndStrings } from "./lib/source-files.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const API_SRC = path.join(repoRoot, "packages/api/src");
const MANIFEST = path.join(here, "module-boundary.json");
const NODE_SERVICE_FILE = path.join(API_SRC, "node-service.ts");
const coreFileArg = process.argv.indexOf("--core-file");
if (coreFileArg !== -1 && (process.argv[coreFileArg + 1] ?? "").startsWith("--")) {
  console.error("[fail] --core-file needs a path");
  process.exit(1);
}
if (coreFileArg !== -1 && !process.argv[coreFileArg + 1]) {
  console.error("[fail] --core-file needs a path");
  process.exit(1);
}
const CORE_FILE = coreFileArg === -1
  ? path.join(API_SRC, "core-node-service.ts")
  : path.resolve(process.argv[coreFileArg + 1]);
const CORE_INTERFACE = "CoreNodeService";
const FULL_INTERFACE = "NodeService";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);

/**
 * The declared decision. One entry per `// ----- Section -----` in the
 * interface; an undeclared section fails the run rather than defaulting.
 *
 * `reason` is required for `core` (why a non-social product needs it) and for
 * any `undecided` (what is missing). `product` needs none — the fail-closed
 * default is the cheap direction.
 */
const SECTIONS = {
  "Identity": { disposition: "core", reason: "a node's own identity/profile is what any connection is built on" },
  "Bond Management": { disposition: "product", reason: "bonds are EnvoyMesh's social trust model" },
  "Messaging": { disposition: "product", reason: "chat threads, attachments and drafts are the social product" },
  "Search / Discovery": { disposition: "core", reason: "finding peers is the network itself, not a social feature" },
  "Capability Manifest": { disposition: "undecided", reason: "2 of 3 methods carry `CapabilityManifest` from a product-bound module (ws-protocol.ts); the type would have to move first" },
  "File Sharing": { disposition: "core", reason: "file transfer is a transport capability every product needs" },
  "Agent-assisted (FS-E placeholder)": { disposition: "core", reason: "agent-assisted file handling, no social concept" },
  "Node Configuration": { disposition: "undecided", reason: "4 of 13 methods (`getNodeConfig`/`updateNodeConfig`/`listRelays`/`addRelay`) reference product-bound module types" },
  "Node Lifecycle": { disposition: "undecided", reason: "2 of 5 methods reference product-bound module types" },
  "Event Subscription": { disposition: "undecided", reason: "`on`/`off` are typed by `NodeServiceEvents`, whose vocabulary names `FamilyRoom` — the 67-entry event map has to be partitioned first (the host package already declares a local core-event subset for this reason, plan §6b)" },
  "Agent Bridge": { disposition: "product", reason: "the external-agent/HomeClaw bridge is product plumbing (175 methods, 32 tainted, 1 concept)" },
  "Terminals (Phase 30)": { disposition: "core", reason: "terminal/agent execution is what EnvoyCoder is built on" },
  "Connection Status": { disposition: "core", reason: "connectivity state, product-agnostic" },
  "AI / Knowledge Query": { disposition: "undecided", reason: "2 of 5 methods reference product-bound module types" },
  "Phase 16 — EnvoyAI postures": { disposition: "product", reason: "EnvoyAI is the social product's AI surface" },
  "Phase 23A — Agent Circles": { disposition: "product", reason: "agent circles are a social grouping of agents" },
  "Activity Tracking": { disposition: "core", reason: "the host records its own client activity (`noteClientActivity`)" },
  "Phase 38 — Voice/Video Calls": { disposition: "product", reason: "calls are a social feature (signal-clean, which is exactly why signals cannot decide)" },
  "Phase 31I — Push Notifications": { disposition: "product", reason: "call/chat push notifications" },
  "Phase 40: Agent Network Collaboration Layer (chains)": { disposition: "product", reason: "31 of 36 methods reference product-bound module types" },
  "Phase 44C — Knowledge Base Plugins": { disposition: "core", reason: "knowledge plugins are agent capability, not social" },
};


/**
 * The **residual**, enumerated (plan §2.7: "Only the residual is reviewed, and it
 * is enumerated"). The author's `// ----- Section -----` labels are
 * feature-shaped and sometimes span both halves: `File Sharing` covers file
 * transfer *and* the social feed/blog/web-site feature, and `Identity` covers
 * the node's own identity *and* the owner's human-facing social profile. These
 * members live in a `core`-declared section but are product, each with its
 * reason. The manifest veto cannot see them (`HumanProfile`, `FeedPostSummary`
 * and `PeerProfileView` are all signal-clean), which is why they are declared.
 *
 * A stale entry — a name that is not a member of a `core`-declared section —
 * fails the run, the same way a dead module-size allowlist entry does.
 */
const PRODUCT_MEMBERS = new Map(Object.entries({
  getHumanProfile: "the owner's human-facing social profile, not the node's identity",
  updateHumanProfile: "same — social profile content",
  setPublicProfileThumbnail: "profile gallery is social profile content",
  upsertProfileGalleryPhoto: "profile gallery is social profile content",
  removeProfileGalleryPhoto: "profile gallery is social profile content",
  updateProfileGalleryPhotoVisibility: "profile gallery is social profile content",
  getPeerProfile: "peer *display* profile (human-facing content); peer identity is `getProfile`/identity types",
  listPeerProfiles: "same — peer display profiles",
  requestPeerProfile: "same — fetches a peer's human-facing profile over the mesh",
  cacheDidContactKey: "contact-scoped key cache; contacts are the social trust model",
  getPeerReputationSummary: "peer reputation is the social trust model",
  syncProfileToBonds: "bonds are the social trust model",
  refreshBondPeerProfiles: "bonds are the social trust model",
  warmContactConnection: "contacts are the social trust model (bond warming, not raw connectivity)",
  getChatDiagnostics: "chat-specific diagnostics",
  getMorningReport: "social digest of the day's activity",
  publishWebContentEntry: "web-site publishing — the social publishing feature",
  ensureDefaultWebSite: "web-site publishing",
  listWebContentSections: "web-site publishing",
  deleteWebContentEntry: "web-site publishing",
  listFeedPosts: "feed reading — social publishing",
  listFeedTimeline: "feed reading — social publishing",
  listBlogPosts: "blog reading — social publishing",
  listFeedNotifications: "feed notification inbox",
  dismissFeedNotification: "feed notification inbox",
  dismissAllFeedNotifications: "feed notification inbox",
  listContentEngageNotifications: "feed/blog engagement notifications",
  dismissContentEngageNotifications: "feed/blog engagement notifications",
  getContentEngagement: "feed/blog engagement (stars, comments)",
  toggleContentStar: "feed/blog engagement",
  addContentComment: "feed/blog engagement",
  removeContentComment: "feed/blog engagement",
  listAgentShareProposals: "share proposals addressed to a social contact (`targetOwnerId`, `sensitivity: friends`)",
  dismissAgentShareProposal: "same — contact-addressed share proposals",
  submitAgentShareProposal: "same — contact-addressed share proposals",
}));

// ── manifest ────────────────────────────────────────────────────────────────
const manifest = JSON.parse(await fs.readFile(MANIFEST, "utf8"));
const conceptPattern = new RegExp(manifest.declaredInputs.conceptPattern);
const reusable = new Set(manifest.reusable.map((r) => r.path));
const productBound = new Set(manifest.productBound.map((r) => r.path));

const read = (p) => fs.readFile(p, "utf8");
const rel = (abs) => path.relative(repoRoot, abs).split(path.sep).join("/");

// ── type index over packages/api/src ────────────────────────────────────────

const apiFiles = (await fs.readdir(API_SRC)).filter((f) => f.endsWith(".ts")).sort();
const DECL_RE = /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:interface|type|class|const|enum|function|namespace)\s+([A-Za-z_$][\w$]*)/gm;
const declOf = new Map(); // type name -> Set<repo-relative module>
for (const f of apiFiles) {
  const r = `packages/api/src/${f}`;
  const code = await read(path.join(API_SRC, f));
  for (const m of code.matchAll(DECL_RE)) {
    if (!declOf.has(m[1])) declOf.set(m[1], new Set());
    declOf.get(m[1]).add(r);
  }
}

const depsCache = new Map();
async function apiDeps(r) {
  if (!depsCache.has(r)) {
    const code = await read(path.join(repoRoot, r));
    const out = new Set();
    for (const m of code.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
      out.add(path.posix.normalize(path.posix.join(path.posix.dirname(r), m[1].replace(/\.js$/, ".ts"))));
    }
    depsCache.set(r, out);
  }
  return depsCache.get(r);
}

/** First product-bound module reachable from `r` (through api-internal imports). */
const reachCache = new Map();
async function reachProduct(r, seen = new Set()) {
  if (seen.has(r)) return null;
  seen.add(r);
  if (reachCache.has(r)) return reachCache.get(r);
  if (!reusable.has(r)) return r;
  let hit = null;
  for (const d of await apiDeps(r)) {
    hit = await reachProduct(d, seen);
    if (hit) break;
  }
  reachCache.set(r, hit);
  return hit;
}

// ── parse interface members ─────────────────────────────────────────────────

/**
 * Parse one `export interface X {` body into ordered sections of member blocks.
 * Member text is kept **verbatim** (doc comment included) so the generated file
 * is a faithful move, not a reformat.
 */
async function parseInterface(absFile, interfaceName) {
  const lines = (await read(absFile)).split("\n");
  const start = lines.findIndex((l) => new RegExp(`^export interface ${interfaceName}(?:\\s+extends[^{]*)?\\s*\\{`).test(l));
  if (start === -1) return { found: false, sections: [] };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\}/.test(lines[i])) { end = i; break; }
  }
  const body = lines.slice(start + 1, end);

  const sections = [];
  const isCommentLine = (l) => /^\s*(\/\/|\/\*|\*)/.test(l);
  const isMemberStart = (l) => /^ {2}[^\s/]/.test(l);

  // Depth at the start of each body line, so "is this a top-level member start"
  // can be decided without re-scanning.
  const depthBefore = [];
  let d = 0;
  for (const line of body) {
    depthBefore.push(d);
    for (const ch of line) {
      if (ch === "{" || ch === "(" || ch === "[") d++;
      else if (ch === "}" || ch === ")" || ch === "]") d--;
    }
  }

  // Section headers, for attribution.
  const headers = [];
  for (let li = 0; li < body.length; li++) {
    const h = depthBefore[li] === 0 && /^ {2}\/\/ ----- (.*?)\s*-----\s*$/.exec(body[li]);
    if (h) headers.push({ line: start + 1 + li, name: h[1].trim() });
  }
  const sectionOf = (abs) => {
    let name = "(no section)";
    for (const h of headers) if (h.line < abs) name = h.name;
    return name;
  };

  // A member starts at a top-level `  name…` line — but only when it is *not* a
  // continuation of the previous declaration. Depth is 0 for both a lone line
  // like `getProfile(): NodeProfile;` and the first line of a multi-line
  // signature; the end of the previous declaration is therefore what decides.
  const starts = [];
  let cursor = 0;
  for (let li = 0; li < body.length; li++) {
    if (li < cursor) continue;
    if (depthBefore[li] !== 0 || !isMemberStart(body[li])) continue;
    if (/^ {2}\/\/ -----/.test(body[li])) continue;
    starts.push(li);
    // walk to the end of this declaration: depth back to 0 and `;`-terminated
    let dd = 0;
    let j = li;
    for (; j < body.length; j++) {
      for (const ch of body[j]) {
        if (ch === "{" || ch === "(" || ch === "[") dd++;
        else if (ch === "}" || ch === ")" || ch === "]") dd--;
      }
      if (dd <= 0 && /;\s*$/.test(body[j])) break;
    }
    cursor = j + 1;
  }

  // Each member's text is its own declaration plus the JSDoc immediately above
  // it; the block's line range is the same span (that is what `--apply` cuts).
  const members = [];
  for (let k = 0; k < starts.length; k++) {
    const li = starts[k];
    let first = li;
    // Walk back over the JSDoc, but never over a `// ----- Section -----` header:
    // the header belongs to the section, and absorbing it duplicated the header
    // on every regeneration (caught by running generate twice and diffing).
    while (
      first - 1 >= 0 &&
      isCommentLine(body[first - 1]) &&
      !isMemberStart(body[first - 1]) &&
      !/^ {2}\/\/ ----- /.test(body[first - 1])
    ) first--;
    let last = li;
    let dd = 0;
    for (; last < body.length; last++) {
      for (const ch of body[last]) {
        if (ch === "{" || ch === "(" || ch === "[") dd++;
        else if (ch === "}" || ch === ")" || ch === "]") dd--;
      }
      if (dd <= 0 && /;\s*$/.test(body[last])) break;
    }
    const text = body.slice(first, last + 1).join("\n").replace(/\s+$/, "");
    const nameMatch = /^ {2}(?:readonly\s+)?([A-Za-z_$][\w$]*)/.exec(body[li]);
    const abs = start + 1 + li;
    members.push({ text, name: nameMatch ? nameMatch[1] : null, startIdx: start + 1 + first, endIdx: start + 1 + last, section: sectionOf(abs) });
  }

  const dupes = [];
  const seen = new Map();
  for (const m of members) {
    if (!m.name) continue;
    const key = `${m.section}\u0000${m.name}`;
    if (seen.has(key)) dupes.push(`${m.section} :: ${m.name} (lines ${seen.get(key)} and ${m.startIdx + 1})`);
    else seen.set(key, m.startIdx + 1);
  }
  if (dupes.length) {
    // The generator keys members by name, so a duplicate (overloads, or the same
    // helper declared twice) would be dropped without a word. Fail instead.
    console.error("[fail] duplicate member names inside a section:");
    for (const d of dupes) console.error(`  - ${d}`);
    console.error("  the generator keys members by name; a duplicate cannot be represented.");
    process.exit(1);
  }

  for (const m of members) {
    let s = sections.find((x) => x.name === m.section);
    if (!s) {
      const header = headers.find((h) => h.name === m.section && h.line < m.startIdx);
      s = { name: m.section, headerLine: header ? header.line : null, members: [] };
      sections.push(s);
    }
    s.members.push(m);
  }
  return { found: true, sections };
}

/**
 * Names a member's text refers to, restricted to types declared in the api package.
 *
 * Counted over **comment-stripped** text: a `{@link NodeService.x}` mention in a
 * doc comment is documentation, not a dependency. (The first run of this script
 * vetoed a core section because `CircuitReservationStatus`'s JSDoc linked to
 * `NodeService.getCircuitReservationStatus` — the same "comments are not code"
 * failure the wiring gate and `stripComments` itself were fixed for.)
 */
function refsOf(text) {
  const out = new Set();
  for (const m of stripComments(text).matchAll(/\b([A-Z][A-Za-z0-9_$]*)\b/g)) if (declOf.has(m[1])) out.add(m[1]);
  return out;
}

/**
 * Parse top-level `export (interface|type|class|enum|const|function|namespace)`
 * blocks (JSDoc attached) from the part of a file *before* its `NodeService` /
 * `CoreNodeService` interface. Core members reference types declared in
 * `node-service.ts` (`NodeProfile`, `HumanProfile`, `PeerProfileView`, …); those
 * declarations have to travel with the members, because a core file that
 * imports the product file is product-bound by definition.
 */
async function parseTypeBlocks(absFile, interfaceName) {
  const lines = (await read(absFile)).split("\n");
  const stop = lines.findIndex((l) => new RegExp(`^export interface ${interfaceName}(?:\\s+extends[^{]*)?\\s*\\{`).test(l));
  const limit = stop === -1 ? lines.length : stop;
  const blocks = new Map();
  const START = /^export\s+(?:declare\s+)?(?:abstract\s+)?(interface|type|class|enum|const|function|namespace)\s+([A-Za-z_$][\w$]*)/;
  let i = 0;
  while (i < limit) {
    const m = START.exec(lines[i]);
    if (!m) { i++; continue; }
    let startIdx = i;
    while (startIdx - 1 >= 0 && /^\s*(\*|\/\*\*|\*\/)/.test(lines[startIdx - 1])) startIdx--;
    // The terminator depends on the declaration kind: a `type` alias ends at `;`,
    // an `interface`/`class`/`enum` at its closing `}`. A union alias like
    //     export type X =
    //       | { ok: true; path: string }
    //       | { ok: false; error: string };
    // has a `}` at depth 0 on its *first variant*, so a `[;}]` test stopped there
    // and cut the alias in half — leaving an orphaned `| { ok: false; … };`
    // behind (`tsc`: "Expression expected").
    const braced = m[1] === "interface" || m[1] === "class" || m[1] === "enum" || m[1] === "namespace";
    const END = braced ? /\}\s*$/ : /;\s*$/;
    let depth = 0;
    let j = i;
    for (; j < limit; j++) {
      for (const ch of lines[j]) {
        if (ch === "{" || ch === "(" || ch === "[") depth++;
        else if (ch === "}" || ch === ")" || ch === "]") depth--;
      }
      if (depth <= 0 && END.test(lines[j])) break;
    }
    blocks.set(m[2], { text: lines.slice(startIdx, j + 1).join("\n").replace(/\s+$/, ""), startIdx, endIdx: j, order: startIdx });
    i = j + 1;
  }
  return blocks;
}

const full = await parseInterface(NODE_SERVICE_FILE, FULL_INTERFACE);
const core = await parseInterface(CORE_FILE, CORE_INTERFACE).catch(() => ({ found: false, sections: [] }));
if (!full.found) {
  console.error(`[fail] ${rel(NODE_SERVICE_FILE)}: no \`export interface ${FULL_INTERFACE} {\``);
  process.exit(1);
}

// The union of both files: pre-split every member is in node-service.ts (the
// generated core file is written *from* it, so the same names appear in both),
// post-split each member is in exactly one. Placement therefore prefers the
// product file when a name is in both — that is the pre-split truth — and
// `--check` uses the same union to notice a member added anywhere.
const NODE_SERVICE_REL = rel(NODE_SERVICE_FILE);
const CORE_REL = rel(CORE_FILE);
const sectionOrder = [];
const membersBySection = new Map();
for (const src of [full, core]) {
  for (const s of src.sections) {
    if (!membersBySection.has(s.name)) {
      membersBySection.set(s.name, new Map());
      sectionOrder.push(s.name);
    }
    for (const m of s.members) {
      if (!m.name) continue;
      const from = src === full ? NODE_SERVICE_REL : CORE_REL;
      const existing = membersBySection.get(s.name).get(m.name);
      if (existing && existing.from === NODE_SERVICE_REL) continue;
      membersBySection.get(s.name).set(m.name, { ...m, from });
    }
  }
}

// ── validate the declared dispositions ──────────────────────────────────────

const problems = [];
for (const name of sectionOrder) {
  if (!SECTIONS[name]) problems.push(`undeclared section "${name}" — add it to SECTIONS in this script`);
}
for (const name of Object.keys(SECTIONS)) {
  if (!membersBySection.has(name)) problems.push(`declared section "${name}" matches no section in the interface (stale entry)`);
}
if (problems.length) {
  console.error("[fail] section dispositions and the interface disagree:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

// ── veto: a declared `core` section must survive both manifest signals ──────

const fullTypes = await parseTypeBlocks(NODE_SERVICE_FILE, FULL_INTERFACE);
const coreTypesOnDisk = await parseTypeBlocks(CORE_FILE, CORE_INTERFACE).catch(() => new Map());
const allLocalTypes = new Map([...coreTypesOnDisk, ...fullTypes]);

/**
 * A member or type is acceptable in the core file only if it is concept-free and
 * every type it references resolves to a `reusable` module — with one exception:
 * a type declared in `node-service.ts` is not acceptable *in place*, but it may
 * **travel** to the core file, so it is queued for the closure instead.
 */
async function screen(text, queue) {
  // Concept matching uses the *string-and-comment-stripped* form, matching
  // `classify-modules.mjs`: a doc comment that mentions a product word does not
  // bind the code to it (`lib/source-files.mjs` documents the two strippers).
  if (conceptPattern.test(stripCommentsAndStrings(text))) {
    return { kind: "concept", detail: "names a product concept (manifest conceptPattern)" };
  }
  for (const ref of refsOf(text)) {
    const decls = declOf.get(ref) ?? new Set();
    // A type already in the core file is local to it — and still screened in its
    // own right, which is why it goes on the queue.
    if (decls.has(CORE_REL)) { queue.add(ref); continue; }
    if (decls.has(NODE_SERVICE_REL)) {
      if (allLocalTypes.has(ref)) { queue.add(ref); continue; }
      return { kind: "opaque", detail: `references \`${ref}\`, declared in node-service.ts but not parsed as a movable declaration` };
    }
    for (const r of decls) {
      const hit = await reachProduct(r);
      if (hit) return { kind: "package", detail: `references \`${ref}\` from product-bound ${hit.replace("packages/api/src/", "")}` };
    }
  }
  return null;
}

/** Members of a section that are not excluded by the declared residual. */
const coreMembersOf = (name) =>
  [...membersBySection.get(name).values()].filter((m) => m.name && !PRODUCT_MEMBERS.has(m.name));

// A stale exclusion protects nothing — the same rule the module-size allowlist
// learned (`check-module-size.mjs`): an entry matching no member is a lie.
{
  const coreNames = new Set(sectionOrder.filter((n) => SECTIONS[n].disposition === "core").flatMap((n) => [...membersBySection.get(n).keys()]));
  const stale = [...PRODUCT_MEMBERS.keys()].filter((n) => !coreNames.has(n));
  if (stale.length) {
    console.error("[fail] PRODUCT_MEMBERS entries that match no member of a declared core section:");
    for (const s of stale) console.error(`  - ${s}`);
    console.error("  (either the member was renamed/moved, or its section is no longer core)");
    process.exit(1);
  }
}

// ── the wire surface, which is narrower than the type surface ───────────────
//
// `CoreNodeService` is a *type* surface: every member a reusable consumer may
// program against, including methods the host calls in-process
// (`recordOwnerActivity`, `clearAllUserData`, `exportDidDocument`, …).
// `CoreRpcMethods` is the *wire* surface: only names that were already real RPC
// methods. Conflating the two would widen the JSON-RPC contract with names no
// client can call — which `RpcMethods = CoreRpcMethods | ProductRpcMethods`
// would then advertise as valid.
function unionLiterals(text, typeName) {
  const start = text.indexOf(`export type ${typeName} =`);
  if (start === -1) return null;
  const end = text.indexOf("\n\n", start);
  return [...text.slice(start, end === -1 ? undefined : end).matchAll(/^ {2}\| "([^"]+)"/gm)].map((m) => m[1]);
}
const wsProtocolFile = path.join(API_SRC, "ws-protocol.ts");
const exposedList = unionLiterals(await read(wsProtocolFile), "ProductRpcMethods");
if (!exposedList) {
  console.error(`[fail] ${rel(wsProtocolFile)}: no \`export type ProductRpcMethods =\` union to intersect with`);
  process.exit(1);
}
const exposedMethods = new Set(exposedList);

const coreSectionList = Object.keys(SECTIONS).filter((n) => SECTIONS[n].disposition === "core");
// Both surfaces, computed once: the type surface (all members) and the wire
// surface (members that are real RPC methods). See the note above `unionLiterals`.
const coreWireNames = (section) => coreMembersOf(section).map((m) => m.name).filter((n) => exposedMethods.has(n));
const coreMemberNames = coreSectionList.flatMap((n) => coreMembersOf(n).map((m) => m.name));
const coreMembersNotExposed = coreMemberNames.filter((n) => !exposedMethods.has(n));
const coreWireTotal = coreSectionList.reduce((n, sec) => n + coreWireNames(sec).length, 0);
const coreSectionNames = coreSectionList;
const coreTypeNames = new Set();
{
  const queue = new Set();
  for (const n of coreSectionNames) {
    for (const m of coreMembersOf(n)) {
      const v = await screen(m.text, queue);
      if (v) {
        console.error(`[fail] section "${n}" is declared core but \`${m.name}\` fails the manifest veto:`);
        console.error(`  - ${v.detail}`);
        console.error("  either clean the signature up, declare the section `product`/`undecided`, or add the member to PRODUCT_MEMBERS with a reason.");
        process.exit(1);
      }
    }
  }
  // closure: types the core members need, and the types *those* need
  while (queue.size) {
    const name = [...queue][0];
    queue.delete(name);
    if (coreTypeNames.has(name)) continue;
    const block = allLocalTypes.get(name);
    if (!block) {
      console.error(`[fail] \`${name}\` is referenced by a core member but not declared in either interface file`);
      process.exit(1);
    }
    const v = await screen(block.text, queue);
    if (v) {
      console.error(`[fail] \`${name}\` must travel to the core file but fails the manifest veto:`);
      console.error(`  - ${v.detail}`);
      console.error("  a core member needs a type that is not itself reusable — the section cannot be core yet.");
      process.exit(1);
    }
    coreTypeNames.add(name);
  }
}

/** A veto for a member: concept, product-bound reference, or an unparsable local type. */
async function vetoFor(text) {
  return await screen(text, new Set());
}

const evidence = [];
let vetoed = 0;
for (const name of sectionOrder) {
  const d = SECTIONS[name].disposition;
  const members = [...membersBySection.get(name).values()];
  const kept = members.filter((m) => m.name && !PRODUCT_MEMBERS.has(m.name));
  const excluded = members.length - kept.length;
  let clean = 0;
  const failures = [];
  for (const m of kept) {
    const v = await vetoFor(m.text);
    if (!v) clean++;
    else {
      failures.push(`${m.name}: ${v.detail}`);
      if (d === "core") vetoed++;
    }
  }
  evidence.push({ section: name, disposition: d, members: members.length, excluded, clean, failures });
}

if (flag("--evidence")) {
  console.log(`sections: ${sectionOrder.length}`);
  console.log("section".padEnd(56) + "declared".padStart(11) + "members".padStart(9) + "excl".padStart(6) + "clean".padStart(7));
  for (const e of evidence) {
    console.log(e.section.padEnd(56) + e.disposition.padStart(11) + String(e.members).padStart(9) + String(e.excluded).padStart(6) + String(e.clean).padStart(7));
  }
  const coreCount = coreSectionNames.reduce((n, s) => n + coreMembersOf(s).length, 0);
  const all = evidence.reduce((n, e) => n + e.members, 0);
  console.log(`\ncore: ${coreCount} members of ${all} (${PRODUCT_MEMBERS.size} excluded by declared residual); vetoed core-section members: ${vetoed}`);
  console.log(`core types that must travel: ${coreTypeNames.size}`);
}

if (flag("--json")) {
  const payload = {
    coreFile: rel(CORE_FILE),
    nodeServiceFile: rel(NODE_SERVICE_FILE),
    coreSections: Object.keys(SECTIONS).filter((n) => SECTIONS[n].disposition === "core"),
    totalMembers: evidence.reduce((n, e) => n + e.members, 0),
    coreMembers: Object.keys(SECTIONS)
      .filter((n) => SECTIONS[n].disposition === "core")
      .flatMap((n) => coreMembersOf(n).map((m) => m.name)),
    coreWireMembers: Object.keys(SECTIONS)
      .filter((n) => SECTIONS[n].disposition === "core")
      .flatMap((n) => coreWireNames(n)),
    coreMembersNotExposed: Object.keys(SECTIONS)
      .filter((n) => SECTIONS[n].disposition === "core")
      .flatMap((n) => coreMembersOf(n).map((m) => m.name))
      .filter((n) => !exposedMethods.has(n)),
    excludedMembers: [...PRODUCT_MEMBERS.keys()],
    sections: evidence.map((e) => ({ section: e.section, disposition: e.disposition, members: e.members, excluded: e.excluded })),
  };
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

if (flag("--where")) {
  const wanted = args[args.indexOf("--where") + 1];
  if (!wanted) { console.error("usage: --where <memberName>"); process.exit(1); }
  let found = false;
  for (const [section, map] of membersBySection) {
    const m = map.get(wanted);
    if (!m) continue;
    found = true;
    const linesOf = (await read(m.from === NODE_SERVICE_REL ? NODE_SERVICE_FILE : CORE_FILE)).split("\n");
    console.log(`${wanted} — section "${section}", in ${m.from}, lines ${m.startIdx + 1}..${m.endIdx + 1}`);
    for (let i = m.startIdx; i <= m.endIdx; i++) console.log(`  ${String(i + 1).padStart(5)}: ${linesOf[i] ?? "<past EOF>"}`);
  }
  if (!found) console.error(`no member named ${wanted}`);
  process.exit(found ? 0 : 1);
}

// ── emit ────────────────────────────────────────────────────────────────────

// Emission follows the declared order in SECTIONS (which mirrors the original
// file), not the parse order — the parse order changes once sections live in two
// files, and a generated file that reorders itself on every run is unreadable in
// review.
const coreSections = coreSectionList;

// imports needed by core members, grouped by specifier, mirroring node-service.ts
// Where each name comes from. Both interface files contribute, and the split's
// own `./core-node-service.js` specifier is ignored: node-service.ts re-exports
// the moved types from the core file (the §10 E9 (b) dual export), so treating
// that as a source would make the generated file import its own exports.
const importMap = new Map(); // specifier -> { named: Set<name> }
for (const file of [NODE_SERVICE_FILE, CORE_FILE]) {
  const text = await read(file).catch(() => "");
  for (const m of text.matchAll(/import type \{([^}]+)\} from "([^"]+)";/g)) {
    const spec = m[2];
    if (spec === "./core-node-service.js") continue;
    if (!importMap.has(spec)) importMap.set(spec, { named: new Set() });
    for (const n of m[1].split(",").map((x) => x.trim()).filter(Boolean)) importMap.get(spec).named.add(n);
  }
}
const needed = new Map(); // specifier -> Set<name>
const wanted = [
  ...coreSections.flatMap((n) => coreMembersOf(n).map((m) => m.text)),
  ...[...coreTypeNames].map((n) => allLocalTypes.get(n).text),
];

// Where a referenced name comes from. Two sources, because neither alone is
// enough: the declaring module (for api-internal types) and a repo-wide import
// scan (for types from another package). The scan must be repo-wide, not
// api-scoped: after the split, `node-service.ts` was the *only* file in
// packages/api/src importing `OwnerIdentity`, and `--apply` prunes imports the
// moved code took with it — so an api-scoped scan silently loses them and the
// generated file stops compiling.
async function scanImports(dir, out) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (["node_modules", "dist", ".git", ".dart_tool", "build", "target"].includes(e.name)) continue;
      await scanImports(path.join(dir, e.name), out);
      continue;
    }
    if (!e.name.endsWith(".ts")) continue;
    const text = await read(path.join(dir, e.name)).catch(() => "");
    for (const m of text.matchAll(/import type \{([^}]+)\} from "([^"]+)";/g)) {
      const spec = m[2];
      if (spec === "./node-service.js" || spec === "./core-node-service.js") continue;
      for (const n of m[1].split(",").map((x) => x.trim()).filter(Boolean)) {
        const prev = out.get(n);
        // prefer a package specifier: it is valid from anywhere in the package
        if (!prev || (prev.startsWith(".") && !spec.startsWith("."))) out.set(n, spec);
      }
    }
  }
  return out;
}
const repoImports = new Map();
for (const dir of ["packages", "apps"]) await scanImports(path.join(repoRoot, dir), repoImports);
const toJs = (spec) => spec.replace(/\.ts$/, ".js"); // NodeNext: specifiers use .js
const sourceOf = (name) => {
  // Declaring module first: a type declared inside this package is a sibling
  // import, not a package self-import, and the derived path is exactly one hop.
  const decls = [...(declOf.get(name) ?? [])].filter((r) => r !== NODE_SERVICE_REL && r !== CORE_REL);
  if (decls.length) return `./${path.basename(decls[0]).replace(/\.ts$/, ".js")}`;
  const scanned = repoImports.get(name);
  if (scanned) return toJs(scanned);
  const viaImport = [...importMap].find(([, v]) => v.named.has(name))?.[0];
  return viaImport ? toJs(viaImport) : null;
};
{
  const movedText = stripComments(wanted.join("\n"));
  const unresolved = [];
  for (const m of movedText.matchAll(/\b([A-Z][A-Za-z0-9_$]*)\b/g)) {
    const name = m[1];
    if (coreTypeNames.has(name)) continue; // emitted in this file
    const spec = sourceOf(name);
    if (!spec) { unresolved.push(name); continue; }
    if (!needed.has(spec)) needed.set(spec, new Set());
    needed.get(spec).add(name);
  }
  if (unresolved.length && process.env.CORE_DEBUG) {
    console.error("[debug] names with no resolvable module:", [...new Set(unresolved)].join(", "));
  }
}

const importLines = [];
for (const spec of [...needed.keys()].sort((a, b) => (a.startsWith(".") === b.startsWith(".") ? a.localeCompare(b) : a.startsWith(".") ? 1 : -1))) {
  const names = [...needed.get(spec)].sort();
  importLines.push(`import type { ${names.join(", ")} } from "${spec}";`);
}

const header = `/**
 * CoreNodeService — the **reusable** half of the RPC contract (plan §10 E9).
 *
 * GENERATED by \`node scripts/generate-core-surface.mjs\` — **do not hand-edit**.
 * \`--check\` fails when this file and the interface disagree.
 *
 * ## What it is
 *
 * The surface a product that is *not* EnvoyMesh social may depend on:
 * **${coreSections.length} declared sections**, **${coreMemberNames.length} members**, plus the
 * **${coreTypeNames.size} type declarations** their signatures need
 * (${PRODUCT_MEMBERS.size} members inside those sections are declared product in the
 * generator's residual list, each with a reason).
 *
 * The two halves are deliberately different sizes:
 *
 *   * **\`CoreNodeService\`** — all ${coreMemberNames.length} members: the *type* surface a
 *     reusable consumer may program against, including methods the host calls
 *     in-process rather than over the wire (${coreMembersNotExposed.length}: ${coreMembersNotExposed.slice(0, 4).map((n) => `\`${n}\``).join(", ")}${coreMembersNotExposed.length > 4 ? ", …" : ""}).
 *   * **\`CoreRpcMethods\`** — ${coreWireTotal} names: the *wire* surface, intersected with the
 *     real \`ProductRpcMethods\` union in \`ws-protocol.ts\`, so
 *     \`RpcMethods = CoreRpcMethods | ProductRpcMethods\` cannot advertise a
 *     method that no client can call.
 *
 * The full \`NodeService\` **extends** \`CoreNodeService\` and \`RpcMethods\`
 * **contains** \`CoreRpcMethods\`, so every existing consumer is unaffected — the
 * split is additive in their direction (plan §10 E9 (a)).
 *
 * ## Why the membership looks declared rather than derived
 *
 * E9 asked for membership "generated from the Axis-1 manifest". Measured, the
 * manifest's module-shaped \`conceptPattern\` cannot decide it: applied to
 * signatures it calls 362 of 435 methods clean — \`sendCallInvite\`,
 * \`listChatHistory\` and every commerce method included — while the entire
 * Voice/Video Calls section is signal-clean yet plainly product.
 *
 * So the signals **veto** and a declared section disposition decides
 * (\`SECTIONS\` in the generator, 21 entries, reviewable as a diff — the same
 * shape as \`scripts/inventory-node-stores.mjs\`). A member in a \`core\` section
 * that names a product concept, or reaches a \`product-bound\` module through
 * the types in its own signature, fails the generator loudly instead of
 * quietly widening the core surface.
 *
 * Sections declared \`core\`: ${coreSections.map((s) => `\`${s}\``).join(", ")}.
 *
 * Design and rationale: \`docs/envoymesh-refactoring-plan.md\` §10 E9, §8.13.
 */
`;

const typeBlockLines = [];
for (const name of [...coreTypeNames].sort((a, b) => allLocalTypes.get(a).order - allLocalTypes.get(b).order)) {
  typeBlockLines.push(allLocalTypes.get(name).text, "");
}

const unionLines = [];
for (const name of coreSections) {
  const wire = coreWireNames(name);
  if (!wire.length) continue; // every member in this section is in-process only
  unionLines.push(`  // ${name}`);
  for (const n of wire) unionLines.push(`  | "${n}"`);
}

const interfaceLines = [];
for (const name of coreSections) {
  interfaceLines.push(`  // ----- ${name} -----`);
  for (const member of coreMembersOf(name)) {
    interfaceLines.push(member.text.replace(/^\n+/, "").replace(/\s+$/, ""));
    interfaceLines.push("");
  }
  while (interfaceLines[interfaceLines.length - 1] === "") interfaceLines.pop();
  interfaceLines.push("");
}
while (interfaceLines[interfaceLines.length - 1] === "") interfaceLines.pop();

const generated = [
  header,
  ...importLines,
  "",
  ...typeBlockLines,
  ...(typeBlockLines.length ? [""] : []),
  "/** The RPC method names a reusable consumer may depend on. */",
  "export type CoreRpcMethods =",
  ...unionLines,
  "",
  "export interface CoreNodeService {",
  ...interfaceLines,
  "}",
  "",
].join("\n");

// ── write / check ───────────────────────────────────────────────────────────

if (flag("--apply")) {
  const text = await read(NODE_SERVICE_FILE);
  const cut = new Set();
  const movedTypes = [...coreTypeNames].filter((n) => fullTypes.has(n));
  for (const n of movedTypes) {
    const b = fullTypes.get(n);
    for (let i = b.startIdx; i <= b.endIdx; i++) cut.add(i);
  }
  let movedMembers = 0;
  const fullyMovedHeaders = [];
  for (const name of coreSections) {
    const all = [...membersBySection.get(name).values()];
    const moving = coreMembersOf(name).filter((m) => m.from === NODE_SERVICE_REL);
    for (const m of moving) {
      movedMembers++;
      for (let i = m.startIdx; i <= m.endIdx; i++) cut.add(i);
    }
    if (moving.length === all.length) {
      const s = full.sections.find((x) => x.name === name);
      if (s?.headerLine != null) fullyMovedHeaders.push(s.headerLine);
    }
  }
  for (const h of fullyMovedHeaders) {
    cut.add(h);
    if ((await read(NODE_SERVICE_FILE)).split("\n")[h + 1]?.trim() === "") cut.add(h + 1);
  }

  const lines = text.split("\n");
  const kept = lines.filter((_, i) => !cut.has(i));

  // Import the core contract + the types that travelled with it.
  if (kept.some((l) => l.includes('from "./core-node-service.js"'))) {
    console.log("already split — nothing to apply");
    process.exit(0);
  }
  const importNames = ["CoreNodeService", ...movedTypes].sort((a, b) => (a === "CoreNodeService" ? -1 : b === "CoreNodeService" ? 1 : a.localeCompare(b)));
  const lastImport = kept.reduce((acc, l, i) => (/^(import|export) (type )?\{/.test(l) || /^\} from "/.test(l) ? i : acc), 0);
  const importLine = `import type {\n${importNames.map((n) => `  ${n},`).join("\n")}\n} from "./core-node-service.js";`;
  // Dual export for the deprecation window (plan §10 E9 (b)): every deep
  // importer of the moved types keeps working through `./node-service.js`, and
  // `export * from "./node-service.js"` in the barrel is unaffected.
  const reexportNames = [...movedTypes, "CoreNodeService", "CoreRpcMethods"].sort((a, b) => (a === "CoreNodeService" ? -1 : b === "CoreNodeService" ? 1 : a.localeCompare(b)));
  const reexportLine = `export type {\n${reexportNames.map((n) => `  ${n},`).join("\n")}\n} from "./core-node-service.js";`;
  kept.splice(lastImport + 1, 0, "", importLine, reexportLine);

  let out = kept.join("\n");
  out = out.replace(
    new RegExp(`^export interface ${FULL_INTERFACE} \\{$`, "m"),
    `export interface ${FULL_INTERFACE} extends ${CORE_INTERFACE} {`,
  );

  // Prune imports that only the moved code used — an unused import in a
  // hand-maintained file is noise, and the module graph counts it as a
  // dependency. Names that are still referenced stay.
  const stripped = stripComments(out);
  out = out.replace(/import type \{([^}]+)\} from "([^"]+)";/g, (whole, namesRaw, spec) => {
    const names = namesRaw.split(",").map((s) => s.trim()).filter(Boolean);
    const keep = names.filter((n) => new RegExp(`\\b${n.replace(/[$]/g, "\\$")}\\b`).test(stripped.replace(whole, "")));
    if (!keep.length) return "";
    if (keep.length === names.length) return whole;
    return `import type { ${keep.join(", ")} } from "${spec}";`;
  });
  out = out.replace(/\n{3,}/g, "\n\n");

  await fs.writeFile(NODE_SERVICE_FILE, out);
  console.log(`applied: moved ${movedMembers} members + ${movedTypes.length} type declarations out of ${rel(NODE_SERVICE_FILE)}`);
}

if (flag("--check")) {
  let onDisk = null;
  try { onDisk = await read(CORE_FILE); } catch { /* missing */ }
  if (onDisk === null) {
    console.error(`[fail] ${rel(CORE_FILE)} is missing — run node scripts/generate-core-surface.mjs`);
    process.exit(1);
  }
  if (onDisk !== generated) {
    console.error(`[fail] ${rel(CORE_FILE)} is stale — re-run node scripts/generate-core-surface.mjs`);
    console.error("       (a member was added/moved, or a section disposition changed)");
    process.exit(1);
  }
  // Placement: the product file must not still declare a core member.
  const stillInProduct = coreSections.flatMap((n) => coreMembersOf(n).filter((m) => m.from === rel(NODE_SERVICE_FILE)));
  if (stillInProduct.length) {
    console.error(`[fail] ${rel(NODE_SERVICE_FILE)} still declares ${stillInProduct.length} core member(s): ${stillInProduct.slice(0, 5).map((m) => m.name).join(", ")}`);
    process.exit(1);
  }
  const fullText = await read(NODE_SERVICE_FILE);
  if (!/export type \{[^}]*\} from "\.\/core-node-service\.js";/s.test(fullText)) {
    console.error(`[fail] ${rel(NODE_SERVICE_FILE)}: the dual export of the moved types is missing (plan §10 E9 (b))`);
    process.exit(1);
  }
  if (!new RegExp(`export interface ${FULL_INTERFACE} extends ${CORE_INTERFACE}`).test(fullText)) {
    console.error(`[fail] ${rel(NODE_SERVICE_FILE)}: \`${FULL_INTERFACE}\` must \`extends ${CORE_INTERFACE}\``);
    process.exit(1);
  }
  console.log(`core-surface OK — ${coreMemberNames.length} core methods over ${coreSections.length} declared sections (${sectionOrder.length} total)`);
  process.exit(0);
}

await fs.writeFile(CORE_FILE, generated);
console.log(`wrote ${rel(CORE_FILE)} — ${coreMemberNames.length} methods over ${coreSections.length} declared sections`);
