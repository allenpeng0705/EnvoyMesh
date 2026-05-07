/**
 * Style Adapter for AI Agent
 *
 * Adapts agent communication style to match owner's voice:
 * - Learns owner writing style from sent messages
 * - Tracks per-contact disclosure preferences
 * - Generates text matching owner's communication style
 */

import { randomUUID } from "node:crypto";

/**
 * Tone preferences.
 */
export type TonePreference = "formal" | "casual" | "neutral";

/**
 * Writing style profile for an owner.
 */
export interface StyleProfile {
  tone: TonePreference;
  vocabulary: string[];
  sentenceLength: number; // average words per sentence
  commonPhrases: string[];
  greetingPatterns: string[];
  signoffPatterns: string[];
  emojiUsage: number; // 0-1 scale
  exclamationUsage: number; // 0-1 scale
  questionFrequency: number; // 0-1 scale, how often they ask questions
  updatedAt: string;
}

/**
 * Per-contact disclosure configuration.
 */
export interface ContactDisclosure {
  contactOwnerId: string;
  discloseAgent: boolean;
  disclosureMessage?: string;
  customGreeting?: string;
  updatedAt: string;
}

/**
 * Style adaptation request.
 */
export interface StyleAdaptParams {
  text: string;
  contactOwnerId: string;
  senderIsOwner: boolean;
  context?: "greeting" | "farewell" | "follow_up" | "question" | "statement";
}

/**
 * Style adaptation result.
 */
export interface StyleAdaptResult {
  adaptedText: string;
  wasAdapted: boolean;
  disclosureApplied: boolean;
}

/**
 * Create an empty style profile.
 */
export function createEmptyStyleProfile(): StyleProfile {
  return {
    tone: "neutral",
    vocabulary: [],
    sentenceLength: 15,
    commonPhrases: [],
    greetingPatterns: ["Hello", "Hi", "Hey"],
    signoffPatterns: ["Thanks", "Best", "Regards"],
    emojiUsage: 0.1,
    exclamationUsage: 0.1,
    questionFrequency: 0.2,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Analyze text to extract style features.
 */
export function analyzeTextStyle(text: string): Partial<StyleProfile> {
  const words = text.split(/\s+/);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);

  // Calculate average sentence length
  const sentenceLength = sentences.length > 0 ? words.length / sentences.length : 15;

  // Extract vocabulary (unique words, excluding common stop words)
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "must", "shall", "can", "need", "dare",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "i", "me", "my", "myself", "we", "our", "ours", "ourselves", "you",
    "your", "yours", "yourself", "yourselves", "he", "him", "his",
    "himself", "she", "her", "hers", "herself", "it", "its", "itself",
    "they", "them", "their", "theirs", "themselves", "what", "which",
    "who", "whom", "this", "that", "these", "those", "am", "been",
    "being", "having", "here", "there", "when", "where", "why", "how",
    "all", "each", "few", "more", "most", "other", "some", "such",
    "and", "but", "or", "not", "no", "so", "just", "also", "very",
    "too", "only", "same", "than", "then", "now", "well", "still",
  ]);

  const vocabulary = [
    ...new Set(
      words
        .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
        .filter((w) => w.length > 3 && !stopWords.has(w)),
    ),
  ].slice(0, 100);

  // Count emojis
  const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu;
  const emojiMatches = text.match(emojiRegex) || [];
  const emojiUsage = words.length > 0 ? emojiMatches.length / words.length : 0.1;

  // Count exclamations
  const exclamationCount = (text.match(/!/g) || []).length;
  const exclamationUsage = words.length > 0 ? Math.min(exclamationCount / words.length * 10, 1) : 0.1;

  // Count questions
  const questionCount = (text.match(/\?/g) || []).length;
  const questionFrequency = sentences.length > 0 ? questionCount / sentences.length : 0.2;

  // Detect tone based on vocabulary and formatting
  const formalWords = ["therefore", "furthermore", "however", "nevertheless", "consequently", "regarding", "concerning", "appreciate", "acknowledge"];
  const casualWords = ["hey", "yeah", "gonna", "wanna", "gotta", "cool", "awesome", " stuff", "things"];
  const formalCount = formalWords.filter((w) => text.toLowerCase().includes(w)).length;
  const casualCount = casualWords.filter((w) => text.toLowerCase().includes(w)).length;

  let tone: TonePreference = "neutral";
  if (formalCount > casualCount && formalCount > 0) {
    tone = "formal";
  } else if (casualCount > formalCount && casualCount > 0) {
    tone = "casual";
  }

  // Extract greeting patterns (first words that appear at start)
  const greetingPatterns: string[] = [];
  const firstWord = words[0]?.replace(/[^a-zA-Z]/g, "");
  if (firstWord && firstWord.length > 1) {
    greetingPatterns.push(firstWord);
  }

  // Extract signoff patterns (last words before common signoffs)
  const signoffPatterns: string[] = [];
  const signoffKeywords = ["thanks", "best", "regards", "cheers", "sincerely", "talk soon", "later"];
  for (const keyword of signoffKeywords) {
    if (text.toLowerCase().includes(keyword)) {
      const idx = text.toLowerCase().indexOf(keyword);
      const beforeKeyword = text.slice(Math.max(0, idx - 20), idx).split(/\s+/).slice(-3);
      if (beforeKeyword.length > 0) {
        signoffPatterns.push(beforeKeyword.join(" "));
      }
    }
  }

  return {
    sentenceLength,
    vocabulary,
    emojiUsage,
    exclamationUsage,
    questionFrequency,
    tone,
    greetingPatterns: greetingPatterns.slice(0, 5),
    signoffPatterns: signoffPatterns.slice(0, 5),
  };
}

