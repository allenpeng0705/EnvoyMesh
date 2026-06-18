/**
 * Phase 42D — Chain templates.
 *
 * Pre-defined chain configurations that owners can select from the
 * AI assistant without constructing a chain from scratch each time.
 *
 * Templates are stored in `<profileDir>/chain-templates.json` and
 * can be managed via RPC (list, get, delete). Built-in templates
 * are seeded on first launch.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChainTemplate {
  /** Stable template id (kebab-case). */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Short description shown in the picker. */
  description: string;
  /** Keywords for natural-language matching from chat. */
  keywords: string[];
  /** Pre-configured subtasks (optional — LLM decomposition fills in if empty). */
  subtasks?: Array<{
    requiredCapability: string;
    objective: string;
    initialDraft?: string;
  }>;
  /** Pre-configured bid ranking weights (optional — defaults used if unset). */
  bidWeights?: {
    cost: number;
    reputation: number;
    freshness: number;
    precision: number;
  };
  /** Pre-configured stall policy (optional). */
  stallPolicy?: "auto_rebid" | "auto_cancel_subtask" | "auto_cancel_chain" | "escalate";
  /** Whether to enable cost estimation for this template. */
  costEstimationEnabled?: boolean;
  /** Owner who created this template (for user-defined templates). */
  createdBy?: string;
  createdAt?: string;
}

// ---------------------------------------------------------------------------
// Built-in templates
// ---------------------------------------------------------------------------

const BUILTIN_TEMPLATES: ChainTemplate[] = [
  {
    id: "translate-review-summarize",
    name: "Translate → Review → Summarize",
    description: "Translate a document, have it reviewed by a second agent, then summarize the results.",
    keywords: ["translate", "review", "summarize", "document", "proofread"],
    subtasks: [
      { requiredCapability: "translation", objective: "Translate the document from source to target language", initialDraft: "Please translate the provided document." },
      { requiredCapability: "review", objective: "Review the translation for accuracy and fluency", initialDraft: "Review the translation and note any errors." },
      { requiredCapability: "summarize", objective: "Summarize the translated and reviewed document", initialDraft: "Write a concise summary of the final document." },
    ],
    stallPolicy: "auto_rebid",
    costEstimationEnabled: true,
  },
  {
    id: "find-best-research",
    name: "Find Best — Research",
    description: "Search for information across bonded peers, rank results, and synthesize a report.",
    keywords: ["find", "search", "research", "best", "ranking", "report"],
    subtasks: [
      { requiredCapability: "search", objective: "Search bonded contacts' vaults for relevant information" },
      { requiredCapability: "rank", objective: "Rank results by relevance, recency, and credibility" },
      { requiredCapability: "summarize", objective: "Synthesize a ranked report with citations" },
    ],
    stallPolicy: "auto_rebid",
    costEstimationEnabled: false,
  },
  {
    id: "extract-analyze-report",
    name: "Extract → Analyze → Report",
    description: "Extract data from documents, analyze trends, and produce a report.",
    keywords: ["extract", "analyze", "report", "data", "trends"],
    subtasks: [
      { requiredCapability: "extract", objective: "Extract structured data from provided documents" },
      { requiredCapability: "analyze", objective: "Analyze extracted data for patterns and trends" },
      { requiredCapability: "summarize", objective: "Produce a report with findings and recommendations" },
    ],
    stallPolicy: "auto_cancel_subtask",
    costEstimationEnabled: false,
  },
  {
    id: "compare-options",
    name: "Compare Options",
    description: "Compare two or more options across multiple dimensions and recommend the best.",
    keywords: ["compare", "comparison", "vs", "versus", "options", "recommend"],
    subtasks: [
      { requiredCapability: "analyze", objective: "Analyze each option across defined dimensions" },
      { requiredCapability: "compare", objective: "Compare options side-by-side with weighted scoring" },
      { requiredCapability: "summarize", objective: "Recommend the best option with justification" },
    ],
    stallPolicy: "escalate",
    costEstimationEnabled: false,
  },
];

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export class ChainTemplateStore {
  private templates = new Map<string, ChainTemplate>();
  private filePath: string | null = null;
  private initialized = false;

  /** Load templates from disk (with built-in seed). */
  async init(profileDir: string): Promise<void> {
    if (this.initialized) return;
    this.filePath = path.join(profileDir, "chain-templates.json");

    let loaded: ChainTemplate[] = [];
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      loaded = JSON.parse(raw);
      if (!Array.isArray(loaded)) loaded = [];
    } catch {
      // File doesn't exist — seed with built-in templates
      loaded = [...BUILTIN_TEMPLATES];
      await this._persist(loaded);
    }

    // Merge: built-in templates are always available; user templates overlay
    const merged = new Map<string, ChainTemplate>();
    for (const t of BUILTIN_TEMPLATES) merged.set(t.id, t);
    for (const t of loaded) merged.set(t.id, t);

    this.templates = merged;
    this.initialized = true;
  }

  /** List all available templates. */
  list(): ChainTemplate[] {
    return [...this.templates.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Get a single template by id. */
  get(id: string): ChainTemplate | undefined {
    return this.templates.get(id);
  }

  /** Find templates matching a natural-language query (simple keyword match). */
  find(query: string): ChainTemplate[] {
    const lower = query.toLowerCase();
    return this.list().filter((t) => {
      if (t.keywords.some((kw) => lower.includes(kw.toLowerCase()))) return true;
      if (t.name.toLowerCase().includes(lower)) return true;
      if (t.description.toLowerCase().includes(lower)) return true;
      return false;
    });
  }

  /** Save a user-defined template. */
  async save(template: ChainTemplate): Promise<void> {
    this.templates.set(template.id, { ...template, createdAt: template.createdAt ?? new Date().toISOString() });
    await this._persist([...this.templates.values()]);
  }

  /** Delete a user-defined template (built-in templates cannot be deleted). */
  async delete(id: string): Promise<boolean> {
    const tmpl = this.templates.get(id);
    if (!tmpl) return false;
    if (BUILTIN_TEMPLATES.some((b) => b.id === id)) return false; // cannot delete built-ins
    this.templates.delete(id);
    await this._persist([...this.templates.values()]);
    return true;
  }

  private async _persist(templates: ChainTemplate[]): Promise<void> {
    if (!this.filePath) return;
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(this.filePath, JSON.stringify(templates, null, 2), { mode: 0o600 });
    } catch {
      // Best-effort
    }
  }
}

/** Singleton instance. */
export const chainTemplateStore = new ChainTemplateStore();
