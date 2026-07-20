/**
 * Phase 45 — Inbound handler for the `library.read` intent.
 *
 * Mirrors `knowledge-query-inbound.ts` in shape (payload parse → audit →
 * resolve sender → rate-limit → policy gate → read → response build),
 * but reads raw content by URL path instead of routing through the LLM.
 *
 * Design: docs/web-content-browsing-design.md §4.4, §5, §8.2.
 */

import { createAuditEvent, type LocalTaskStore, type LocalTrustStore, type LocalPeerDirectoryStore, type NodeProfile } from "@envoymesh/local-store";
import {
  createLibraryReadResponsePayload,
  parseLibraryReadPayload,
  type EnvoyEnvelope,
  type LibraryReadResponsePayload,
} from "@envoymesh/protocol";
import { evaluatePolicy, checkPublicKnowledgeRateLimit } from "@envoymesh/bonds";
import { assertPathInsideVault } from "@envoymesh/vault";
import { ZodError } from "zod";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, resolve as resolvePath } from "node:path";
import { createHash } from "node:crypto";
import {
  createWebContentStore,
  normalizeWebPath,
  visibilityToSensitivity,
  DEFAULT_VISIBILITY,
  type WebContentStore,
} from "./web-content-store.js";
import { mimeTypeForFilename } from "./node-service-fileshare.js";

/** Result of the inbound handler. */
export type LibraryReadInboundResult =
  | { ok: true; responsePayload: LibraryReadResponsePayload; senderOwnerId?: string }
  | { ok: false; reason: string };

/** Hard cap on a single response body (envelope size budget). 48 KiB. */
const MAX_RESPONSE_BYTES = 48 * 1024;

/**
 * Resolve the owner ID for a sender using the peer directory.
 * Returns undefined if the sender is not a known contact.
 */
async function resolveSenderOwnerId(
  envelope: EnvoyEnvelope,
  remotePeerId: string,
  peerDirectoryStore: LocalPeerDirectoryStore,
): Promise<string | undefined> {
  if (envelope.agentCredential?.ownerId) {
    return envelope.agentCredential.ownerId;
  }
  const records = await peerDirectoryStore.listPeerRecords();
  const match =
    records.find((r) => r.peerId === envelope.senderPeerId) ??
    records.find((r) => r.peerId === remotePeerId);
  return match?.ownerId;
}

export interface HandleInboundLibraryReadInput {
  envelope: EnvoyEnvelope;
  remotePeerId: string;
  receivedAt: number;
  correlationId: string | undefined;
  taskStore: Pick<LocalTaskStore, "appendAuditEvent">;
  trustStore: LocalTrustStore;
  peerDirectoryStore: LocalPeerDirectoryStore;
  profile: NodeProfile;
  /** Absolute path to the profile directory (web/ lives under here). */
  profileDir: string;
  /** If true, this is a local self-read (owner preview). Bypasses public gating. */
  isLocalSelfRead?: boolean;
  /** Optional injected store (for tests). Falls back to createWebContentStore. */
  webContentStore?: WebContentStore;
}

/**
 * Handle an inbound `library.read` intent.
 *
 * Flow:
 *   1. Parse payload (Zod).
 *   2. Audit: message verified.
 *   3. Resolve sender's owner ID via peer directory; look up bond level.
 *   4. Rate-limit public (stranger) readers.
 *   5. Resolve the path's visibility from the manifest (default: private).
 *   6. Map visibility to sensitivity; evaluate bond policy.
 *   7. For `contacts` visibility: check the contactIds ACL.
 *   8. Path safety (assertPathInsideVault).
 *   9. Read file; honor range request.
 *  10. Build response (status, body, contentType, contentHash, etag).
 *  11. Audit the outcome.
 */