/**
 * Merge analyzed style into existing profile.
 */
export function mergeStyleProfile(
  existing: StyleProfile,
  analysis: Partial<StyleProfile>,
): StyleProfile {
  const merged: StyleProfile = { ...existing };

  if (analysis.sentenceLength !== undefined) {
    // Blend sentence lengths with exponential moving average
    merged.sentenceLength = existing.sentenceLength * 0.7 + analysis.sentenceLength * 0.3;
  }

  if (analysis.vocabulary) {
    // Merge vocabulary, keeping most common
    const combined = [...new Set([...existing.vocabulary, ...analysis.vocabulary])];
    merged.vocabulary = combined.slice(0, 100);
  }

  if (analysis.commonPhrases) {
    const combined = [...new Set([...existing.commonPhrases, ...analysis.commonPhrases])];
    merged.commonPhrases = combined.slice(0, 50);
  }

  if (analysis.greetingPatterns) {
    const combined = [...new Set([...existing.greetingPatterns, ...analysis.greetingPatterns])];
    merged.greetingPatterns = combined.slice(0, 10);
  }

  if (analysis.signoffPatterns) {
    const combined = [...new Set([...existing.signoffPatterns, ...analysis.signoffPatterns])];
    merged.signoffPatterns = combined.slice(0, 10);
  }

  if (analysis.emojiUsage !== undefined) {
    merged.emojiUsage = existing.emojiUsage * 0.8 + analysis.emojiUsage * 0.2;
  }

  if (analysis.exclamationUsage !== undefined) {
    merged.exclamationUsage = existing.exclamationUsage * 0.8 + analysis.exclamationUsage * 0.2;
  }

  if (analysis.questionFrequency !== undefined) {
    merged.questionFrequency = existing.questionFrequency * 0.8 + analysis.questionFrequency * 0.2;
  }

  if (analysis.tone) {
    // Only update tone if we have strong signal
    merged.tone = analysis.tone;
  }

  merged.updatedAt = new Date().toISOString();
  return merged;
}

/**
 * Apply style adaptation to generate text matching owner's voice.
 */
