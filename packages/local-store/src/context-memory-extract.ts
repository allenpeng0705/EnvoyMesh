/**
 * Durable-fact extraction for Context Memory (heuristic + LLM JSON parse).
 */

const MAX_TEXT = 2000;

function cleanText(raw: unknown): string {
  return String(raw ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT);
}

/** Reject denial / transient intent phrasing that looks like a preference. */
export function isTransientFactSnippet(snippet: string): boolean {
  if (/\bi\s+(?:always|never)\s+(?:said|say|told|tell|meant|mean|forget|forgot)\b/i.test(snippet)) {
    return true;
  }
  if (/\bi\s+(?:want|need|wish)\b/i.test(snippet)) return true;
  if (/^(?:want|need|wish)\b/i.test(snippet)) return true;
  return false;
}

/** Heuristic durable-fact extract (no LLM). High-precision only — avoid transient "I want/need". */
export function extractDurableFactsFromTurn(input: {
  userText: string;
  assistantText?: string;
}): string[] {
  const user = cleanText(input.userText);
  if (!user) return [];
  const facts: string[] = [];
  const prefer =
    user.match(
      /\b(?:i\s+prefer|i\s+always|i\s+never|please\s+always|please\s+never|my\s+(?:name|timezone|language)\s+is)\b[\s\S]{0,120}/i,
    ) ??
    user.match(/(?:我(?:喜欢|偏好|总是|从不)|请(?:务必|不要)|我的(?:名字|时区|语言)是)[\s\S]{0,60}/);
  if (prefer) {
    const snippet = cleanText(prefer[0]);
    if (snippet.length >= 8 && !isTransientFactSnippet(snippet)) facts.push(snippet);
  }
  const rememberThat = user.match(/\bremember\s+(?:that\s+)?(.{8,120})/i);
  if (rememberThat?.[1]) {
    const snippet = cleanText(rememberThat[1]);
    if (snippet.length >= 8 && !isTransientFactSnippet(snippet)) facts.push(snippet);
  }
  const rememberZh = user.match(/记住[：:\s]*(.{4,60})/);
  if (rememberZh?.[1]) {
    const snippet = cleanText(rememberZh[1]);
    if (snippet.length >= 4 && !isTransientFactSnippet(snippet)) facts.push(snippet);
  }
  return [...new Set(facts)].slice(0, 3);
}

/** Whether a turn is worth an LLM extract pass (cost gate). */
export function shouldTryLlmFactExtract(input: {
  userText: string;
  heuristicFacts: readonly string[];
}): boolean {
  const user = cleanText(input.userText);
  if (user.length < 24) return false;
  if (input.heuristicFacts.length > 0) return false;
  // Skip pure short questions with no durable signal words.
  if (
    /\b(?:prefer|always|never|remember|my name|timezone|language|don't|do not|please)\b/i.test(
      user,
    ) ||
    /记住|偏好|喜欢|总是|从不|时区|语言/.test(user)
  ) {
    return true;
  }
  // Longer statements may still hide prefs the heuristic missed.
  return user.length >= 80 && !/\?\s*$/.test(user);
}

/**
 * Prompt for home-model extract. Asks for JSON array of durable personal facts only.
 */
export function buildContextMemoryExtractPrompt(input: {
  userText: string;
  assistantText?: string;
}): string {
  const user = cleanText(input.userText).slice(0, 1200);
  const assistant = cleanText(input.assistantText ?? "").slice(0, 800);
  return [
    "Extract durable personal facts or preferences about the USER from this chat turn.",
    "Return ONLY a JSON array of short strings (max 5). Example: [\"User prefers dark mode\"]",
    "Include lasting prefs, identity, constraints, decisions. Exclude transient wants, one-off tasks, and assistant opinions.",
    "If none, return [].",
    "",
    `USER: ${user}`,
    assistant ? `ASSISTANT: ${assistant}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Parse model output into cleaned fact strings (soft — never throws). */
export function parseLlmExtractedFacts(raw: string | null | undefined): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  let jsonText = text;
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) jsonText = fence[1].trim();
  const arrayMatch = jsonText.match(/\[[\s\S]*\]/);
  if (arrayMatch) jsonText = arrayMatch[0]!;
  try {
    const parsed = JSON.parse(jsonText) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const item of parsed) {
      const s = cleanText(item);
      if (s.length < 8 || s.length > 400) continue;
      if (isTransientFactSnippet(s)) continue;
      out.push(s);
      if (out.length >= 5) break;
    }
    return [...new Set(out)];
  } catch {
    return [];
  }
}

/** Merge heuristic + LLM facts (heuristic first), capped. */
export function mergeExtractedFacts(
  heuristic: readonly string[],
  llm: readonly string[],
  max = 5,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const f of [...heuristic, ...llm]) {
    const s = cleanText(f);
    // Allow short CJK facts (heuristic floor is 4); Latin floor stays 8.
    const minLen = /[\u3400-\u9fff]/.test(s) ? 4 : 8;
    if (s.length < minLen || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Import bullet / paragraph lines from MEMORY.md into remember() calls. */
export function parseMemoryMdSeedLines(markdown: string): string[] {
  const lines: string[] = [];
  for (const raw of String(markdown ?? "").split("\n")) {
    const line = raw.replace(/^#+\s*/, "").replace(/^[-*]\s+/, "").trim();
    if (!line || line.length < 8) continue;
    if (/^memory\.md$/i.test(line)) continue;
    lines.push(cleanText(line));
  }
  return [...new Set(lines)].slice(0, 40);
}
