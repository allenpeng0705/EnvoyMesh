import { execFileSync } from "node:child_process";
import { isOpenClawEnvoymeshWebhookReady } from "./openclaw-gateway-config.js";

/** POST `{}` to the EnvoyMesh webhook; returns HTTP status or null when unreachable. */
export async function probeEnvoymeshWebhookStatus(
  url: string,
  timeoutMs = 2000,
): Promise<number | null> {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    return resp.status;
  } catch {
    return null;
  }
}

export function listListeningPidsOnPort(port: number): number[] {
  try {
    const out = execFileSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"], {
      encoding: "utf-8",
    });
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((value) => Number(value))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

export function stopProcesses(pids: readonly number[], excludePid?: number): number[] {
  const stopped: number[] = [];
  for (const pid of pids) {
    if (excludePid != null && pid === excludePid) continue;
    try {
      process.kill(pid, "SIGTERM");
      stopped.push(pid);
    } catch {
      /* already exited or permission denied */
    }
  }
  return stopped;
}

/**
 * Stop a stale gateway listener when the webhook URL returns 404 (route missing).
 * Returns true when one or more processes were signalled.
 */
export async function reclaimAssistantGatewayPort(params: {
  port: number;
  webhookUrl: string;
  excludePid?: number;
  log?: (message: string) => void;
}): Promise<boolean> {
  const status = await probeEnvoymeshWebhookStatus(params.webhookUrl);
  if (status != null && isOpenClawEnvoymeshWebhookReady(status)) {
    return false;
  }

  const listeners = listListeningPidsOnPort(params.port).filter(
    (pid) => params.excludePid == null || pid !== params.excludePid,
  );
  if (listeners.length === 0) {
    return false;
  }

  if (status === 404) {
    params.log?.(
      `[openclaw] Port ${params.port} is held by a gateway without the EnvoyMesh webhook — stopping stale process(es): ${listeners.join(", ")}`,
    );
  } else {
    params.log?.(
      `[openclaw] Port ${params.port} is in use — stopping stale listener(s): ${listeners.join(", ")}`,
    );
  }

  stopProcesses(listeners, params.excludePid);
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return true;
}
