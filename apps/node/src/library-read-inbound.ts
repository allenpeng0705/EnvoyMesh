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
import { readFile, stat, realpath, access } from "node:fs/promises";
import { join, resolve as resolvePath } from "node:path";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  createWebContentStore,
  resolveWebContentIndexCandidates,
  visibilityToSensitivity,
  DEFAULT_VISIBILITY,
  type WebContentStore,
} from "./web-content-store.js";
import { mimeTypeForFilename } from "./node-service-fileshare.js";
import { resolveSenderOwnerId as resolveOwnerFromPeerDirectory } from "./share-inbound.js";

/** Prefer path extension over a stale/wrong manifest mimeType (e.g. index.html stored as text/markdown). */
function resolveContentType(normalizedPath: string, entryMimeType?: string): string {
  const fromName = mimeTypeForFilename(normalizedPath);
  if (fromName !== "application/octet-stream") return fromName;
  return entryMimeType ?? fromName;
}

/** Result of the inbound handler. */
export type LibraryReadInboundResult =
  | { ok: true; responsePayload: LibraryReadResponsePayload; senderOwnerId?: string }
  | { ok: false; reason: string };

/**
 * Hard cap on a single **text** response body (UTF-8, ~1:1 in the envelope).
 * 48 KiB leaves headroom under the 64 KiB inbound envelope guard.
 */
export const MAX_LIBRARY_READ_RESPONSE_BYTES = 48 * 1024;
/**
 * Cap for **base64** bodies (binary full reads + all range slices).
 * Base64 expands ~4/3, so 40 KiB raw ≈ 53 KiB body + framing stays under 64 KiB.
 * Matches the Browser client chunk size (`LIBRARY_READ_CHUNK_BYTES`).
 */
export const MAX_LIBRARY_READ_BINARY_BYTES = 40 * 1024;
const MAX_RESPONSE_BYTES = MAX_LIBRARY_READ_RESPONSE_BYTES;
const MAX_BINARY_BYTES = MAX_LIBRARY_READ_BINARY_BYTES;

/** Stream-hash a file so large resources don't need a full in-memory buffer. */
async function hashFileSha256(absPath: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(absPath);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }
  return hash.digest("hex");
}

/**
 * Resolve the owner ID for a sender using the peer directory.
 * Uses the same PEM→peerId fallback as share/chat so a stale libp2p peerId
 * on the contact row does not demote a bonded peer to stranger (which would
 * return not_found for bonded profile portals).
 */
