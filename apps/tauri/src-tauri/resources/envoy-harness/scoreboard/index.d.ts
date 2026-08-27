/**
 * @envoymesh/envoy-harness — scoreboard module.
 *
 * **Phase 3 (self-evolution) data layer.** The scoreboard is the
 * append-only log of every self-evolution cycle's outcome.
 *
 * Public API:
 * - `readScoreboard`, `writeScoreboard`, `appendEntry` — file I/O.
 * - `readBenchmark`, `writeBenchmark` — benchmark file I/O.
 * - `hashRuleset` — SHA-256 over rule names + summaries.
 * - `signEntry` — SHA-256 over the canonical payload (v0; Ed25519 in Phase 2+).
 * - All schemas and types.
 *
 * **The 5-step protocol** itself lives in
 * `src/scoreboard/self-evolve.ts` (Chunk 5b). This module is
 * pure data + I/O.
 *
 * **Stability:** on-disk format is YAML; schema changes go
 * through `ScoreboardEntrySchema` (zod). New optional fields
 * are additive.
 */
export { BenchmarkSchema, FederatedAdoptionRecordSchema, FederatedAdoptionsSchema, ScoreboardEntrySchema, ScoreboardSchema, type Benchmark, type BenchmarkResult, type BenchmarkTask, type FederatedAdoptionRecord, type FederatedAdoptions, type Scoreboard, type ScoreboardEntry, type VerifierRuleset, } from "./types.js";
export { appendAdoption, appendEntry, hashRuleset, readAdoptions, readBenchmark, readScoreboard, signEntry, verifyEntrySignature, writeBenchmark, writeScoreboard, } from "./storage.js";
export { DefaultBenchmarkRunner, ModelHypothesisProvider, SelfEvolve, buildHypothesisPrompt, loadRulesetFromFile, parseHypothesisFromLlm, type BenchmarkRunner, type Hypothesis, type HypothesisProvider, type RunOneCycleResult, type SelfEvolveOptions, type SelfEvolvePaths, } from "./self-evolve.js";
export { FederatedScoreboard, LocalPeerSource, type AdoptedCandidate, type AdoptResult, type PeerScoreboard, type PeerSource, type PullOptions, type PullResult, } from "./federated.js";
//# sourceMappingURL=index.d.ts.map