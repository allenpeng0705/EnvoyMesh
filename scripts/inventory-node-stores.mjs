/**
 * Node kernel store inventory — which stores a kernel needs, and which are the
 * product's.
 *
 * **Why this is a script and not a paragraph.** Plan §8.9 needs Step 4's missing
 * brief: *"which RPC areas read which store"*. Two mechanical attempts to answer
 * it failed, and both failures are worth recording because they are the reason
 * this is not a one-off analysis:
 *
 * 1. **"Where is the factory defined?"** classifies nothing — all 29 stores come
 *    from `@envoymesh/local-store` (26) or two node modules, so the package
 *    boundary does not separate kernel from product.
 * 2. **"Which modules read the field?"** classifies everything the same way.
 *    Every accessor is read inside `node-service-impl.ts`, which is itself
 *    `product-bound`, so the manifest answered "product-bound" for all 29. *A
 *    measurement that classifies everything identically has measured nothing.*
 *
 * What does discriminate is the store's **purpose** and the **RPC areas** that
 * read it — so this script reports exactly that, from two sources it can cite:
 * the store module's own doc comment, and the methods that touch the field. The
 * grouping itself is a **reviewed table** (`STORE_GROUPS` below), not a derived
 * value: the script's job is to make the judgement auditable and repeatable, not
 * to pretend the judgement is mechanical.
 *
 * **What this does *not* see** (all four exist in the real tree today, so the
 * completeness gate is weaker than its message suggests):
 *
 * | Shape | Example | Seen? |
 * |---|---|---|
 * | `create*Store(profileDir)` / `new XStore(profileDir)` in the constructor | the gated stores | ✅ |
 * | field initializer `private readonly _x = new XStore()` | `_publishedLibraryStore`, `_chainStore` | ✅ |
 * | `this._x.init(profileDir)` | `_capabilityIndex` | ✅ |
 * | `const x = (await )?createYStore(this._profileDir)` in a method | `createEnvoyHarnessSessionStore` ×10 | ✅ |
 * | object-literal store fields | `workerLeases: new WorkerLeaseStore()` | ❌ |
 * | `const x = new LocalMemoryStore({ … })` | `node-service-impl.ts:7866` | ❌ |
 * | `const x = new SessionStore({ dir: join(this._profileDir, …) })` | `node-service-impl.ts:7869` | ❌ |
 * | `await createPublishedExternalStore(this._profileDir).loadAll()` | `node-service-impl.ts:4241` | ❌ |
 *
 * `--check` therefore proves "every store the parser finds is grouped", not
 * "every store in the node is parsed". Treat the counts as a floor.
 *
 * **Usage:**
 * ```sh
 * node scripts/inventory-node-stores.mjs             # markdown to stdout
 * node scripts/inventory-node-stores.mjs --json      # machine-readable
 * node scripts/inventory-node-stores.mjs --out FILE  # write markdown
 * node scripts/inventory-node-stores.mjs --check     # completeness gate
 * ```
 *
 * **Exit codes:** 0 = ok; 1 = `--check` found a store with no group, or a group for
 * a store that no longer exists, or the method parser stopped matching (which
 * would otherwise print a plausible, evidence-free report — it did, on the first
 * run: `m.end` is the Python API, and with `undefined` as the offset every method
 * body became the same top-level block).
 */

import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

/**
 * The reviewed split.
 *
 * `kernel` — a host that is not EnvoyMesh needs it (identity, devices, sessions,
 * pairing, discovery, config, capability bookkeeping).
 * `product` — it exists because the EnvoyMesh product has this feature (social
 * chat, family profiles and rooms, market/shop, agent circles, content feeds).
 * `undecided` — grounds for both readings; listed rather than guessed.
 */
