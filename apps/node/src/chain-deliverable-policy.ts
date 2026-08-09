/**
 * Deliverable-shaped prompt policy for Team jobs (briefs / reports).
 *
 * Used by decompose, worker execution, and final merge so "short brief"
 * goals stay skimmable and metaphor-disciplined instead of free-form essays.
 */

const BRIEF_REPORT_RE =
  /\b(brief|report|memo|write-?up|one-?pager|explainer|primer)\b/i;
const ENGINEER_AUDIENCE_RE =
  /\b(software\s*engineer|engineers?|developers?|SRE|distributed\s*systems|coding\s*metaphor)\b/i;

/** True when the goal asks for a short human-readable brief/report. */
export function isBriefOrReportGoal(goal: string | undefined | null): boolean {
  const g = goal?.trim() ?? "";
  if (!g) return false;
  if (BRIEF_REPORT_RE.test(g)) return true;
  // "for software engineers on …" without the word brief still wants a brief.
  if (ENGINEER_AUDIENCE_RE.test(g) && /\b(how|relate|metaphor|analogy|explain)\b/i.test(g)) {
    return true;
  }
  return false;
}

/** True when this subtask is the rewrite / synthesis step. */
export function isSynthesizeSubtask(subtask: {
  requiredSkill?: string;
  objective?: string;
}): boolean {
  const skill = (subtask.requiredSkill ?? "").toLowerCase();
  const objective = (subtask.objective ?? "").toLowerCase();
  if (
    /summar|synth|merge|rewrite|edit|brief|report/.test(skill) ||
    skill.includes("research_synthesis")
  ) {
    return true;
  }
  return /\b(synthesize|summarize|rewrite|final brief|final report|polish)\b/.test(objective);
}

/** Outline + hard rules injected into merge / synthesize prompts. */
export function briefReportDeliverableRules(): string {
  return [
    "Deliverable shape (HARD):",
    "- Open with a 5-bullet TL;DR.",
    "- Body ≤ 600 words.",
    "- At most 3 metaphors / analogies.",
    "- For each metaphor: one sentence Analogy, one sentence Where it breaks, one sentence When to stop.",
    "- Close with when metaphors help vs when the math/mechanism must take over.",
    "- Prefer protocol / consensus / shared-randomness / capability language over CQRS, OAuth, or IAM as primary analogies.",
    "- No faster-than-light or signalling claims; correlation ≠ communication.",
    "- Do not invent experimental results; if unsure, say so.",
    "- Prefer a compact comparison table OR short sections — not both at full length.",
    "- Editor role: integrate prior steps; remove redundancy; do not paste step dumps.",
  ].join("\n");
}

/** Extra plan/decompose guidance for brief/report goals. */
export function briefReportPlanGuidance(): string {
  return [
    "BRIEF/REPORT GOAL — plan shape (HARD):",
    "- Prefer exactly 2 steps when 2+ workers are available: (1) research facts + safe analogies, (2) synthesize into the fixed brief outline.",
    '- Step 1 requiredSkill hint: "research" (or similar). Collect 3–4 core properties and flag false-friend metaphors.',
    '- Step 2 requiredSkill hint: "summarize" / "research_synthesis". Rewrite into the deliverable shape; do not research from scratch.',
    '- Set aggregation to "llm_merge" (never concatenate for brief/report goals).',
    "- Put the deliverable shape constraints on the synthesize step's constraints[] array.",
  ].join("\n");
}

/** Constraints appended to synthesize-step worker prompts. */
export function briefReportWorkerConstraints(): string[] {
  return [
    "Output markdown only.",
    "Hard cap: 600 words.",
    "Open with 5-bullet TL;DR.",
    "Max 3 metaphors; each needs Analogy / Breaks / When to stop.",
    "No CQRS, OAuth, or IAM as primary analogies.",
    "No FTL / signalling implications.",
    "Do not invent experimental results.",
  ];
}

export function mergeSystemPromptForGoal(base: string, goal: string | undefined): string {
  if (!isBriefOrReportGoal(goal)) return base;
  return `${base}\n\n${briefReportDeliverableRules()}`;
}

export function mergeUserPromptAddonForGoal(goal: string | undefined): string {
  if (!isBriefOrReportGoal(goal)) return "";
  return `\n\nThis is a brief/report goal. Enforce the deliverable shape in "summary". Keep "sections" empty unless needed for citations.\n`;
}

export function planPromptAddonForGoal(goal: string): string {
  if (!isBriefOrReportGoal(goal)) return "";
  return `\n${briefReportPlanGuidance()}\n`;
}
