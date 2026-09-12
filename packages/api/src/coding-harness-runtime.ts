/**
 * Coding Tier B harness runtime — isolated from Ext Agent bridge state.
 * Home node stores per-workspace cwd / model / compatible creds.
 */

import {
  isCodingTierBHarness,
  type CodingHarnessId,
} from "./coding-harness.js";

export type CodingHarnessProviderKind =
  | "openai-compatible"
  | "anthropic-compatible";

export type CodingHarnessRuntimeFields = {
  model?: string;
  providerKind?: CodingHarnessProviderKind;
  endpoint?: string;
  /** Only accepted on set; never returned to the browser after store. */
  apiKey?: string;
};

export type AskCodingHarnessParams = {
  /** CodingExtSession.id */
  codingSessionId: string;
  /** Tier B harness only. */
  harness: CodingHarnessId;
  prompt: string;
  /** Working directory on the home node for this ask. */
  cwd: string;
  /**
   * Non-secret runtime hints from the client (model / provider / endpoint).
   * API key is resolved from the home-node store set at workspace create.
   */
  runtime?: Omit<CodingHarnessRuntimeFields, "apiKey">;
};

export type SetCodingHarnessRuntimeParams = {
  codingSessionId: string;
  cwd: string;
  runtime?: CodingHarnessRuntimeFields;
};

export type ClearCodingHarnessRuntimeParams = {
  codingSessionId: string;
};

export type SetCodingHarnessRuntimeResult = {
  ok: true;
  codingSessionId: string;
  hasApiKey: boolean;
};

export type ClearCodingHarnessRuntimeResult = {
  ok: true;
  codingSessionId: string;
};

/** Backend session key for Coding Tier B (never Ext Agent owner key). */
export function codingHarnessSessionKey(codingSessionId: string): string {
  return `coding:${codingSessionId.trim()}`;
}

export function isCodingHarnessSessionKey(sessionKey: string): boolean {
  return sessionKey.startsWith("coding:");
}

export function normalizeCodingHarnessProviderKind(
  raw: unknown,
): CodingHarnessProviderKind | undefined {
  if (raw === "openai-compatible" || raw === "anthropic-compatible") {
    return raw;
  }
  return undefined;
}

export function parseAskCodingHarnessParams(
  raw: unknown,
): AskCodingHarnessParams {
  if (!raw || typeof raw !== "object") {
    throw new Error("askCodingHarness: invalid params");
  }
  const p = raw as Record<string, unknown>;
  const codingSessionId =
    typeof p.codingSessionId === "string" ? p.codingSessionId.trim() : "";
  const harness =
    typeof p.harness === "string" ? p.harness.trim() : "";
  const prompt = typeof p.prompt === "string" ? p.prompt.trim() : "";
  const cwd = typeof p.cwd === "string" ? p.cwd.trim() : "";
  if (!codingSessionId) {
    throw new Error("askCodingHarness: codingSessionId required");
  }
  if (!isCodingTierBHarness(harness)) {
    throw new Error(`askCodingHarness: not a Tier B harness: ${harness}`);
  }
  if (!prompt) throw new Error("askCodingHarness: prompt required");
  if (!cwd) throw new Error("askCodingHarness: cwd required");

  const runtimeRaw =
    p.runtime && typeof p.runtime === "object"
      ? (p.runtime as Record<string, unknown>)
      : undefined;
  const runtime = runtimeRaw
    ? {
        ...(typeof runtimeRaw.model === "string" && runtimeRaw.model.trim()
          ? { model: runtimeRaw.model.trim() }
          : {}),
        ...(normalizeCodingHarnessProviderKind(runtimeRaw.providerKind)
          ? {
              providerKind: normalizeCodingHarnessProviderKind(
                runtimeRaw.providerKind,
              ),
            }
          : {}),
        ...(typeof runtimeRaw.endpoint === "string" &&
        runtimeRaw.endpoint.trim()
          ? { endpoint: runtimeRaw.endpoint.trim() }
          : {}),
      }
    : undefined;

  return {
    codingSessionId,
    harness: harness as CodingHarnessId,
    prompt,
    cwd,
    ...(runtime && Object.keys(runtime).length > 0 ? { runtime } : {}),
  };
}

export function parseSetCodingHarnessRuntimeParams(
  raw: unknown,
): SetCodingHarnessRuntimeParams {
  if (!raw || typeof raw !== "object") {
    throw new Error("setCodingHarnessRuntime: invalid params");
  }
  const p = raw as Record<string, unknown>;
  const codingSessionId =
    typeof p.codingSessionId === "string" ? p.codingSessionId.trim() : "";
  const cwd = typeof p.cwd === "string" ? p.cwd.trim() : "";
  if (!codingSessionId) {
    throw new Error("setCodingHarnessRuntime: codingSessionId required");
  }
  if (!cwd) throw new Error("setCodingHarnessRuntime: cwd required");

  const runtimeRaw =
    p.runtime && typeof p.runtime === "object"
      ? (p.runtime as Record<string, unknown>)
      : undefined;
  const runtime = runtimeRaw
    ? {
        ...(typeof runtimeRaw.model === "string" && runtimeRaw.model.trim()
          ? { model: runtimeRaw.model.trim() }
          : {}),
        ...(normalizeCodingHarnessProviderKind(runtimeRaw.providerKind)
          ? {
              providerKind: normalizeCodingHarnessProviderKind(
                runtimeRaw.providerKind,
              ),
            }
          : {}),
        ...(typeof runtimeRaw.endpoint === "string" &&
        runtimeRaw.endpoint.trim()
          ? { endpoint: runtimeRaw.endpoint.trim() }
          : {}),
        ...(typeof runtimeRaw.apiKey === "string" && runtimeRaw.apiKey.trim()
          ? { apiKey: runtimeRaw.apiKey.trim() }
          : {}),
      }
    : undefined;

  return {
    codingSessionId,
    cwd,
    ...(runtime && Object.keys(runtime).length > 0 ? { runtime } : {}),
  };
}

export function parseClearCodingHarnessRuntimeParams(
  raw: unknown,
): ClearCodingHarnessRuntimeParams {
  if (!raw || typeof raw !== "object") {
    throw new Error("clearCodingHarnessRuntime: invalid params");
  }
  const p = raw as Record<string, unknown>;
  const codingSessionId =
    typeof p.codingSessionId === "string" ? p.codingSessionId.trim() : "";
  if (!codingSessionId) {
    throw new Error("clearCodingHarnessRuntime: codingSessionId required");
  }
  return { codingSessionId };
}
