/**
 * D3 — shape mapping between the envoy `MeshSubmitter` contract
 * (`SubagentInput`/`SubagentResult`) and the MAP wire messages
 * (`ExecuteInput`/`SignedAgentResult`) the peer protocol carries.
 */
import type { ExecuteInput } from "@envoymesh/agent-adapter";
import type { SignedAgentResult } from "@envoymesh/protocol";
import type { SubagentInput, SubagentResult, Verdict } from "@envoymesh/envoy-harness";
/** Map a `MeshSubmitter` input to the MAP `ExecuteInput` the wire carries. */
export declare function subagentInputToExecuteInput(input: SubagentInput, signal: AbortSignal): ExecuteInput;
/**
 * Map a MAP `SignedAgentResult` back to the `SubagentResult` contract.
 * v1: text blocks map to local text blocks; other kinds are skipped with
 * a note block (full structured/file/image mapping is a later round).
 *
 * Verdict: when the server ran a real verifier (`verifyAfterExecute`),
 * its combined verdict is passed in and used verbatim. Otherwise the v1
 * placeholder below applies (non-empty content → pass) — honest only for
 * smoke/demo use; hosts that route on `result.verdict.kind` should enable
 * the server-side verifier or the D5 cross-instance verify.
 */
export declare function signedResultToSubagentResult(result: SignedAgentResult, verdict?: Verdict): SubagentResult;
//# sourceMappingURL=mapping.d.ts.map