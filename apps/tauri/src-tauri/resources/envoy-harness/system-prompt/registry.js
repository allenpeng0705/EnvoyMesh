/**
 * Phase G — system-prompt section registry + ordered renderer.
 */
export function createSystemPromptRegistry() {
    const sections = new Map();
    const ordered = () => [...sections.values()].sort((a, b) => a.order - b.order);
    return {
        register(section) {
            if (sections.has(section.name)) {
                throw new Error(`system prompt section already registered: ${section.name}`);
            }
            sections.set(section.name, section);
            return () => {
                if (sections.get(section.name) === section) {
                    sections.delete(section.name);
                }
            };
        },
        sections: ordered,
        async render(ctx = {}) {
            const resolved = [];
            for (const section of ordered()) {
                const text = typeof section.text === "string"
                    ? section.text
                    : await section.text(ctx);
                if (text.trim() === "")
                    continue;
                resolved.push({ name: section.name, text, complete: section.complete });
            }
            const completes = resolved.filter((s) => s.complete === true);
            if (completes.length > 1) {
                throw new Error(`system prompt has ${completes.length} complete sections: ` +
                    completes.map((s) => s.name).join(", "));
            }
            if (completes.length === 1)
                return completes[0].text.trim();
            return resolved.map((s) => s.text.trim()).filter(Boolean).join("\n\n");
        },
    };
}
//# sourceMappingURL=registry.js.map