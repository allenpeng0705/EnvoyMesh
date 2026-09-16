/**
 * Coding harness probe — EnvoyDev-aligned Ready / Not ready.
 * Mirrors EnvoyGo `coding_harness_probe.dart`.
 */
import {
  codingHarnessToExtAgentId,
  type CodingHarnessId,
} from "@envoymesh/api";

export type HarnessProbeBadge = "ready" | "not-ready" | "checking";

export type HarnessProbeResult = {
  badge: HarnessProbeBadge;
  line?: string;
  hint?: string;
  installCommand?: string;
  installLink?: string;
};

type ProbeClient = {
  getEnvoyHarnessStatus?: () => Promise<{ state?: string; error?: string }>;
  getPiStatus?: () => Promise<{ state?: string; error?: string }>;
  probeExtAgent?: (params: {
    agentId: string;
  }) => Promise<{
    installState?: string;
    reachable?: boolean;
    installGuide?: {
      installed?: boolean;
      installCommand?: string;
      homepageUrl?: string;
      installLink?: string;
      startHint?: string;
      command?: string;
      commonIssues?: string[];
    };
  }>;
};

/** Collapse legacy install/unknown badges to Not ready for display. */
export function harnessProbeLabelKey(
  badge: HarnessProbeBadge | "install" | "unknown" | undefined,
): "ready" | "not-ready" | "checking" | undefined {
  if (!badge) return undefined;
  if (badge === "ready") return "ready";
  if (badge === "checking") return "checking";
  return "not-ready";
}

export async function probeCodingHarness(
  client: ProbeClient,
  harness: CodingHarnessId,
): Promise<HarnessProbeResult> {
  try {
    if (harness === "envoy-harness") {
      const get = client.getEnvoyHarnessStatus;
      if (!get) return { badge: "not-ready", line: "Status unavailable." };
      const s = await get();
      if (s.state === "ready") {
        return { badge: "ready", line: "Ready on this home computer." };
      }
      return {
        badge: "not-ready",
        line: s.error?.trim() || "Envoy Harness is not ready yet.",
        hint: s.error,
      };
    }

    if (harness === "pi") {
      const get = client.getPiStatus;
      if (!get) return { badge: "not-ready", line: "Status unavailable." };
      const s = await get();
      const state = s.state ?? "";
      if (state === "ready" || state === "stopped" || state === "starting") {
        return {
          badge: "ready",
          line:
            state === "ready"
              ? "Ready on this home computer."
              : "Will start when you send a message.",
        };
      }
      if (state === "disabled") {
        return {
          badge: "not-ready",
          line: "Disabled — enable in Settings → AI.",
          hint: "Pi is disabled. Enable it in Settings → AI.",
        };
      }
      if (state === "not-installed") {
        return {
          badge: "not-ready",
          line: "Not bundled on this home node (slim build).",
        };
      }
      return {
        badge: "not-ready",
        line: s.error?.trim() || "Pi is not ready.",
        hint: s.error,
      };
    }

    const agentId = codingHarnessToExtAgentId(harness);
    const probe = client.probeExtAgent;
    if (!agentId || !probe) {
      return { badge: "not-ready", line: "Could not confirm install status." };
    }
    const r = await probe({ agentId });
    const guide = r.installGuide;
    const cmd = guide?.installCommand?.trim();
    const link = guide?.installLink?.trim() || guide?.homepageUrl?.trim();
    const startHint = guide?.startHint?.trim();

    if (r.installState === "unsupported") {
      return {
        badge: "not-ready",
        line: "Cannot drive this agent on this machine yet.",
        hint: startHint,
      };
    }
    if (r.installState === "not-installed" || guide?.installed === false) {
      const issues = Array.isArray(guide?.commonIssues)
        ? guide.commonIssues.map((s) => String(s).trim()).filter(Boolean)
        : [];
      const hint =
        startHint ||
        issues[0] ||
        "Install this agent on your home computer.";
      return {
        badge: "not-ready",
        line: cmd || "Not installed",
        hint,
        installCommand: cmd,
        installLink: link,
      };
    }
    if (r.installState === "installed" || r.reachable) {
      if (r.reachable !== true && startHint) {
        return {
          badge: "not-ready",
          line: "Installed — needs a short setup step.",
          hint: startHint,
          installCommand: cmd,
          installLink: link,
        };
      }
      return {
        badge: "ready",
        line: guide?.command
          ? `Ready (${guide.command}).`
          : "Ready on this home computer.",
        hint: startHint,
      };
    }
    return {
      badge: "not-ready",
      line: startHint || "Could not confirm install status.",
      hint: startHint,
      installCommand: cmd,
      installLink: link,
    };
  } catch (e) {
    return {
      badge: "not-ready",
      line: e instanceof Error ? e.message : String(e),
    };
  }
}

/** True when the picker should open the install/resolve dialog. */
export function harnessNeedsResolve(
  badge: HarnessProbeBadge | "install" | "unknown" | undefined,
): boolean {
  return (
    badge === "not-ready" || badge === "install" || badge === "unknown"
  );
}
