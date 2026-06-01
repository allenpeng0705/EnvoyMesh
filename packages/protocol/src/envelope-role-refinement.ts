/**
 * Shared superRefine body for {@link EnvoyEnvelopeSchema} and
 * {@link UnsignedEnvoyEnvelopeSchema}. The two schemas differ only in whether
 * `signature` is required, so the role-policy check is identical and is
 * extracted here to keep the two definitions in lockstep.
 */

import { z } from "zod";
import type { EnvoyActorRole } from "./index.js";
import { evaluateEnvelopeRolePolicy } from "./role-policy-table.js";

export function envelopeRoleRefinement(
  value: {
    intent: string;
    senderRole: string;
    recipientRole: string;
    agentCredential?: unknown;
  },
  context: z.RefinementCtx,
): void {
  const decision = evaluateEnvelopeRolePolicy(
    value.intent as never,
    value.senderRole as EnvoyActorRole,
    value.recipientRole as EnvoyActorRole,
  );
  if (!decision.ok) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: decision.reason,
      path: ["senderRole"],
    });
  }
  // When senderRole is "agent" and intent is chat.message, agentCredential must be present.
  // chat.message is the primary intent where an agent directly represents the owner to a human.
  // For task.* and report.create intents, authorization comes from mandates instead.
  if (value.senderRole === "agent" && value.intent === "chat.message" && !value.agentCredential) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "agentCredential is required when senderRole is 'agent' for chat.message",
      path: ["agentCredential"],
    });
  }
}
