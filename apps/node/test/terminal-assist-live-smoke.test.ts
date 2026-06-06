import { readFileSync } from "node:fs";
import { join } from "node:path";

import { stripModelThinking } from "@envoymesh/api";
import {
  buildModelProviders,
  parseTerminalCommandProposal,
  routeModelRequest,
} from "@envoymesh/models";
import { describe, expect, it } from "vitest";

const LIVE = process.env.TERMINAL_ASSIST_LIVE === "1";

describe.skipIf(!LIVE)("terminal assist live model smoke", () => {
  it("routes NL through configured chat model", async () => {
    const cfgPath = join(process.cwd(), "apps/node/data/default/node-config.json");
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8")) as {
      modelProviders: import("@envoymesh/api").ModelProviderConfig;
    };
    const mp = cfg.modelProviders;
    const providers = buildModelProviders(mp, true, {
      trustedLocalAssist: true,
      modelNameOverride: mp.modelName,
    });
    expect(providers.length).toBeGreaterThan(0);

    const result = await routeModelRequest(
      {
        taskType: "terminal.assist",
        prompt:
          'Propose one shell command as JSON only: {"command":"...","rationale":"...","riskTier":"safe"}\n' +
          "User: list files in current directory",
        sensitivity: "private",
        requesterPeerId: "local",
        ownerApproved: true,
      },
      providers,
    );

    expect(result.decision.action).toBe("allow");
    const raw = stripModelThinking(result.response?.text ?? "");
    const parsed = parseTerminalCommandProposal(raw);
    expect(parsed.ok, parsed.ok ? "" : parsed.reason).toBe(true);
  });
});
