const THINKING_TAG = "(?:think|redacted_thinking|thinking)";
const THINKING_BLOCK_PATTERN = new RegExp(`<${THINKING_TAG}>[\\s\\S]*?<\\/${THINKING_TAG}>`, "i");

export interface ParsedModelThinking {
  /** Combined inner text from all thinking blocks, trimmed; null if none. */
  thinking: string | null;
  /** Message text with thinking blocks removed. */
  visibleText: string;
}

function thinkingBlockRegex(): RegExp {
  return new RegExp(`<${THINKING_TAG}>[\\s\\S]*?<\\/${THINKING_TAG}>`, "gi");
}

function stripTagWrapper(block: string): string {
  return block
    .replace(new RegExp(`^<${THINKING_TAG}>`, "i"), "")
    .replace(new RegExp(`<\\/${THINKING_TAG}>$`, "i"), "")
    .trim();
}

function extractThinkingBlocks(text: string): string[] {
  const blocks: string[] = [];
  for (const match of text.matchAll(thinkingBlockRegex())) {
    const inner = stripTagWrapper(match[0]);
    if (inner) blocks.push(inner);
  }
  return blocks;
}

/** Split model output into optional reasoning vs user-visible reply text. */
export function parseModelThinking(text: string): ParsedModelThinking {
  const blocks = extractThinkingBlocks(text);
  const visibleText = text.replace(thinkingBlockRegex(), "").replace(/\n{3,}/g, "\n\n").trim();
  return {
    thinking: blocks.length > 0 ? blocks.join("\n\n") : null,
    visibleText,
  };
}

/** Remove model reasoning blocks — use before sending chat over the network. */
export function stripModelThinking(text: string): string {
  return parseModelThinking(text).visibleText;
}

export function hasModelThinking(text: string): boolean {
  return THINKING_BLOCK_PATTERN.test(text);
}
