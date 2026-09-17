import { describe, expect, it } from "vitest";
import type { HumanProfile, NodeConfig } from "@envoymesh/api";
import { translate } from "../../src/i18n/translate.js";
import { en } from "../../src/i18n/messages/en.js";
import {
  codeEmptyHint,
  nearbyEmptyHint,
  widerEmptyHint,
  widerTopicHint,
} from "../../src/lib/discover-empty-hints.js";

const t = (key: string) => translate(en, key);

/** The hint helpers read only `discoveryProfile`/`enableMdns`, so the fixture
 *  stays partial; the cast restores the full `NodeConfig` the context declares
 *  without fabricating the ~19 unrelated config fields. */
const cfg = (
  partial: Pick<NodeConfig, "discoveryProfile"> & Partial<Pick<NodeConfig, "enableMdns">>,
): NodeConfig => partial as NodeConfig;

/** Same for `humanProfile`: only `profileVisibility` steers the hints. */
const hp = (partial: Pick<HumanProfile, "profileVisibility">): HumanProfile =>
  partial as HumanProfile;

describe("discover-empty-hints", () => {
  const base = {
    path: "nearby" as const,
    nodeStatus: "running",
    nodeConfig: cfg({ discoveryProfile: "lan-fast", enableMdns: true }),
    humanProfile: hp({ profileVisibility: "private" }),
  };

  it("nearby hints when node offline", () => {
    expect(nearbyEmptyHint({ ...base, nodeStatus: "offline" }, t)).toMatch(/connection is off/i);
  });

  it("nearby hints when local discovery disabled", () => {
    expect(
      nearbyEmptyHint(
        {
          ...base,
          nodeConfig: cfg({ discoveryProfile: "lan-fast", enableMdns: false }),
        },
        t,
      ),
    ).toMatch(/Nearby discovery is turned off/i);
  });

  it("code hints suggest checking with friend", () => {
    expect(
      codeEmptyHint(
        {
          ...base,
          path: "code",
          nodeConfig: cfg({ discoveryProfile: "contacts-only" }),
        },
        t,
      ),
    ).toMatch(/friend/i);
  });

  it("wider hints mention friends-only visibility for topic mode", () => {
    expect(
      widerEmptyHint(
        {
          ...base,
          path: "wider",
          widerMode: "topic",
        },
        t,
      ),
    ).toMatch(/friends-only/i);
  });

  it("wider topic banner for contacts-only", () => {
    expect(
      widerTopicHint(
        {
          ...base,
          path: "wider",
          nodeConfig: cfg({ discoveryProfile: "contacts-only" }),
        },
        t,
      ),
    ).toMatch(/contacts-only/i);
  });

  it("wider hints when relay not ready", () => {
    expect(
      widerEmptyHint(
        {
          ...base,
          path: "wider",
          widerMode: "topic",
          relayNotReady: true,
        },
        (key, fallback) => (typeof fallback === "string" ? fallback : translate(en, key)),
      ),
    ).toMatch(/mesh relay/i);
  });
});