const STORE_GROUPS = {
  _agentIdentityStore: ["kernel", "the node's own agent identity — any host with an agent needs it"],
  _configStore: ["kernel", "node configuration, and the stub fallback exists precisely so a host without a profile dir still has one"],
  _sessionTokenStore: ["kernel", "thin-client session tokens — the pairing/connect story (V1) depends on it"],
  _deviceAuthorizationStore: ["kernel", "authorized devices (device certificates), not a social feature"],
  _capabilityManifestStore: ["kernel", "what this node advertises — capability discovery, not social"],
  _contactOwnerKeyStore: ["kernel", "per-contact encryption keys used by mesh messaging"],
  _peerProfileCacheStore: ["kernel", "cached peer profiles fetched over the mesh"],
  _multihopDiscoveryStore: ["kernel", "multi-hop discovery routing state"],
  _discoverySeedStore: ["kernel", "global mesh dial pool"],
  _peerReputationStore: ["kernel", "peer reputation, consulted by dial policy"],
  _reputationAnchorStore: ["product", "reputation anchors belong to the market/commerce feature; a host with no market has nothing to anchor"],
  _documentAcquisitionJobStore: ["product", "document acquisition is the product's document agent, not a transport capability"],
  _capabilityProviderJobStore: ["product", "the provider side of the agent network exists because the product orchestrates team jobs"],

  _chatLogStore: ["product", "human chat transcripts"],
  _chatRoomStore: ["product", "mesh chat rooms"],
  _chatRoomPendingSyncStore: ["product", "queued chat-room sync deliveries"],
  _chatRoomPendingMessageStore: ["product", "queued chat-room message deliveries"],
  _chatDraftStore: ["product", "chat drafts"],
  _agentActivityStore: ["product", "the owner Activity feed"],
  _agentCardStore: ["product", "agent cards shown in the social UI"],
  _autoReplyLimitStore: ["product", "auto-reply rate limits (chat feature)"],
  _familyProfileStore: ["product", "family profiles — Phase 51 identities on one home node"],
  _familyRoomStore: ["product", "family group rooms"],
  _shopStore: ["product", "Envoy Market shop listings"],
  _marketCacheStore: ["product", "peer market listing cards"],
  _marketSearchHistoryStore: ["product", "market browse search history"],
  _commerceReceiptStore: ["product", "commerce receipts"],
  _socialProxyStore: ["product", "social proxy sessions"],
  _circleStore: ["product", "Agent Circles"],

  // Not conditioned on `profileDir` at all, and therefore invisible to a count
  // of "constructor stores": these are field initializers, and only their
  // `init(profileDir)` is gated (around line 2545). All three are coding state.
  _codingHeartbeatStore: ["product", "Envoy Harness coding heartbeat"],
  _codingRuntimeStore: ["product", "Envoy Harness coding runtime selection"],
  _codingScheduleStore: ["product", "Envoy Harness coding schedules"],

  // Initialised — not created — inside `if (profileDir && …)`.
  _chainStore: ["product", "chain orchestration store"],
  _delegatedChainStore: ["product", "delegated chain ownership"],
  _capabilityIndex: ["kernel", "capability index over the local vault — mesh capability discovery"],

  // A third gating shape: `getFilePath: () => string | null`, resolved lazily by
  // the store itself (`node-service-persistence.ts`, `node-service-continuity.ts`).
  // These already degrade correctly with no profile dir — worth knowing, because a
  // kernel split does not have to touch them.
  _intentHistoryStore: ["kernel", "recent mesh intent history — node diagnostics, not a social feature"],
  _continuityStore: ["kernel", "agent-turn continuity across restarts — any host with an agent needs it"],
  _publishedLibraryStore: ["product", "the published library a peer reads; the read side is a mesh intent, the publishing feature is the product's"],

  // A fourth shape — locals and object-literal entries, keyed by binding name
  // (there is no field to key on). Found by widening the scan after a reviewer
  // showed the first three shapes missed them entirely.
  "local:store": ["product", "web-content cache behind agent cards"],
  "local:publishedIds": ["product", "ids of the published library"],
  "local:publishedStore": ["product", "published library store, second call site"],
  "local:externalExports": ["product", "published external (IPFS) exports"],
  "local:sessionStore": ["product", "Envoy Harness session state"],
  "local:memoryStore": ["product", "Envoy Harness agent memory (per-cwd `memories/`)"],
  "local:sensitivityStore": ["kernel", "knowledge-sensitivity overrides, consulted by the mesh's access decisions — a host without it cannot answer `knowledge.query` safely"],
  "local:workerLeases": ["product", "agent-network worker leases are reached only through the product's chain/team-jobs orchestration"],
  "local:workerReliability": ["product", "worker reliability history is the same feature as the leases"],
  "local:attemptReceipts": ["product", "attempt receipts are the same feature as the leases"],
};

