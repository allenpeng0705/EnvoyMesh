/**
 * Authoring assist — Draft with AI for Profile bio, blog, section, photo caption, Feed.
 * Prompt builders live here so desktop node and mobile share one contract.
 */
import { stripModelThinking } from "./model-thinking.js";

export const AUTHOR_CONTENT_SURFACES = ["bio", "blog", "section", "caption", "feed"] as const;
export type AuthorContentSurface = (typeof AUTHOR_CONTENT_SURFACES)[number];

export const AUTHOR_CONTENT_MODES = ["write", "rewrite", "expand", "shorten"] as const;
export type AuthorContentMode = (typeof AUTHOR_CONTENT_MODES)[number];

export const AUTHOR_CONTENT_TONES = [
  "professional",
  "casual",
  "playful",
  "informative",
  "personal",
  "punchy",
  "clear",
  "friendly",
  "descriptive",
  "poetic",
] as const;
export type AuthorContentTone = (typeof AUTHOR_CONTENT_TONES)[number];

export interface DraftAuthorContentParams {
  surface: AuthorContentSurface;
  mode: AuthorContentMode;
  tone: AuthorContentTone | string;
  /** Optional owner hint (1–2 sentences). */
  hint?: string;
  /** Blog / section / photo title. */
  title?: string;
  /** Current field text (required for rewrite/expand/shorten). */
  existingText?: string;
  profileContext?: {
    displayName?: string;
    username?: string;
    hobbies?: string[];
    knowledge?: string[];
  };
  locale?: string;
}

export type DraftAuthorContentResult =
  | { ok: true; text: string }
  | { ok: false; reason: string };

const SURFACE_LABEL: Record<AuthorContentSurface, string> = {
  bio: "profile bio",
  blog: "blog post",
  section: "site section",
  caption: "photo caption",
  feed: "Friend Circle / Moments update",
};

const MODE_INSTRUCTION: Record<AuthorContentMode, string> = {
  write: "Write new content from scratch.",
  rewrite: "Rewrite the existing text — keep the meaning, improve clarity and tone.",
  expand: "Expand the existing text with more detail while staying on topic.",
  shorten: "Shorten the existing text — keep the core message, cut fluff.",
};

const LENGTH_HINT: Record<AuthorContentSurface, string> = {
  bio: "Keep it under 500 characters. Prefer 2–4 short sentences.",
  blog: "Write a complete short post in markdown (headings optional). Aim for 200–600 words unless the owner asks otherwise.",
  section: "Write a focused section body in markdown. Aim for 80–250 words.",
  caption: "One or two short sentences. No hashtags unless the owner asks.",
  feed: "Write a short Moments-style update: 1–4 sentences, conversational, no markdown headings, no hashtag spam.",
};

export function defaultTonesForSurface(surface: AuthorContentSurface): AuthorContentTone[] {
  switch (surface) {
    case "bio":
      return ["professional", "casual", "playful"];
    case "blog":
      return ["informative", "personal", "punchy"];
    case "section":
      return ["clear", "friendly"];
    case "caption":
      return ["descriptive", "poetic"];
    case "feed":
      return ["casual", "playful", "personal"];
  }
}

export function defaultModeForExistingText(existingText: string | undefined): AuthorContentMode {
  return existingText?.trim() ? "rewrite" : "write";
}

/** Build the model prompt for an authoring draft (no tools, return text only). */
export function buildAuthorContentDraftPrompt(params: DraftAuthorContentParams): string {
  const surface = params.surface;
  const mode = params.mode;
  const tone = (params.tone || "casual").trim() || "casual";
  const title = params.title?.trim();
  const hint = params.hint?.trim();
  const existing = params.existingText?.trim();
  const locale = params.locale?.trim();
  const ctx = params.profileContext;

  const lines: string[] = [
    surface === "feed"
      ? "You help an EnvoyMesh user draft a Friend Circle (Moments) update for bonded contacts."
      : "You help an EnvoyMesh user draft site content.",
    `Surface: ${SURFACE_LABEL[surface]}.`,
    `Task: ${MODE_INSTRUCTION[mode]}`,
    `Tone: ${tone}.`,
    LENGTH_HINT[surface],
    "Return ONLY the drafted content — no preamble, no quotes around the whole answer, no explanation.",
  ];

  if (locale) {
    lines.push(`Write in the user's language (locale hint: ${locale}).`);
  }

  if (surface === "bio" && ctx) {
    const bits: string[] = [];
    if (ctx.displayName?.trim()) bits.push(`Name: ${ctx.displayName.trim()}`);
    if (ctx.username?.trim()) bits.push(`Username: @${ctx.username.trim()}`);
    if (ctx.hobbies?.length) bits.push(`Interests: ${ctx.hobbies.join(", ")}`);
    if (ctx.knowledge?.length) bits.push(`Knowledge: ${ctx.knowledge.join(", ")}`);
    if (bits.length) {
      lines.push("", "Profile context:", ...bits.map((b) => `- ${b}`));
    }
  }

  if (title) {
    lines.push("", `Title: ${title}`);
  }
  if (hint) {
    lines.push("", `Owner hint: ${hint}`);
  }
  if (existing && mode !== "write") {
    lines.push("", "Existing text:", existing);
  } else if (existing && mode === "write") {
    lines.push("", "Notes from the field (optional inspiration):", existing);
  }

  lines.push("", "Draft:");
  return lines.join("\n");
}

/** Strip thinking tags / fences / leading labels from model output. */
export function sanitizeAuthorDraftOutput(raw: string): string {
  let text = stripModelThinking(raw).trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:markdown|md|text)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }
  text = text.replace(/^(here(?:'s| is) (?:a |the )?(?:draft|bio|caption|post)[:\s]*)/i, "").trim();
  return text;
}