export function applyStyleAdaptation(
  text: string,
  profile: StyleProfile,
  context?: "greeting" | "farewell" | "follow_up" | "question" | "statement",
): string {
  let adapted = text;

  // Add contextual greeting if empty
  if (context === "greeting" && profile.greetingPatterns.length > 0) {
    const greeting = profile.greetingPatterns[Math.floor(Math.random() * profile.greetingPatterns.length)];
    adapted = `${greeting}, ${text}`;
  }

  // Add contextual signoff if empty
  if (context === "farewell" && profile.signoffPatterns.length > 0) {
    const signoff = profile.signoffPatterns[Math.floor(Math.random() * profile.signoffPatterns.length)];
    adapted = `${text} ${signoff}`;
  }

  // Adjust exclamation usage
  if (profile.exclamationUsage > 0.3 && !adapted.includes("!") && Math.random() < profile.exclamationUsage) {
    adapted = adapted.replace(/\.$/, "!");
  }

  // Add emoji based on usage frequency
  if (profile.emojiUsage > 0.2 && Math.random() < profile.emojiUsage) {
    const emojis = ["👍", "😊", "🙂", "✨", "💪"];
    adapted = `${adapted} ${emojis[Math.floor(Math.random() * emojis.length)]}`;
  }

  // Adjust sentence length by splitting/joining sentences
  const sentences = adapted.split(/[.!?]+\s*/).filter((s) => s.trim());
  if (sentences.length > 1) {
    const targetLength = Math.round(profile.sentenceLength);
    const currentLength = adapted.split(/\s+/).length;
    const diff = currentLength - targetLength;

    if (Math.abs(diff) > 5) {
      // If too long, condense some sentences
      if (diff > 0 && sentences.length > 2) {
        const midIdx = Math.floor(sentences.length / 2);
        sentences.splice(midIdx, 1);
        adapted = sentences.join(". ") + (adapted.endsWith("!") ? "!" : ".");
      }
    }
  }

  return adapted;
}

/**
 * Default disclosure message template.
 */
export const DEFAULT_DISCLOSURE_MESSAGE = "Hey, this is my AI agent responding on my behalf";

/**
 * Create default contact disclosure.
 */
