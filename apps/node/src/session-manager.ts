/**
 * Session Manager for AI Agent
 *
 * Maintains persistent conversation sessions per contact:
 * - Tracks message count, last interaction, conversation summary
 * - Detects escalation triggers (emotional content, sensitive topics)
 * - Persists across agent restarts
 */

import { randomUUID } from "node:crypto";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Conversation escalation trigger types.
 */
export type EscalationTrigger =
  | "emotional_content"
  | "sensitive_topic"
  | "explicit_escalation"
  | "urgent_keywords";

/**
 * Pending escalation for a contact.
 */
export interface PendingEscalation {
  trigger: EscalationTrigger;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

/**
 * Conversation sentiment estimate.
 */
export type Sentiment = "positive" | "neutral" | "negative" | "mixed";

/**
 * Per-contact conversation session state.
 */
export interface ConversationSession {
  contactOwnerId: string;
  contactDisplayName: string;
  messageCount: number;
  lastInteraction: string;
  lastMessagePreview: string;
  conversationSummary: string;
  pendingEscalation: PendingEscalation | null;
  sentiment: Sentiment;
  sentimentScore: number; // -1 to 1
  createdAt: string;
  updatedAt: string;
}

/**
 * Simple sentiment keywords for basic escalation detection.
 * In production, use a proper sentiment analysis model.
 */
const NEGATIVE_EMOTIONAL_WORDS = [
  "angry", "frustrated", "upset", "annoyed", "disappointed", "sad",
  "terrible", "awful", "horrible", "worst", "hate", "stupid", "idiot",
];

const URGENT_KEYWORDS = [
  "urgent", "emergency", "asap", "immediately", "critical", "important",
  "help", "need", "want", "must", "immediately", "right now",
];

const SENSITIVE_TOPICS = [
  "password", "secret", "private", "confidential", "money", "bank",
  "credit card", "ssn", "social security", "account", "login",
];

/**
 * Analyze text for escalation triggers.
 */
export function detectEscalationTriggers(text: string): {
  triggers: EscalationTrigger[];
  sentiment: Sentiment;
  sentimentScore: number;
} {
  const lowerText = text.toLowerCase();
  const triggers: EscalationTrigger[] = [];

  // Check for emotional content
  let negativeCount = 0;
  for (const word of NEGATIVE_EMOTIONAL_WORDS) {
    if (lowerText.includes(word)) {
      negativeCount++;
    }
  }

  // Check for urgent keywords
  let urgentCount = 0;
  for (const keyword of URGENT_KEYWORDS) {
    if (lowerText.includes(keyword)) {
      urgentCount++;
    }
  }

  // Check for sensitive topics
  let sensitiveCount = 0;
  for (const topic of SENSITIVE_TOPICS) {
    if (lowerText.includes(topic)) {
      sensitiveCount++;
    }
  }

  // Check for explicit escalation
  const explicitEscalation = /\b(escalate|supervisor|manager|help|talk to someone|not happy|cannot believe|speak with manager)\b/i.test(text);

  if (negativeCount >= 2) {
    triggers.push("emotional_content");
  }

  if (urgentCount >= 2) {
    triggers.push("emotional_content");
  }

  if (sensitiveCount >= 1) {
    triggers.push("sensitive_topic");
  }

  if (explicitEscalation) {
    triggers.push("explicit_escalation");
  }

  // Calculate sentiment score
  let sentimentScore = 0;
  if (negativeCount > 0) {
    sentimentScore = -Math.min(negativeCount * 0.3, 1);
  }
  if (urgentCount > 0 && negativeCount === 0) {
    sentimentScore = -0.1; // Slight negative for urgency without context
  }

  let sentiment: Sentiment = "neutral";
  if (sentimentScore > 0.2) {
    sentiment = "positive";
  } else if (sentimentScore < -0.2) {
    sentiment = "negative";
  }

  return { triggers, sentiment, sentimentScore };
}

/**
 * Create a new conversation session.
 */
export function createConversationSession(
  contactOwnerId: string,
  contactDisplayName: string,
  initialMessage?: string,
): ConversationSession {
  const now = new Date().toISOString();
  const session: ConversationSession = {
    contactOwnerId,
    contactDisplayName,
    messageCount: initialMessage ? 1 : 0,
    lastInteraction: now,
    lastMessagePreview: initialMessage?.slice(0, 100) ?? "",
    conversationSummary: initialMessage ?? "",
    pendingEscalation: null,
    sentiment: "neutral",
    sentimentScore: 0,
    createdAt: now,
    updatedAt: now,
  };

  // Check for triggers in initial message
  if (initialMessage) {
    const analysis = detectEscalationTriggers(initialMessage);
    if (analysis.triggers.length > 0) {
      session.pendingEscalation = {
        trigger: analysis.triggers[0],
        message: initialMessage.slice(0, 200),
        timestamp: now,
        acknowledged: false,
      };
    }
    session.sentiment = analysis.sentiment;
    session.sentimentScore = analysis.sentimentScore;
  }

  return session;
}

/**
 * Session store interface.
 */
export interface SessionStore {
  /**
   * Get session for a contact.
   */
  getSession(contactOwnerId: string): Promise<ConversationSession | undefined>;