export async function handleInboundLibraryRead(
  input: HandleInboundLibraryReadInput,
): Promise<LibraryReadInboundResult> {
  const {
    envelope,
    remotePeerId,
    receivedAt,
    correlationId,
    taskStore,
    trustStore,
    peerDirectoryStore,
    profile,
    profileDir,
    isLocalSelfRead = false,
    webContentStore,
  } = input;

  // 1. Parse payload.
  let payload: ReturnType<typeof parseLibraryReadPayload>;
  try {
    payload = parseLibraryReadPayload(envelope.payload);
  } catch (error) {
    const reason =
      error instanceof ZodError
        ? error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).join("; ")
        : "invalid library.read payload";
    return { ok: false, reason };
  }

  const pathPreview = payload.path.length > 80 ? `${payload.path.slice(0, 77)}...` : payload.path;

  // 2. Audit: message verified.
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "message.verified",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "allow",
      summary: `library.read received: ${pathPreview}`,
      createdAt: envelope.createdAt,
    }),
  );

  // 3. Resolve sender's owner ID and bond level.
  let bondLevel: "self" | "direct" | "referred" | "public" | "blocked" = "public";
  let senderOwnerId: string | undefined;

  if (isLocalSelfRead) {
    bondLevel = "self";
  } else {
    senderOwnerId = await resolveSenderOwnerId(envelope, remotePeerId, peerDirectoryStore);
    bondLevel = senderOwnerId
      ? (await trustStore.getTrustRecord(senderOwnerId))?.level ?? "public"
      : "public";
  }

  // 4. Rate-limit public (stranger) readers — mirrors knowledge.query.
  if (bondLevel === "public" && !isLocalSelfRead) {
    const rateResult = checkPublicKnowledgeRateLimit(remotePeerId);
    if (!rateResult.allowed) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "policy.decided",
          intent: "library.read",
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "verified",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `library.read rate-limited: ${rateResult.remaining} remaining`,
          createdAt: envelope.createdAt,
        }),
      );
      return { ok: false, reason: "rate limited: too many library.read requests" };
    }
  }

  // 5. Resolve the path's visibility from the manifest.
  const webDir = join(profileDir, "web");
  const store = webContentStore ?? createWebContentStore(webDir);
  const normalizedPath = normalizeWebPath(payload.path);
  const entry = await store.findByPath(normalizedPath);
  const visibility = entry?.visibility ?? DEFAULT_VISIBILITY;

  // 6. Map visibility to sensitivity and evaluate bond policy.
  const requestedSensitivity = visibilityToSensitivity(visibility);
  const effectiveSensitivity = isLocalSelfRead ? "private" : requestedSensitivity;

  const policyDecision = evaluatePolicy({
    peerId: senderOwnerId ?? envelope.senderPeerId,
    bondLevel,
    intent: "library.read",
    requestedSensitivity: effectiveSensitivity,
  });

  if (policyDecision.action === "deny" || policyDecision.action === "approval_required") {
    // Return not_found rather than forbidden to avoid leaking path existence
    // to non-bonded peers. Bonded peers who lack a specific contact-id ACL
    // (for visibility: "contacts") get forbidden so they know to request access.
    const isContact = visibility === "contacts";
    const status: "not_found" | "forbidden" = isContact ? "forbidden" : "not_found";
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "library.read",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `library.read ${status}: ${policyDecision.reason} (visibility=${visibility})`,
        createdAt: envelope.createdAt,
      }),
    );
    return {
      ok: true,
      responsePayload: createLibraryReadResponsePayload({
        inReplyTo: envelope.messageId,
        status,
      }),
      senderOwnerId,
    };
  }

  // policyDecision.action === "allow" — but we still need to check that
  // the bond's max sensitivity actually meets the file's required tier.
  // The policy says "allow with max public" (for strangers) but the
  // file might be "bonded" visibility — in that case the bond cannot
  // reach the file's tier, and we return not_found to avoid leakage.
  // We compare the *sensitivity rankings* the Bonds engine uses.
  const allowedMax = policyDecision.action === "allow" ? policyDecision.maxSensitivity : "public";
  const SENSITIVITY_RANK: Record<"public" | "friends" | "trusted" | "private", number> = {
    public: 0,
    friends: 1,
    trusted: 2,
    private: 3,
  };
  if (SENSITIVITY_RANK[allowedMax as keyof typeof SENSITIVITY_RANK] < SENSITIVITY_RANK[effectiveSensitivity as keyof typeof SENSITIVITY_RANK]) {
    // The bond is too weak to access this file's tier. not_found to
    // avoid leaking path existence to non-bonded peers.
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "library.read",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `library.read not_found: bond too weak (max=${allowedMax}, need=${effectiveSensitivity})`,
        createdAt: envelope.createdAt,
      }),
    );
    return {
      ok: true,
      responsePayload: createLibraryReadResponsePayload({
        inReplyTo: envelope.messageId,
        status: "not_found",
      }),
      senderOwnerId,
    };
  }

  // 7. For `contacts` visibility: check the contactIds ACL.
  if (visibility === "contacts" && entry?.contactIds && !isLocalSelfRead) {
    if (!senderOwnerId || !entry.contactIds.includes(senderOwnerId)) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "policy.decided",
          intent: "library.read",
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "verified",
          latencyMs: Date.now() - receivedAt,
          outcome: "deny",
          summary: `library.read forbidden: sender not in contactIds for ${pathPreview}`,
          createdAt: envelope.createdAt,
        }),
      );
      return {
        ok: true,
        responsePayload: createLibraryReadResponsePayload({
          inReplyTo: envelope.messageId,
          status: "forbidden",
        }),
        senderOwnerId,
      };
    }
  }

  // 8. Path safety — resolve against the web/ root and verify inside.
  //    Path traversal attempts return not_found (no leakage).
  const resolvedAbs = resolvePath(webDir, normalizedPath);
  try {
    assertPathInsideVault(webDir, resolvedAbs);
  } catch {
    await taskStore.appendAuditEvent(
      createAuditEvent({
        type: "policy.decided",
        intent: "library.read",
        messageId: envelope.messageId,
        correlationId,
        remotePeerId,
        direction: "inbound",
        verificationStatus: "verified",
        latencyMs: Date.now() - receivedAt,
        outcome: "deny",
        summary: `library.read not_found: path traversal attempt (${pathPreview})`,
        createdAt: envelope.createdAt,
      }),
    );
    return {
      ok: true,
      responsePayload: createLibraryReadResponsePayload({
        inReplyTo: envelope.messageId,
        status: "not_found",
      }),
      senderOwnerId,
    };
  }

  // 9. Read the file (or a byte range if requested).
  let fileBytes: Buffer;
  let totalBytes: number;
  let rangeStart: number | undefined;
  let rangeEnd: number | undefined;
  try {
    const stats = await stat(resolvedAbs);
    if (!stats.isFile()) {
      return {
        ok: true,
        responsePayload: createLibraryReadResponsePayload({
          inReplyTo: envelope.messageId,
          status: "not_found",
        }),
        senderOwnerId,
      };
    }
    totalBytes = stats.size;

    // Range handling.
    if (payload.range) {
      rangeStart = Math.max(0, Math.min(payload.range.start, totalBytes));
      rangeEnd = Math.max(rangeStart, Math.min(payload.range.end, totalBytes - 1));
      const fd = await import("node:fs/promises").then((m) => m.open(resolvedAbs, "r"));
      try {
        const len = rangeEnd - rangeStart + 1;
        const buf = Buffer.alloc(len);
        await fd.read(buf, 0, len, rangeStart);
        fileBytes = buf;
      } finally {
        await fd.close();
      }
    } else {
      // No range — check size cap.
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await taskStore.appendAuditEvent(
          createAuditEvent({
            type: "policy.decided",
            intent: "library.read",
            messageId: envelope.messageId,
            correlationId,
            remotePeerId,
            direction: "inbound",
            verificationStatus: "verified",
            latencyMs: Date.now() - receivedAt,
            outcome: "deny",
            summary: `library.read too_large: ${totalBytes} bytes > ${MAX_RESPONSE_BYTES} cap (${pathPreview})`,
            createdAt: envelope.createdAt,
          }),
        );
        return {
          ok: true,
          responsePayload: createLibraryReadResponsePayload({
            inReplyTo: envelope.messageId,
            status: "too_large",
          }),
          senderOwnerId,
        };
      }
      fileBytes = await readFile(resolvedAbs);
    }
  } catch {
    // File doesn't exist or unreadable — not_found.
    return {
      ok: true,
      responsePayload: createLibraryReadResponsePayload({
        inReplyTo: envelope.messageId,
        status: "not_found",
      }),
      senderOwnerId,
    };
  }

  // 10. Build the response.
  const contentType = entry?.mimeType ?? mimeTypeForFilename(normalizedPath);
  const contentHash = createHash("sha256").update(fileBytes).digest("hex");
  const etag = contentHash.slice(0, 16);

  // Body encoding: UTF-8 for text/*, base64 for binary.
  const isText = contentType.startsWith("text/") || contentType === "application/json";
  const body = isText ? fileBytes.toString("utf8") : fileBytes.toString("base64");

  const responsePayload = createLibraryReadResponsePayload({
    inReplyTo: envelope.messageId,
    status: "ok",
    body,
    contentType,
    contentHash,
    byteLength: fileBytes.length,
    etag,
    range: payload.range
      ? { start: rangeStart ?? 0, end: rangeEnd ?? 0, total: totalBytes }
      : undefined,
  });

  // 11. Audit the served read.
  await taskStore.appendAuditEvent(
    createAuditEvent({
      type: "library.read.served",
      intent: envelope.intent,
      messageId: envelope.messageId,
      correlationId,
      remotePeerId,
      direction: "inbound",
      verificationStatus: "verified",
      latencyMs: Date.now() - receivedAt,
      outcome: "allow",
      summary: `library.read served: ${pathPreview} (${contentType}, ${fileBytes.length}B, visibility=${visibility})`,
      createdAt: envelope.createdAt,
    }),
  );

  return { ok: true, responsePayload, senderOwnerId };
}