async function resolveSenderOwnerId(
  envelope: EnvoyEnvelope,
  remotePeerId: string,
  peerDirectoryStore: LocalPeerDirectoryStore,
): Promise<string | undefined> {
  if (envelope.agentCredential?.ownerId) {
    return envelope.agentCredential.ownerId;
  }
  return resolveOwnerFromPeerDirectory(envelope.senderPeerId, remotePeerId, peerDirectoryStore);
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
  /**
   * If true, this is a local self-read (owner preview). Bypasses public
   * gating and grants private-tier access.
   *
   * SECURITY NOTE: this flag is set ONLY by NodeServiceImpl when
   * `params.targetOwnerId === profile.owner.ownerId` (the owner browsing
   * their own content in-process). It is NOT set for remote peers,
   * paired devices, or any other caller. A paired-but-revoked device
   * with a stale NodeService reference could theoretically abuse this,
   * but that requires in-process code execution on the owner's machine
   * (at which point the attacker already has filesystem access).
   */
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
  //    Always reply (never silent-drop) so expect-reply callers don't hang.
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
      return {
        ok: true,
        responsePayload: createLibraryReadResponsePayload({
          inReplyTo: envelope.messageId,
          status: "not_found",
        }),
        senderOwnerId,
      };
    }
  }

  // 5. Resolve the path's visibility from the manifest.
  //    Empty path / trailing slash → index.html, then index.md.
  const webDir = join(profileDir, "web");
  const store = webContentStore ?? createWebContentStore(webDir);
  const candidates = resolveWebContentIndexCandidates(payload.path);
  let normalizedPath = candidates[0]!;
  let entry = await store.findByPath(normalizedPath);
  for (const candidate of candidates) {
    const found = await store.findByPath(candidate);
    if (found) {
      normalizedPath = candidate;
      entry = found;
      break;
    }
  }
  // Prefer on-disk index.html when the manifest still points at a stale index.md.
  // Keep prior manifest visibility when the preferred file exists on disk but
  // has no manifest row yet (e.g. portal HTML rewritten without upsert) —
  // falling back to private would 404 bonded peers on a published site.
  const priorEntry = entry;
  let diskIndexWithoutManifest = false;
  if (candidates.length > 1) {
    for (const candidate of candidates) {
      try {
        await access(join(webDir, candidate));
        const found = await store.findByPath(candidate);
        normalizedPath = candidate;
        if (found) {
          entry = found;
          diskIndexWithoutManifest = false;
        } else {
          // Serve on-disk bytes; mime comes from path. Visibility from prior
          // index.md / bonded default — not private.
          entry = undefined;
          diskIndexWithoutManifest = true;
        }
        break;
      } catch {
        /* try next */
      }
    }
  }
  let visibility =
    entry?.visibility ??
    (diskIndexWithoutManifest ? (priorEntry?.visibility ?? "bonded") : DEFAULT_VISIBILITY);

  // Feed Moments sidecar images may predate manifesto rows — inherit the post's ACL.
  let aclEntry = entry ?? (diskIndexWithoutManifest ? priorEntry : undefined);
  if (!entry && normalizedPath.startsWith("feeds/media/")) {
    const slug = normalizedPath.split("/")[2]?.trim();
    if (slug && !slug.includes("..")) {
      const postEntry = await store.findByPath(`feeds/${slug}.md`);
      if (postEntry) {
        visibility = postEntry.visibility;
        aclEntry = postEntry;
      } else {
        visibility = "bonded";
      }
    }
  }

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
    // Always not_found here — including contacts-visibility paths — so blocked /
    // stranger peers cannot distinguish ACL-gated paths from missing ones.
    // `forbidden` is reserved for the contacts ACL miss below (bonded peers only).
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
        summary: `library.read not_found: ${policyDecision.reason} (visibility=${visibility})`,
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

  // 7. For `contacts` visibility: ACL is deny-by-default.
  //    Missing/empty contactIds must not fall open to every bonded peer.
  if (visibility === "contacts" && !isLocalSelfRead) {
    const allowed = aclEntry?.contactIds;
    if (!allowed?.length || !senderOwnerId || !allowed.includes(senderOwnerId)) {
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
  //    Also resolve symlinks: a symlink inside web/ pointing outside
  //    (e.g. to /etc/passwd) must be rejected (design §5.2, §6).
  //    Note: both webDir and the resolved path must be realpath'd so
  //    that OS-level symlink redirects (e.g. /var → /private/var on
  //    macOS) don't cause false positives.
  const resolvedAbs = resolvePath(webDir, normalizedPath);
  let safePath = resolvedAbs;
  try {
    assertPathInsideVault(webDir, resolvedAbs);
    // Resolve symlinks for both the web root and the target file,
    // then check the real target is still inside the real web root.
    try {
      const realWebDir = await realpath(webDir);
      const real = await realpath(resolvedAbs);
      assertPathInsideVault(realWebDir, real);
      safePath = real;
    } catch (err) {
      // ENOENT is fine — file doesn't exist; stat() below will return not_found.
      // Any other error (EACCES, etc.) from realpath is treated as not_found.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
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
  //    Full-file sha256 is always computed so etag/contentHash identify the
  //    resource (not a range slice) — required for 45B cache revalidation
  //    and client-side integrity of assembled range fetches.
  let fileBytes: Buffer;
  let totalBytes: number;
  let fullContentHash: string;
  let rangeStart: number | undefined;
  let rangeEnd: number | undefined;
  try {
    const stats = await stat(safePath);
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
    fullContentHash = await hashFileSha256(safePath);
    const etag = fullContentHash.slice(0, 16);

    // Phase 45B — If-None-Match: client already has this revision.
    if (payload.ifNoneMatch && payload.ifNoneMatch === etag && !payload.range) {
      await taskStore.appendAuditEvent(
        createAuditEvent({
          type: "policy.decided",
          intent: envelope.intent,
          messageId: envelope.messageId,
          correlationId,
          remotePeerId,
          direction: "inbound",
          verificationStatus: "verified",
          latencyMs: Date.now() - receivedAt,
          outcome: "allow",
          summary: `library.read not_modified: etag=${etag} (${pathPreview})`,
          createdAt: envelope.createdAt,
        }),
      );
      return {
        ok: true,
        responsePayload: createLibraryReadResponsePayload({
          inReplyTo: envelope.messageId,
          status: "not_modified",
          contentType: resolveContentType(normalizedPath, entry?.mimeType),
          contentHash: fullContentHash,
          byteLength: totalBytes,
          etag,
        }),
        senderOwnerId,
      };
    }

    const contentTypeEarly = resolveContentType(normalizedPath, entry?.mimeType);
    const isTextMime =
      contentTypeEarly.startsWith("text/") || contentTypeEarly === "application/json";

    // Range handling — always base64 on the wire, so enforce the binary cap.
    if (payload.range) {
      rangeStart = Math.max(0, Math.min(payload.range.start, totalBytes));
      if (totalBytes === 0 || rangeStart >= totalBytes) {
        // Past-EOF / empty file: empty body, no fabricated zero-fill byte.
        fileBytes = Buffer.alloc(0);
        rangeEnd = rangeStart > 0 ? rangeStart - 1 : 0;
      } else {
        rangeEnd = Math.min(payload.range.end, totalBytes - 1);
        if (rangeEnd < rangeStart) rangeEnd = rangeStart;
        const len = rangeEnd - rangeStart + 1;
        if (len > MAX_BINARY_BYTES) {
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
              summary: `library.read too_large: range ${len} bytes > ${MAX_BINARY_BYTES} cap (${pathPreview})`,
              createdAt: envelope.createdAt,
            }),
          );
          return {
            ok: true,
            responsePayload: createLibraryReadResponsePayload({
              inReplyTo: envelope.messageId,
              status: "too_large",
              contentType: contentTypeEarly,
              contentHash: fullContentHash,
              byteLength: totalBytes,
              etag,
            }),
            senderOwnerId,
          };
        }
        const fd = await import("node:fs/promises").then((m) => m.open(safePath, "r"));
        try {
          const buf = Buffer.alloc(len);
          await fd.read(buf, 0, len, rangeStart);
          fileBytes = buf;
        } finally {
          await fd.close();
        }
      }
    } else {
      // Full read: text uses 48 KiB; binary uses 40 KiB (base64 expansion).
      const fullCap = isTextMime ? MAX_RESPONSE_BYTES : MAX_BINARY_BYTES;
      if (totalBytes > fullCap) {
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
            summary: `library.read too_large: ${totalBytes} bytes > ${fullCap} cap (${pathPreview})`,
            createdAt: envelope.createdAt,
          }),
        );
        return {
          ok: true,
          responsePayload: createLibraryReadResponsePayload({
            inReplyTo: envelope.messageId,
            status: "too_large",
            contentType: contentTypeEarly,
            contentHash: fullContentHash,
            byteLength: totalBytes,
            etag,
          }),
          senderOwnerId,
        };
      }
      fileBytes = await readFile(safePath);
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
  const contentType = resolveContentType(normalizedPath, entry?.mimeType);
  const etag = fullContentHash.slice(0, 16);

  // Body encoding: full responses use UTF-8 for text/*; range slices are
  // always base64 so multi-byte UTF-8 characters are never split mid-codepoint.
  const isText =
    !payload.range &&
    (contentType.startsWith("text/") || contentType === "application/json");
  const body = isText ? fileBytes.toString("utf8") : fileBytes.toString("base64");

  const responsePayload = createLibraryReadResponsePayload({
    inReplyTo: envelope.messageId,
    status: "ok",
    body,
    contentType,
    contentHash: fullContentHash,
    // NOTE: byteLength is the *slice* length for range requests, not the
    // total resource size. The total is in `range.total` when a range is
    // present. For non-range reads, byteLength == total. Callers that
    // need the total should check `range?.total ?? byteLength`.
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