  /**
   * List all sessions.
   */
  listSessions(): Promise<ConversationSession[]>;

  /**
   * Save or update a session.
   */
  saveSession(session: ConversationSession): Promise<void>;

  /**
   * Delete a session.
   */
  deleteSession(contactOwnerId: string): Promise<void>;
}

/**
 * File-based session store.
 */
export class FileSessionStore implements SessionStore {
  private sessionsDir: string;

  constructor(sessionsDir: string) {
    this.sessionsDir = sessionsDir;
  }

  private sessionPath(contactOwnerId: string): string {
    // Sanitize the contactOwnerId to be a valid filename
    const safeId = contactOwnerId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.sessionsDir, `session_${safeId}.json`);
  }

  async ensureDir(): Promise<void> {
    await mkdir(this.sessionsDir, { recursive: true });
  }

  async getSession(contactOwnerId: string): Promise<ConversationSession | undefined> {
    try {
      const path = this.sessionPath(contactOwnerId);
      const data = await readFile(path, "utf8");
      return JSON.parse(data) as ConversationSession;
    } catch {
      return undefined;
    }
  }

  async listSessions(): Promise<ConversationSession[]> {
    await this.ensureDir();
    const { readdir } = await import("node:fs/promises");

    const files = await readdir(this.sessionsDir);
    const sessionFiles = files.filter((f) => f.startsWith("session_") && f.endsWith(".json"));

    const sessions: ConversationSession[] = [];
    for (const file of sessionFiles) {
      try {
        const data = await readFile(join(this.sessionsDir, file), "utf8");
        sessions.push(JSON.parse(data) as ConversationSession);
      } catch {
        // Skip invalid files
      }
    }

    return sessions.sort(
      (a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime(),
    );
  }

  async saveSession(session: ConversationSession): Promise<void> {
    await this.ensureDir();
    const path = this.sessionPath(session.contactOwnerId);
    const tmpPath = `${path}.tmp`;
    await writeFile(tmpPath, JSON.stringify(session, null, 2), "utf8");
    await rename(tmpPath, path);
  }

  async deleteSession(contactOwnerId: string): Promise<void> {
    const path = this.sessionPath(contactOwnerId);
    const { rm } = await import("node:fs/promises");
    try {
      await rm(path);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

/**
 * Session Manager handles per-contact conversation sessions.
 */
export class SessionManager {
  private store: SessionStore;
  private inMemorySessions: Map<string, ConversationSession>;

  constructor(store: SessionStore) {
    this.store = store;
    this.inMemorySessions = new Map();
  }

  /**
   * Get or create a session for a contact.
   */
  async getOrCreateSession(
    contactOwnerId: string,
    contactDisplayName: string,
  ): Promise<ConversationSession> {
    // Check memory first
    let session = this.inMemorySessions.get(contactOwnerId);
    if (!session) {
      // Check store
      session = await this.store.getSession(contactOwnerId);
    }
    if (!session) {
      // Create new session
      session = createConversationSession(contactOwnerId, contactDisplayName);
    }
    this.inMemorySessions.set(contactOwnerId, session);
    return session;
  }

  /**
   * Update session with a new message.
   */
  async recordMessage(
    contactOwnerId: string,
    contactDisplayName: string,
    message: string,
    senderIsOwner: boolean,
  ): Promise<ConversationSession> {
    const session = await this.getOrCreateSession(contactOwnerId, contactDisplayName);

    // Update session
    session.messageCount++;
    session.lastInteraction = new Date().toISOString();
    session.lastMessagePreview = message.slice(0, 100);

    // Update summary (keep last ~500 chars)
    if (session.conversationSummary.length > 0) {
      session.conversationSummary = `${session.conversationSummary}\n[${senderIsOwner ? "Owner" : "Contact"}]: ${message.slice(0, 200)}`;
    } else {
      session.conversationSummary = `[${senderIsOwner ? "Owner" : "Contact"}]: ${message.slice(0, 200)}`;
    }
    if (session.conversationSummary.length > 500) {
      session.conversationSummary = session.conversationSummary.slice(-500);
    }

    session.updatedAt = new Date().toISOString();

    // Check for escalation triggers (only on inbound messages from contacts)
    if (!senderIsOwner) {
      const analysis = detectEscalationTriggers(message);
      session.sentiment = analysis.sentiment;
      session.sentimentScore = analysis.sentimentScore;

      if (analysis.triggers.length > 0 && !session.pendingEscalation) {
        session.pendingEscalation = {
          trigger: analysis.triggers[0],
          message: message.slice(0, 200),
          timestamp: new Date().toISOString(),
          acknowledged: false,
        };
      }
    }

    // Save to store and memory
    await this.store.saveSession(session);
    this.inMemorySessions.set(contactOwnerId, session);

    return session;
  }

  /**
   * Acknowledge a pending escalation for a contact.
   */
  async acknowledgeEscalation(contactOwnerId: string): Promise<ConversationSession | undefined> {
    const session = this.inMemorySessions.get(contactOwnerId);
    if (session && session.pendingEscalation) {
      session.pendingEscalation.acknowledged = true;
      session.pendingEscalation = null;
      await this.store.saveSession(session);
      return session;
    }
    return undefined;
  }

  /**
   * List all sessions with pending escalations.
   */
  async listSessionsWithEscalations(): Promise<ConversationSession[]> {
    const sessions = await this.store.listSessions();
    return sessions.filter((s) => s.pendingEscalation && !s.pendingEscalation.acknowledged);
  }

  /**
   * List all sessions.
   */
  async listSessions(): Promise<ConversationSession[]> {
    return this.store.listSessions();
  }

  /**
   * Get session summary for a contact.
   */
  async getSessionSummary(contactOwnerId: string): Promise<string | undefined> {
    const session = this.inMemorySessions.get(contactOwnerId);
    if (!session) {
      const fromStore = await this.store.getSession(contactOwnerId);
      return fromStore?.conversationSummary;
    }
    return session.conversationSummary;
  }

  /**
   * Delete a session.
   */
  async deleteSession(contactOwnerId: string): Promise<void> {
    this.inMemorySessions.delete(contactOwnerId);
    await this.store.deleteSession(contactOwnerId);
  }
}

/**
 * Build the session-summary tool.
 */
export function buildSessionSummaryTool(
  manager: SessionManager,
): (params: Record<string, unknown>) => Promise<{ error?: string; summary?: string; session?: ConversationSession }> {
  return async (params) => {
    const ownerId = params.ownerId as string | undefined;
    if (!ownerId) {
      return { error: "ownerId parameter is required" };
    }

    const session = await manager.getOrCreateSession(ownerId, ownerId);
    const summary = session.conversationSummary || "No conversation history";

    return { summary, session };
  };
}

/**
 * Build the mesh.list-sessions tool.
 */
export function buildListSessionsTool(
  manager: SessionManager,
): (params: Record<string, unknown>) => Promise<{ sessions: ConversationSession[]; count: number }> {
  return async () => {
    const sessions = await manager.listSessions();
    return { sessions, count: sessions.length };
  };
}

/**
 * Build the mesh.acknowledge-escalation tool.
 */
export function buildAcknowledgeEscalationTool(
  manager: SessionManager,
): (params: Record<string, unknown>) => Promise<{ ok: boolean; ownerId?: string; error?: string }> {
  return async (params) => {
    const ownerId = params.ownerId as string | undefined;
    if (!ownerId) {
      return { ok: false, error: "ownerId parameter is required" };
    }

    const session = await manager.acknowledgeEscalation(ownerId);
    if (!session) {
      return { ok: false, error: "Session not found or no pending escalation" };
    }

    return { ok: true, ownerId };
  };
}