export function createContactDisclosure(contactOwnerId: string): ContactDisclosure {
  return {
    contactOwnerId,
    discloseAgent: false,
    disclosureMessage: DEFAULT_DISCLOSURE_MESSAGE,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Style Adapter manages owner style profiles and contact disclosures.
 */
export class StyleAdapter {
  private profiles: Map<string, StyleProfile>;
  private disclosures: Map<string, ContactDisclosure>;
  private ownerProfile: StyleProfile | null;

  constructor() {
    this.profiles = new Map();
    this.disclosures = new Map();
    this.ownerProfile = null;
  }

  /**
   * Initialize with an existing owner style profile.
   */
  setOwnerProfile(profile: StyleProfile): void {
    this.ownerProfile = profile;
    this.profiles.set("owner", profile);
  }

  /**
   * Get the owner style profile.
   */
  getOwnerProfile(): StyleProfile | null {
    return this.ownerProfile;
  }

  /**
   * Learn style from a message.
   */
  learnFromMessage(senderIsOwner: boolean, message: string): void {
    if (!senderIsOwner) return;

    const analysis = analyzeTextStyle(message);

    if (this.ownerProfile) {
      this.ownerProfile = mergeStyleProfile(this.ownerProfile, analysis);
      this.profiles.set("owner", this.ownerProfile);
    } else {
      this.ownerProfile = mergeStyleProfile(createEmptyStyleProfile(), analysis);
      this.profiles.set("owner", this.ownerProfile);
    }
  }

  /**
   * Get style profile for a contact.
   */
  getProfile(contactOwnerId: string): StyleProfile | null {
    return this.profiles.get(contactOwnerId) || this.ownerProfile;
  }

  /**
   * Get or create disclosure config for a contact.
   */
  getOrCreateDisclosure(contactOwnerId: string): ContactDisclosure {
    let disclosure = this.disclosures.get(contactOwnerId);
    if (!disclosure) {
      disclosure = createContactDisclosure(contactOwnerId);
      this.disclosures.set(contactOwnerId, disclosure);
    }
    return disclosure;
  }

  /**
   * Update disclosure config for a contact.
   */
  updateDisclosure(updates: Partial<ContactDisclosure> & { contactOwnerId: string }): ContactDisclosure {
    const existing = this.getOrCreateDisclosure(updates.contactOwnerId);
    const updated: ContactDisclosure = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.disclosures.set(updates.contactOwnerId, updated);
    return updated;
  }

  /**
   * Get all contact disclosures.
   */
  listDisclosures(): ContactDisclosure[] {
    return Array.from(this.disclosures.values());
  }

  /**
   * Check if agent should disclose to a contact.
   */
  shouldDiscloseToContact(contactOwnerId: string): boolean {
    const disclosure = this.disclosures.get(contactOwnerId);
    return disclosure?.discloseAgent ?? false;
  }

  /**
   * Adapt text to match owner style, applying disclosure if needed.
   */
  adapt(
    text: string,
    contactOwnerId: string,
    senderIsOwner: boolean,
    context?: "greeting" | "farewell" | "follow_up" | "question" | "statement",
  ): StyleAdaptResult {
    // If owner is sending, no adaptation needed
    if (senderIsOwner) {
      return {
        adaptedText: text,
        wasAdapted: false,
        disclosureApplied: false,
      };
    }

    // Check if we should disclose
    const disclosure = this.disclosures.get(contactOwnerId);
    const shouldDisclose = disclosure?.discloseAgent ?? false;

    // If not disclosing, apply style adaptation
    let adaptedText = text;
    let wasAdapted = false;

    const profile = this.ownerProfile || createEmptyStyleProfile();

    if (!shouldDisclose) {
      adaptedText = applyStyleAdaptation(text, profile, context);
      wasAdapted = adaptedText !== text;
    }

    return {
      adaptedText,
      wasAdapted,
      disclosureApplied: shouldDisclose,
    };
  }
}

/**
 * Build the mesh.set-style tool.
 */
export function buildSetStyleTool(
  adapter: StyleAdapter,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; profile?: StyleProfile; error?: string }> {
  return async (params) => {
    const tone = params.tone as string | undefined;
    const vocabulary = params.vocabulary as string[] | undefined;
    const sentenceLength = params.sentenceLength as number | undefined;

    if (tone && !["formal", "casual", "neutral"].includes(tone)) {
      return { ok: false, error: `Invalid tone: ${tone}. Must be "formal", "casual", or "neutral"` };
    }

    const profile = adapter.getOwnerProfile() || createEmptyStyleProfile();
    const updatedProfile: StyleProfile = {
      ...profile,
      ...(tone && { tone: tone as TonePreference }),
      ...(vocabulary && { vocabulary }),
      ...(sentenceLength !== undefined && { sentenceLength }),
      updatedAt: new Date().toISOString(),
    };
    adapter.setOwnerProfile(updatedProfile);

    return { ok: true, profile: updatedProfile };
  };
}

/**
 * Build the mesh.get-style tool.
 */
export function buildGetStyleTool(
  adapter: StyleAdapter,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; profile?: StyleProfile | null }> {
  return async () => {
    return { ok: true, profile: adapter.getOwnerProfile() };
  };
}

/**
 * Build the mesh.set-contact-disclosure tool.
 */
export function buildSetContactDisclosureTool(
  adapter: StyleAdapter,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; disclosure?: ContactDisclosure; error?: string }> {
  return async (params) => {
    const contactOwnerId = params.contactOwnerId as string | undefined;
    const discloseAgent = params.discloseAgent as boolean | undefined;
    const disclosureMessage = params.disclosureMessage as string | undefined;
    const customGreeting = params.customGreeting as string | undefined;

    if (!contactOwnerId) {
      return { ok: false, error: "contactOwnerId is required" };
    }

    const disclosure = adapter.updateDisclosure({
      contactOwnerId,
      ...(discloseAgent !== undefined && { discloseAgent }),
      ...(disclosureMessage !== undefined && { disclosureMessage }),
      ...(customGreeting !== undefined && { customGreeting }),
    });

    return { ok: true, disclosure };
  };
}

/**
 * Build the mesh.get-contact-disclosure tool.
 */
export function buildGetContactDisclosureTool(
  adapter: StyleAdapter,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; disclosure?: ContactDisclosure }> {
  return async (params) => {
    const contactOwnerId = params.contactOwnerId as string | undefined;
    if (!contactOwnerId) {
      return { ok: false, error: "contactOwnerId is required" };
    }

    const disclosure = adapter.getOrCreateDisclosure(contactOwnerId);
    return { ok: true, disclosure };
  };
}
