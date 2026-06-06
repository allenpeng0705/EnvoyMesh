import { z } from "zod";

export const TerminalSuggestResponseSchema = z.object({
  completion: z.string().max(512).optional(),
  suggestions: z.array(z.string().max(512)).max(5).optional(),
});

export type ParsedTerminalSuggestResponse = z.infer<typeof TerminalSuggestResponseSchema>;

export function parseTerminalSuggestResponse(
  raw: string,
): { ok: true; result: ParsedTerminalSuggestResponse } | { ok: false; reason: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "terminal.agent.emptySuggestion" };
  }

  let parsed: unknown;
  try {
    const jsonText = trimmed.startsWith("{")
      ? trimmed
      : trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: true,
      result: { completion: trimmed.split("\n")[0]?.slice(0, 512) },
    };
  }

  const result = TerminalSuggestResponseSchema.safeParse(parsed);
  if (!result.success) {
    return { ok: false, reason: "terminal.agent.invalidSuggestion" };
  }
  return { ok: true, result: result.data };
}
