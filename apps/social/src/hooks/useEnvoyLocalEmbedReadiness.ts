/**
 * Poll Envoy Local embed sidecar readiness for Knowledge Ask (RAG).
 * When embedding.mode is envoy-local (default), Ask stays blocked until
 * `running`. Browse/file UI does not gate on this. Cloud/Ollama/mock do not
 * gate Ask either.
 *
 * Download/start is kicked off on **node boot** (Tauri launches the home
 * node), not when opening Knowledge. This hook only polls + manual retry.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AiEmbeddingSettings, EnvoyLocalEmbedStatus } from "@envoymesh/api";
import { resolveEnvoyLocalEmbedModelId } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";

export type KnowledgeEmbedGateKind =
  | "ready"
  | "not-required"
  | "downloading"
  | "error"
  | "needs-install"
  | "unknown";

export function usesEnvoyLocalEmbed(embedding?: AiEmbeddingSettings | null): boolean {
  const mode = embedding?.mode;
  return mode == null || mode === "envoy-local" || (mode as string) === "inherit";
}

export function isEmbedOperationInFlight(status: EnvoyLocalEmbedStatus | null): boolean {
  if (!status) return false;
  // Ready sidecar means install finished — never show "Downloading" because a
  // background enable job or reindex is still wrapping up.
  if (status.running || status.phase === "ready") return false;
  if (status.operationInProgress) return true;
  if (status.download) return true;
  const phase = status.phase;
  return (
    phase === "detecting" ||
    phase === "downloading-runtime" ||
    phase === "extracting-runtime" ||
    phase === "downloading-model" ||
    phase === "starting"
  );
}

export function useEnvoyLocalEmbedReadiness(
  embedding?: AiEmbeddingSettings | null,
  opts?: { enabled?: boolean },
) {
  const nodeService = useNodeService();
  const hookEnabled = opts?.enabled !== false;
  const required = hookEnabled && usesEnvoyLocalEmbed(embedding);
  const [status, setStatus] = useState<EnvoyLocalEmbedStatus | null>(null);
  const [kickoffBusy, setKickoffBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!required) {
      setStatus(null);
      setLoadError(null);
      return null;
    }
    try {
      const st = await nodeService.getEnvoyLocalEmbedStatus();
      setStatus(st);
      setLoadError(null);
      return st;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(message);
      return null;
    }
  }, [nodeService, required]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const inFlight = isEmbedOperationInFlight(status) || kickoffBusy;

  useEffect(() => {
    if (!required || !inFlight) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 1000);
    return () => window.clearInterval(id);
  }, [required, inFlight, refresh]);

  // Poll slowly while blocked so boot auto-provision progress surfaces.
  useEffect(() => {
    if (!required) return;
    if (status?.running) return;
    if (inFlight) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 2000);
    return () => window.clearInterval(id);
  }, [required, status?.running, inFlight, refresh]);

  const startDownload = useCallback(async (modelId?: string) => {
    if (!required) return null;
    setKickoffBusy(true);
    try {
      const id = resolveEnvoyLocalEmbedModelId(modelId ?? embedding?.modelName);
      const st = await nodeService.enableEnvoyLocalEmbed({ modelId: id });
      setStatus(st);
      setLoadError(null);
      return st;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(message);
      await refresh();
      return null;
    } finally {
      setKickoffBusy(false);
    }
  }, [nodeService, required, refresh, embedding?.modelName]);

  const stop = useCallback(async () => {
    if (!required) return null;
    setKickoffBusy(true);
    try {
      const st = await nodeService.stopEnvoyLocalEmbed();
      setStatus(st);
      setLoadError(null);
      return st;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setLoadError(message);
      await refresh();
      return null;
    } finally {
      setKickoffBusy(false);
    }
  }, [nodeService, required, refresh]);

  const kind: KnowledgeEmbedGateKind = useMemo(() => {
    if (!required) return "not-required";
    if (status?.running) return "ready";
    if (inFlight) return "downloading";
    if (status?.phase === "error" || status?.lastError || loadError) return "error";
    if (status) return "needs-install";
    return "unknown";
  }, [required, status, inFlight, loadError]);

  const ready = kind === "ready" || kind === "not-required";
  const blocked = required && !ready;

  return {
    required,
    ready,
    blocked,
    kind,
    status,
    loadError,
    inFlight,
    refresh,
    startDownload,
    stop,
  };
}
