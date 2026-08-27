/**
 * Phase G — native system-prompt assembly (deepseek parity).
 *
 * The section shape deliberately mirrors deepseek's `PromptSection`
 * (`{ name, order, text }`) so a future deepseek plugin contribution can be
 * **copied in** (MIT, the stated reuse path) or bridged from a hosted
 * plugin without conversion. Ordering convention matches deepseek:
 * `-100` identity / project context, `0` persona, `100–199` tool guidance.
 */
export {};
//# sourceMappingURL=types.js.map