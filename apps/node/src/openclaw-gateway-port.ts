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
 *
 * Sends SIGTERM first, then escalates to SIGKILL for any PIDs that still hold
 * the port after a 1.5s grace. The escalation matters for orphan OpenClaw
 * children left over from a parent crash / force-quit: their SIGTERM handler
 * is deferred behind their (already-in-progress) `params.start({...})` server
 * startup, so a polite kill can hold the port for 60+ seconds while the model
 * warmup completes. SIGKILL after 1.5s forces the OS to reap the child and
 * release the port so the new gateway can bind and acquire the lock cleanly.
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

  const initialListeners = listListeningPidsOnPort(params.port).filter(
    (pid) => params.excludePid == null || pid !== params.excludePid,
  );
  if (initialListeners.length === 0) {
    return false;
  }

  if (status === 404) {
    params.log?.(
      `[openclaw] Port ${params.port} is held by a gateway without the EnvoyMesh webhook — stopping stale process(es): ${initialListeners.join(", ")}`,
    );
  } else {
    params.log?.(
      `[openclaw] Port ${params.port} is in use — stopping stale listener(s): ${initialListeners.join(", ")}`,
    );
  }

  stopProcesses(initialListeners, params.excludePid);
  await new Promise((resolve) => setTimeout(resolve, 1500));

  // Escalate to SIGKILL for any PID that still holds the port. openclaw's
  // graceful shutdown is deferred behind its server startup, so a polite
  // SIGTERM can leave the listener bound for 60s+ on the orphan path.
  const stillListening = listListeningPidsOnPort(params.port).filter(
    (pid) => params.excludePid == null || pid !== params.excludePid,
  );
  if (stillListening.length > 0) {
    params.log?.(
      `[openclaw] ${stillListening.length} listener(s) still bound after 1.5s — sending SIGKILL: ${stillListening.join(", ")}`,
    );
    for (const pid of stillListening) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* already dead or permission denied */
      }
    }
    // Brief settle for the OS to reap the SIGKILL'd process and release the port.
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return true;
}
