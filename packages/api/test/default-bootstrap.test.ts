import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS,
  DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
  defaultBootstrapPresetsForDiscoveryProfile,
  normalizeBootstrapPresetsForContactsOnly,
} from "@envoymesh/api";

describe("default bootstrap presets", () => {
  it("maps discovery profiles to preset lists", () => {
    expect(defaultBootstrapPresetsForDiscoveryProfile("wan-default")).toEqual(
      DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS,
    );
    expect(defaultBootstrapPresetsForDiscoveryProfile("contacts-only")).toEqual(
      DEFAULT_CONTACTS_ONLY_BOOTSTRAP_PRESETS,
    );
    expect(defaultBootstrapPresetsForDiscoveryProfile("lan-fast")).toEqual([]);
  });

  it("normalizes contacts-only presets by removing public-libp2p swarm ids", () => {
    expect(normalizeBootstrapPresetsForContactsOnly([...DEFAULT_PUBLIC_LIBP2P_BOOTSTRAP_PRESETS])).toEqual([
      "cn-relay",
    ]);
    expect(normalizeBootstrapPresetsForContactsOnly(["cn-relay", "my-org-relay"])).toEqual([
      "cn-relay",
      "my-org-relay",
    ]);
  });
});
