/**
 * Phase 69 — DirectCallClient must forward autonomy RPCs (Tauri / in-process Social).
 * Kept as a source wiring guard: full jsdom panel tests OOM on this host when
 * importing the SocialProxySessionsPanel + @envoymesh/api barrel together.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const clientSrc = readFileSync(
  join(here, "../src/lib/direct-call-client.ts"),
  "utf8",
);

describe("DirectCallClient Phase 69 autonomy wiring", () => {
  it("forwards listSocialProxySessions", () => {
    expect(clientSrc).toMatch(/async listSocialProxySessions\(/);
    expect(clientSrc).toMatch(/this\._ns\.listSocialProxySessions\(/);
  });

  it("forwards getAutonomyDigest", () => {
    expect(clientSrc).toMatch(/async getAutonomyDigest\(/);
    expect(clientSrc).toMatch(/this\._ns\.getAutonomyDigest\(/);
  });

  it("forwards Context Memory RPCs", () => {
    expect(clientSrc).toMatch(/async getContextMemoryStatus\(/);
    expect(clientSrc).toMatch(/this\._ns\.getContextMemoryStatus\(/);
    expect(clientSrc).toMatch(/async listContextMemoryFacts\(/);
    expect(clientSrc).toMatch(/async forgetContextMemoryFact\(/);
    expect(clientSrc).toMatch(/async pinContextMemoryFact\(/);
    expect(clientSrc).toMatch(/async retryContextMemoryInstall\(/);
  });
});
