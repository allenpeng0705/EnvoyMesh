/**
 * Phase G — native system-prompt assembly (deepseek parity).
 *
 * The section shape deliberately mirrors deepseek's `PromptSection`
 * (`{ name, order, text }`) so a future deepseek plugin contribution can be
 * **copied in** (MIT, the stated reuse path) or bridged from a hosted
 * plugin without conversion. Ordering convention matches deepseek:
 * `-100` identity / project context, `0` persona, `100–199` tool guidance.
 */
/** Per-assembly context (envoy subset; scope/waterfall omitted). */
export interface PromptAssemblyContext {
    signal?: AbortSignal;
}
/** One contributed system-prompt section. */
export interface PromptSection {
    /** Unique name — a duplicate registration throws. */
    readonly name: string;
    /** Ascending order; `-100` identity/context, `0` persona, `100–199` tool guidance. */
    readonly order: number;
    /** Static text or a provider evaluated at each assembly. Empty text contributes nothing. */
    readonly text: string | ((ctx: PromptAssemblyContext) => string | Promise<string>);
    /**
     * Treat this contribution as the complete system prompt. Assembly still
     * resolves every section, then restores this one as the sole content.
     * More than one effective complete section fails the render.
     */
    readonly complete?: boolean;
}
//# sourceMappingURL=types.d.ts.map