/** Store fields declared in the constructor as `this._x = … <factory>(profileDir)`. */
async function inventory() {
  const implPath = path.join(root, "apps/node/src/node-service-impl.ts");
  const impl = await fs.readFile(implPath, "utf8");
  const ctorStart = impl.indexOf("constructor(");
  const ctorEnd = impl.indexOf("\n  }\n", ctorStart);
  if (ctorStart < 0 || ctorEnd < 0) {
    // Without this guard a miss made `slice(ctorStart, -1)` treat the whole file
    // as "the constructor" and report a plausible, wrong inventory.
    throw new Error("inventory-node-stores: could not locate the NodeServiceImpl constructor");
  }
  const ctor = impl.slice(ctorStart, ctorEnd);

  // `create*Store(profileDir)`, any `*Store` class (which covers `new XStore(…)`),
  // and the plain-`new` form. The first version matched only `create…|AgentCircleStore`,
  // so a store added as `this._x = new MysteryStore(profileDir)` was invisible to the
  // completeness gate — the most natural way to add one.
  const stores = [
    ...ctor.matchAll(
      /this\.(_?[A-Za-z0-9_]+)\s*=\s*(?:[^;]*?)\b(create[A-Za-z0-9]*Store|[A-Z][A-Za-z0-9]*Store)\s*\(/g,
    ),
  ].map((m) => ({ field: m[1], factory: m[2] }));

  // Methods across every `node-service*.ts` (the class is split across ~40 mixin
  // modules), so a store read anywhere is attributed.
  const files = (await fs.readdir(path.join(root, "apps/node/src")))
    .filter((n) => n.startsWith("node-service") && n.endsWith(".ts"))
    .sort();
  const methodRe =
    /^ {2}(?:public |private |protected )?(?:async )?(?:static )?([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[^>]*>)?\(/gm;

  const readers = new Map(stores.map((s) => [s.field, []]));
  for (const file of files) {
    const text = await fs.readFile(path.join(root, "apps/node/src", file), "utf8");
    const methods = [];
    for (const m of text.matchAll(methodRe)) {
      const name = m[1];
      if (["if", "for", "while", "switch", "return", "catch", "constructor"].includes(name)) continue;
      // `m.index + m[0].length`, not `m.end` — that is the Python API. With
      // `undefined` as the offset, `indexOf` starts at 0 and every method body
      // became the same top-level block, which is how the first run of this
      // script produced a report with an empty evidence column.
      const open = text.indexOf("{", m.index + m[0].length);
      if (open < 0) continue;
      let depth = 0;
      let i = open;
      for (; i < text.length; i += 1) {
        if (text[i] === "{") depth += 1;
        else if (text[i] === "}") {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      methods.push([name, m.index, i]);
    }
    for (const [name, s, e] of methods) {
      const body = text.slice(s, e);
      for (const { field } of stores) {
        if (new RegExp(`\\bthis\\.${field}\\b`).test(body)) {
          readers.get(field).push({ file, method: name });
        }
      }
    }
  }

  // Where each factory lives, and what its module says it is for.
  const sources = [
    ...(await fs.readdir(path.join(root, "packages/local-store/src"))).map((n) => `packages/local-store/src/${n}`),
    ...files.map((n) => `apps/node/src/${n}`),
  ].filter((p) => p.endsWith(".ts"));

  const origin = new Map();
  for (const rel of sources) {
    const text = await fs.readFile(path.join(root, rel), "utf8");
    for (const { factory } of stores) {
      if (origin.has(factory)) continue;
      if (new RegExp(`export (?:const|function|class) ${factory}\\b`).test(text)) {
        const doc = /^\s*\/\*\*\s*\n?((?:\s*\*[^\n]*\n)+)/.exec(text);
        const firstLine = doc
          ? doc[1]
              .split("\n")
              .map((l) => l.trim().replace(/^\*\s?/, "").trim())
              .filter(Boolean)[0] ?? ""
          : "";
        origin.set(factory, { file: rel, doc: firstLine });
      }
    }
  }

  // Two more shapes a `profileDir`-gated constructor scan cannot see:
  //   * field initializers — `private readonly _x = new XStore()`, created
  //     unconditionally, with only their `init(profileDir)` gated;
  //   * `init(profileDir)` — stores created elsewhere and initialised here.
  const extra = new Map();
  for (const m of impl.matchAll(
    /private (?:readonly )?(_?[A-Za-z0-9_]+)\s*=\s*new\s+([A-Za-z0-9_]*Store)\s*\(/g,
  )) {
    extra.set(m[1], { field: m[1], factory: m[2], created: "field initializer" });
  }
  for (const m of impl.matchAll(/this\.(_?[A-Za-z0-9_]+)\.init\(profileDir\)/g)) {
    if (!extra.has(m[1]) && !stores.some((s) => s.field === m[1])) {
      extra.set(m[1], { field: m[1], factory: "(created elsewhere)", created: "init(profileDir)" });
    }
  }
  const additional = [...extra.values()].filter((e) => !stores.some((s) => s.field === e.field));

  // Per-call stores, built inside methods from `this._profileDir`. Nothing gates
  // them, which only works because a missing directory is replaced by a
  // placeholder (see `profileDirFallback`).
  const perCall = new Map();
  for (const m of impl.matchAll(
    /const \w+ = (?:await )?(create[A-Za-z0-9]*Store)\(this\._profileDir\)/g,
  )) {
    perCall.set(m[1], (perCall.get(m[1]) ?? 0) + 1);
  }

  // Fourth shape: store constructions that are neither a `this._` field nor the
  // per-call pattern above — a local (`const sessionStore = new SessionStore({…})`)
  // or an object-literal entry (`workerLeases: new WorkerLeaseStore()`). Keyed by
  // the binding name, because there is no field to key on.
  const others = new Map();
  for (const file of files) {
    const text = await fs.readFile(path.join(root, "apps/node/src", file), "utf8");
    for (const m of text.matchAll(
      /(?:const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:await\s+)?|([A-Za-z_$][A-Za-z0-9_$]*)\s*:\s*)(?:new\s+)?(create[A-Za-z0-9]*Store|[A-Z][A-Za-z0-9]*Store)\s*\(/g,
    )) {
      const binding = m[1] ?? m[2];
      const factory = m[3];
      const key = `local:${binding}`;
      const prev = others.get(key);
      if (prev) prev.count += 1;
      else others.set(key, { field: key, factory, created: "local / object literal", count: 1 });
    }
  }
  const localStores = [...others.values()].filter(
    (e) => !stores.some((s) => s.field === e.field) && e.factory !== "NodeConfigStore",
  );

  const row = ({ field, factory, created }) => {
    const [group, reason] = STORE_GROUPS[field] ?? ["undecided", "not reviewed yet"];
    return {
      field,
      factory,
      created,
      origin: origin.get(factory) ?? { file: "(not found)", doc: "" },
      group,
      reason,
      readers: readers.get(field) ?? [],
    };
  };

  return {
    stores: stores.map(({ field, factory }) =>
      row({ field, factory, created: "constructor, gated on profileDir" }),
    ),
    additional: additional.map(row),
    locals: localStores.map(row),
    perCall: [...perCall.entries()].map(([factory, count]) => ({ factory, count })),
    profileDirFallback: /this\._profileDir = profileDir \?\? "([^"]+)"/.exec(impl)?.[1] ?? null,
  };
}

const { stores: rows, additional, locals, perCall, profileDirFallback } = await inventory();
const all = [...rows, ...additional, ...locals];

// A parser that silently stops matching produces a *plausible* report: every
// store listed, every evidence column empty. That is the failure this check
// exists for — the first run of this script shipped exactly that.
const storesWithReaders = rows.filter((r) => r.readers.length > 0).length;
if (storesWithReaders === 0) {
  console.error(
    "inventory-node-stores: no store has any reading method — the method parser has " +
      "stopped matching. Refusing to print an evidence-free report.",
  );
  process.exit(1);
}
const counts = all.reduce(
  (acc, r) => ({ ...acc, [r.group]: (acc[r.group] ?? 0) + 1 }),
  {},
);

if (flag("--check")) {
  // Completeness, not correctness: a new store must be *grouped*, and a table
  // entry must still exist. Whether a given store is kernel or product is a
  // review question — but leaving it out of the table entirely is how the split
  // silently stops covering everything it claims to cover.
  const missing = all.filter((r) => !(r.field in STORE_GROUPS)).map((r) => r.field);
  const stale = Object.keys(STORE_GROUPS).filter((f) => !all.some((r) => r.field === f));
  if (missing.length > 0 || stale.length > 0) {
    for (const field of missing) {
      console.error(
        `[fail] ${field}: a store with no group — add it to STORE_GROUPS in ` +
          "scripts/inventory-node-stores.mjs (kernel / product / undecided).",
      );
    }
    for (const field of stale) {
      console.error(
        `[fail] ${field}: grouped in STORE_GROUPS but no longer found in the node — ` +
          "remove the entry, or the split overstates what it covers.",
      );
    }
    process.exit(1);
  }
  // **Rule: a `product`-grouped store must be gated.** Completeness says every
  // store is grouped; correctness of the *claim* requires more. The remainder was
  // enumerated while it existed — 12 ungated stores became 4 real leaks became 0 —
  // and this now fails rather than reports, so a product store that takes a
  // profile directory without a guard cannot land.
  //
  // **What counts as ungated, precisely.** Two shapes materialise product state,
  // and only these two are defects:
  //
  //   * a directory is passed to the *constructor* / factory without a guard
  //     (`createPublishedExternalStore(this._profileDir)`);
  //   * a directory is passed to `.init(dir)` without a guard
  //     (`this._codingHeartbeatStore.init(this._profileDir)`).
  //
  // A construction with **no** directory argument (`new ChainStore()`) materialises
  // nothing by itself — the directory arrives later, at a separate site that is
  // checked here too. The first version of this rule flagged the constructor shape
  // alone, which listed twelve stores of both kinds and would have hurried a
  // refactor of six harmless ones.
  const implLines = (await fs.readFile(path.join(root, "apps/node/src/node-service-impl.ts"), "utf8")).split("\n");
  // **Group the lines into statements.** The first two versions of this rule
  // looked at single lines, and both were blind in a different way:
  //
  //   * a four-line window above the hand-off "found" a guard that belonged to a
  //     neighbouring store, so un-gating a site still looked guarded (fixed by
  //     requiring the guard in the expression);
  //   * requiring the guard *in the expression on the same line as the directory
  //     argument* then missed the style this file actually uses, where the guard
  //     and the directory sit on different lines:
  //
  //         this._shopStore =
  //           hasProfileDir(profileDir) ? createShopStore(profileDir) : null;
  //
  //     — and, worse, it missed the *unguarded* form of that style too, which is
  //     the edit that matters. Measured with a negative control (a copy of the
  //     tree with one guard deleted, `scripts/test/gates.test.mjs`): deleting the
  //     guard from this shape left the gate reporting "clean". A statement is the
  //     right unit — it is what "is this hand-off guarded?" is actually asked
  //     about.
  const statements = [];
  {
    let start = -1;
    let code = [];
    const flush = () => {
      if (start >= 0) statements.push({ start, text: code.join("\n") });
      start = -1;
      code = [];
    };
    for (let i = 0; i < implLines.length; i += 1) {
      const raw = implLines[i];
      const trimmed = raw.trim();
      // Comments are dropped from the statement's text: a JSDoc line mentioning
      // "the profile store" is neither a guard nor a hand-off, and counting it as
      // evidence once reported a constructor signature as an ungated store.
      if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        continue;
      }
      if (start < 0) start = i;
      const line = trimmed.replace(/\/\/.*$/, "").trim();
      code.push(line);
      if (/[;{[]$/.test(line) || line.startsWith("}")) flush();
    }
    flush();
  }
  const GUARDED_ON_LINE = /hasProfileDir\(|productStore\(|requireProductStoreDir\(/;
  /**
   * A profile directory reaching a store, as `callee(profileDir)`.
   *
   * The callee and the argument have to be matched **together**: an earlier shape
   * test (`= new|create`) also matched a constructor's default parameter value
   * (`profileDir: string | undefined = create…()`), which hands nothing over, and
   * that was reported as an ungated product store in a tree where every store is
   * gated.
   */
  const DIR_TO_STORE =
    /(?:\b(?:create[A-Za-z0-9]*Store)|new\s+[A-Za-z_$][\w$]*Store)\s*\(\s*(?:this\._profileDir|\bprofileDir\b)|\.init\(\s*(?:this\._profileDir|\bprofileDir\b)/;
  /** The nearest line above with *less* indentation that opens an `if (…)`. */
  const enclosingIf = (lineNo) => {
    const indent = (l) => l.length - l.trimStart().length;
    const target = indent(implLines[lineNo] ?? "");
    for (let i = lineNo - 1; i >= 0; i--) {
      const line = implLines[i];
      if (!line.trim()) continue;
      if (indent(line) < target && /^\s*(\}|\} else|if \()/.test(line)) return line;
    }
    return "";
  };
  // Guarded when the guard is in the statement, or the hand-off sits inside a
  // guarded block (`if (hasProfileDir(profileDir)) { … init(profileDir) }` — the
  // constructor's chain-store block is exactly that shape).
  const guardedStatement = (s) => GUARDED_ON_LINE.test(s.text) || GUARDED_ON_LINE.test(enclosingIf(s.start));
  const leakingLines = (row) => {
    // `local:workerLeases` is keyed by its binding name; the code says
    // `workerLeases:`, so the prefix has to come off or the row is never matched.
    // Matched as a whole identifier — a binding called `store` is otherwise a
    // substring of half the file, which is how the first version of this check
    // reported five phantom leaks.
    const names = [row.field.replace(/^local:/, ""), row.factory]
      .filter((n) => n && n !== "(created elsewhere)")
      .map((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`));
    const hits = [];
    for (const s of statements) {
      if (!DIR_TO_STORE.test(s.text)) continue;
      if (!names.some((re) => re.test(s.text))) continue;
      if (guardedStatement(s)) continue;
      hits.push({
        line: s.start + 1,
        text: s.text.replace(/\s+/g, " ").trim().slice(0, 120),
      });
    }
    return hits;
  };
  // **The shape label is not evidence of a guard.** Every row built from the
  // constructor scan is labelled "constructor, gated on profileDir" from its
  // *shape*, not from what its creation line says — so an earlier version of this
  // filter, which skipped rows carrying that label, could not fire for any of the
  // 35 constructor-shaped stores. The label is still printed (it describes how the
  // store is created) but the decision now rests on the statements alone.
  const ungatedProduct = all
    .filter((r) => STORE_GROUPS[r.field]?.[0] === "product")
    .map((r) => ({ ...r, leaks: leakingLines(r) }))
    .filter((r) => r.leaks.length > 0);
  //
  // **Enforced since the list reached zero.** It was reported-only while the gate
  // was being built (§8.17.5): a rule that fails on day one gets deleted, while
  // one that names the remainder gets finished. The remainder is finished — 12
  // ungated stores became 4 real leaks became 0 — so this now fails, and a new
  // product store that takes a directory without a guard cannot land.
  //
  // That sentence was false for a while after it was written: the rule could not
  // see the constructor rows at all, so "0 ungated" was a report of blindness
  // rather than of cleanliness. The negative control in `scripts/test/gates.test.mjs`
  // (delete one guard from a copy of the tree; the gate must fail) is what keeps it
  // honest — a rule here is only as good as the sabotage it survives.
  if (ungatedProduct.length > 0) {
    const strict = true;
    for (const r of ungatedProduct) {
      console.error(
        `[${strict ? "fail" : "todo"}] ${r.field} (${r.factory ?? "?"}): grouped \`product\`, and ` +
          "a profile directory reaches it unguarded:\n" +
          r.leaks.map((l) => `        node-service-impl.ts:${l.line}  ${l.text}`).join("\n") +
          "\n      Gate the site with `hasProfileDir(...)` (or build the store through " +
          "`productStore(profileDir, name, factory)` in apps/node/src/product-store-availability.ts).",
      );
    }
    console.error(
      `\n${ungatedProduct.length} product store(s) are ungated — the ` +
        "`productStoreDir` gate (§8.9) is incomplete while this list is non-empty." +
        (strict ? "" : " Re-run with --strict once they are gated."),
    );
    if (strict) process.exit(1);
  }

  // ─── the §5 layout gap, reported rather than gated ──────────────────────────
  //
  // Design §5 puts a product's own state under `<home>/<product>/` and leaves the kernel
  // stores in the shared `profile/`. Today **every** store is built from the profile
  // directory, so a second product sharing the home would read and write this product's
  // chat logs, family rooms, market cache and the rest. Reported with its real size,
  // because the first estimate ("34 stores") understated it: the stores are the easy half,
  // and the rest are direct `this._profileDir` path builds that have to move with them or
  // the product's state ends up split across two roots — which is worse than either
  // layout alone. Enumerating it here means the remainder is a list, not a feeling.
  {
    const impl = await fs.readFile(path.join(root, "apps/node/src/node-service-impl.ts"), "utf8");
    const profileDirRefs = (impl.match(/this\._profileDir/g) ?? []).length;
    const productStores = all.filter((r) => STORE_GROUPS[r.field]?.[0] === "product");
    console.log(
      `\n[§5 layout] product state belongs under <home>/<product>/, not in the shared ` +
        `profile/:`,
    );
    console.log(
      `      ${productStores.length} product stores are built from the profile directory, ` +
        `alongside ${profileDirRefs} direct \`this._profileDir\` references that must move ` +
        `with them.`,
    );
    console.log(
      `      Resolved already (not created, not yet used): \`resolveProductStateDir()\` in ` +
        `node-core, which adopts the current location for existing installs.`,
    );
  }

  console.log(
    `node-store inventory is complete — ${all.length} stores ` +
      `(${rows.length} constructor-gated, ${additional.length} not gated, ` +
      `${perCall.reduce((n, x) => n + x.count, 0)} per-call creations): ` +
      `${counts.kernel ?? 0} kernel, ${counts.product ?? 0} product, ${counts.undecided ?? 0} undecided`,
  );
  process.exit(0);
}

if (flag("--json")) {
  process.stdout.write(
    `${JSON.stringify({ counts, profileDirFallback, perCall, stores: all }, null, 2)}\n`,
  );
  process.exit(0);
}

const lines = [
  "# Node kernel store inventory",
  "",
  "Generated by `scripts/inventory-node-stores.mjs` — do not hand-edit.",
  "",
  "| Shape | Count |",
  "|---|---|",
  `| constructor, gated on \`profileDir\` | ${rows.length} |`,
  `| not gated (field initializer / \`init\`) | ${additional.length} |`,
  `| created per call from \`this._profileDir\` | ${perCall.reduce((n, x) => n + x.count, 0)} |`,
  `| local / object-literal bindings | ${locals.length} |`,
  "",
  "**Grouping across all of them:**",
  "",
  "| Group | Count |",
  "|---|---|",
  `| kernel | ${counts.kernel ?? 0} |`,
  `| product | ${counts.product ?? 0} |`,
  `| undecided | ${counts.undecided ?? 0} |`,
  "",
  "## Stores",
  "",
  "| Store | Factory | Created | Group | Why | Readers |",
  "|---|---|---|---|---|---|",
  ...all.map(
    (r) =>
      `| \`${r.field}\` | \`${r.factory}\` | ${r.created} | **${r.group}** | ${r.reason} | ` +
      `${r.readers.length === 0 ? "*no method body reads it directly*" : `${r.readers.length} (e.g. ${r.readers.slice(0, 3).map((x) => `\`${x.method}\``).join(", ")})`} |`,
  ),
  "",
  "## Notes and limits",
  "",
  "- **The grouping is reviewed, not derived.** Sources cited: the store module's own",
  "  doc comment and the RPC methods that read the field (both in the table above).",
  "  `undecided` is a real answer — it costs nothing to list a store as undecided and",
  "  a wrong `product` call silently removes a capability from the kernel.",
  "- **Method attribution is structural**: two-space-indented class/object-literal",
  "  methods in `node-service*.ts`, with brace counting. A store read in an arrow",
  "  property, a module-level helper, or a getter body is missed — which is why",
  "  several rows say *no method body reads it directly* rather than zero.",
  "- **Defining package does not discriminate**, so it is not used: 26 of 29 come",
  "  from `@envoymesh/local-store` and three from `apps/node`.",
  "- **The manifest cannot discriminate either**: every constructor field is read inside",
  "  `node-service-impl.ts`, which is `product-bound`, so reachability answers",
  "  \"product-bound\" for all of them (plan §8.8 Step 6c).",
  "- **`profileDir` is not the only gate, and `this._profileDir` is not a real path.**",
  `  A missing directory becomes \`${profileDirFallback}\`, and the per-call stores below`,
  "  are created from it on demand — so a node constructed without a directory does not",
  "  fail, it writes. Any kernel split has to deal with that fallback, not only with the",
  "  gated creations.",
  "",
  "### Created per call, not held in a field",
  "",
  "| Factory | Call sites |",
  "|---|---|",
  ...(perCall.length === 0
    ? ["| *(none)* | |"]
    : perCall.map((x) => `| \`${x.factory}\` | ${x.count} |`)),
];

const markdown = `${lines.join("\n")}\n`;
const out = opt("--out");
if (out) {
  await fs.mkdir(path.dirname(path.resolve(root, out)), { recursive: true });
  await fs.writeFile(path.resolve(root, out), markdown, "utf8");
  console.log(
    `wrote ${out} — ${all.length} stores: ${counts.kernel ?? 0} kernel, ` +
      `${counts.product ?? 0} product, ${counts.undecided ?? 0} undecided`,
  );
} else {
  process.stdout.write(markdown);
}
