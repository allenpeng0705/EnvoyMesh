/**
 * One-shot chat-model health check (Settings → AI → Test chat model).
 * Confirms the effective provider can complete a short static prompt.
 */
export type ChatModelProbeResult =
  | {
      ok: true;
      providerId: string;
      modelName: string;
      mode?: string;
      endpoint?: string;
      /** Short preview of the model reply (truncated). */
      replyPreview: string;
      latencyMs: number;
    }
  | {
      ok: false;
      providerId?: string;
      modelName?: string;
      mode?: string;
      endpoint?: string;
      error: string;
      latencyMs: number;
    };
