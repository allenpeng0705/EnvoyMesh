/**
 * Scoreboard file I/O (§13 of the design).
 *
 * **Format:** YAML. The scoreboard is a list of entries;
 * each entry is the shape defined in `types.ts`. The file
 * is round-trip-stable: read → write produces identical
 * content (modulo whitespace, which is normalized on write).
 *
 * **Atomic writes:** every write goes through a temp file
 * + rename. A crash mid-write leaves the previous scoreboard
 * intact. (A crash mid-read is impossible — read is
 * synchronous until the buffer is in memory.)
 *
 * **Why a separate module from types?** The types are pure
 * data; the file I/O is impure. Keeping them apart means
 * tests can construct scoreboards without touching disk.
 *
 * **Stability:** the on-disk format is YAML with the
 * `ScoreboardEntry` shape. New optional fields are additive;
 * renaming existing fields is a major version bump.
 */
import { type Benchmark, type FederatedAdoptions, type FederatedAdoptionRecord, type Scoreboard, type ScoreboardEntry } from "./types.js";
/**
 * Read the scoreboard from a file. Returns an empty scoreboard
 * if the file doesn't exist (a fresh peer has no history).
 * Throws if the file exists but is malformed — the user
 * should fix it manually, not have us silently drop entries.
 */
export declare function readScoreboard(filePath: string): Promise<Scoreboard>;
/**
 * Append a new entry to the scoreboard. Atomic write via
 * temp + rename. The file is created if it doesn't exist.
 */
export declare function appendEntry(filePath: string, entry: ScoreboardEntry): Promise<void>;
/**
 * Write the whole scoreboard, atomically. Used by
 * `appendEntry` after appending. Exposed publicly for
 * tests and for cases where the caller wants a clean write.
 */
export declare function writeScoreboard(filePath: string, scoreboard: Scoreboard): Promise<void>;
/**
 * Read a benchmark from a YAML file. Throws on missing or
 * malformed. The benchmark is FROZEN — a peer's benchmark
 * file should not be edited during a cycle.
 */
export declare function readBenchmark(filePath: string): Promise<Benchmark>;
/**
 * Write a benchmark to YAML. Used by tests to materialize
 * fixtures. Production code never writes the benchmark —
 * it's frozen by the operator.
 */
export declare function writeBenchmark(filePath: string, benchmark: Benchmark): Promise<void>;
/**
 * Read the federated adoptions log. Returns an empty list
 * if the file doesn't exist (a fresh peer has no federated
 * history).
 */
export declare function readAdoptions(filePath: string): Promise<FederatedAdoptions>;
/**
 * Append a record to the federated adoptions log. Atomic
 * write via temp + rename. The file is created if it
 * doesn't exist.
 */
export declare function appendAdoption(filePath: string, record: FederatedAdoptionRecord): Promise<void>;
/**
 * Hash a VerifierRuleset. The hash is a SHA-256 of the
 * canonicalized list of (name + summary) pairs.
 *
 * **Why name + summary, not the full function?** Functions
 * aren't serializable. The hash is a stable identifier for
 * "this is ruleset version X" — what changes between cycles
 * is the set of rule names (and their descriptions), not the
 * internal logic (which is in TypeScript code, not data).
 */
export declare function hashRuleset(rules: ReadonlyArray<{
    name: string;
    description?: string | undefined;
}>): Promise<string>;
/**
 * Sign the canonical payload of a scoreboard entry. v0:
 * SHA-256 of the JSON-serialized fields minus the
 * `ownerSignature` itself. Phase 2+ replaces this with
 * Ed25519 via the owner's key.
 */
export declare function signEntry(entry: Omit<ScoreboardEntry, "ownerSignature">): Promise<string>;
/**
 * Verify a scoreboard entry's signature. v0: recompute the
 * SHA-256 of the canonical payload and compare to
 * `ownerSignature`. Returns `true` iff the signature is valid.
 *
 * **What this protects against:** accidental corruption of
 * the scoreboard file. A malicious process can still rewrite
 * the file (signing is local; Ed25519 with the owner's key
 * is the real protection — Phase 2).
 *
 * **What this does NOT protect against:** a peer lying about
 * its identity. v0 trusts the `PeerSource` to return the
 * right entries. Phase 2 adds peer-key verification.
 */
export declare function verifyEntrySignature(entry: ScoreboardEntry): Promise<boolean>;
//# sourceMappingURL=storage.d.ts.map