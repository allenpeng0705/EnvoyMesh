/**
 * Unit tests for fleet-apply.ts dry-run path.
 *
 * Exercises the full pipeline (--dry-run) with the example fleet.yaml,
 * verifying that parseArgs, loadFleetFile, parseFleetBootstrap, and all
 * 7 steps run without making real WebSocket connections.
 */
import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { parseArgs, loadFleetFile } from "../../../../scripts/fleet-apply.js";
import {
  parseFleetBootstrap,
  sponsorNode,
  manifestMemberNodes,
  inviteMemberNodes,
  buildNodeConfigPatch,
  resolveFleetSecrets,
  DEFAULT_FLEET_APPLY_STEPS,
} from "@envoymesh/api";

const EXAMPLE_FLEET = resolve(process.cwd(), "fleet.example.yaml");

describe("fleet-apply: parseArgs", () => {
  it("parses --file and --dry-run", () => {
    const result = parseArgs(["--file", "fleet.yaml", "--dry-run"]);
    expect(result.file).toBe("fleet.yaml");
    expect(result.dryRun).toBe(true);
    expect(result.help).toBe(false);
  });

  it("parses positional file arg", () => {
    const result = parseArgs(["my-fleet.json"]);
    expect(result.file).toBe("my-fleet.json");
    expect(result.dryRun).toBe(false);
  });

  it("parses --steps", () => {
    const result = parseArgs(["--file", "x.yaml", "--steps", "ensureOnline,verifyRoster"]);
    expect(result.steps).toEqual(["ensureOnline", "verifyRoster"]);
  });

  it("returns help=true for --help", () => {
    const result = parseArgs(["--help"]);
    expect(result.help).toBe(true);
  });

  it("returns help=false and file=undefined for empty args", () => {
    const result = parseArgs([]);
    expect(result.help).toBe(false);
    expect(result.file).toBeUndefined();
  });
});

describe("fleet-apply: loadFleetFile", () => {
  it("loads fleet.example.yaml as YAML", async () => {
    const raw = await loadFleetFile(EXAMPLE_FLEET);
    expect(raw).toBeTypeOf("object");
    const parsed = parseFleetBootstrap(raw);
    expect(parsed.fleetId).toBe("acme-office");
    expect(parsed.nodes).toHaveLength(4);
  });
});

describe("fleet-apply: dry-run pipeline (no real RPC)", () => {
  // Load and validate the example fleet file end-to-end.
  const bootstrap = (async () =>
    parseFleetBootstrap(await loadFleetFile(EXAMPLE_FLEET)))();

  it("parses with one sponsor + three members", async () => {
    const b = await bootstrap;
    expect(b.nodes.filter((n) => n.role === "sponsor")).toHaveLength(1);
    expect(b.nodes.filter((n) => n.role === "member")).toHaveLength(3);
  });

  it("sponsorNode returns the sponsor", async () => {
    const b = await bootstrap;
    const sponsor = sponsorNode(b);
    expect(sponsor.id).toBe("home");
    expect(sponsor.role).toBe("sponsor");
  });

  it("manifestMemberNodes returns desk-bob only", async () => {
    const b = await bootstrap;
    const members = manifestMemberNodes(b);
    expect(members).toHaveLength(1);
    expect(members[0]!.id).toBe("desk-bob");
  });

  it("inviteMemberNodes returns remote-carol only", async () => {
    const b = await bootstrap;
    const invitees = inviteMemberNodes(b);
    expect(invitees).toHaveLength(1);
    expect(invitees[0]!.id).toBe("remote-carol");
  });

  it("buildNodeConfigPatch produces non-empty patch for sponsor", async () => {
    const b = await bootstrap;
    process.env.LAN_FLEET_TOKEN = "test-token-123";
    process.env.SPONSOR_TOKEN = "test-sponsor-456";
    const resolvedSecrets = resolveFleetSecrets(b);
    const sponsor = sponsorNode(b);
    const patch = buildNodeConfigPatch(b, sponsor, resolvedSecrets);
    expect(Object.keys(patch).length).toBeGreaterThan(0);
    expect(JSON.stringify(patch)).toContain("capabilityProviderEnabled");
    delete process.env.LAN_FLEET_TOKEN;
    delete process.env.SPONSOR_TOKEN;
  });

  it("DEFAULT_FLEET_APPLY_STEPS has 7 steps", () => {
    expect(DEFAULT_FLEET_APPLY_STEPS).toHaveLength(7);
    expect(DEFAULT_FLEET_APPLY_STEPS[0]).toBe("ensureOnline");
    expect(DEFAULT_FLEET_APPLY_STEPS[6]).toBe("verifyRoster");
  });

  it("resolveFleetSecrets reads tokenRef from env", async () => {
    const b = await bootstrap;
    process.env.LAN_FLEET_TOKEN = "my-secret-token";
    process.env.SPONSOR_TOKEN = "my-sponsor-proof";
    const secrets = resolveFleetSecrets(b);
    expect(secrets.lanFleetToken).toBe("my-secret-token");
    expect(secrets.sponsorProofToken).toBe("my-sponsor-proof");
    // Clean up
    delete process.env.LAN_FLEET_TOKEN;
    delete process.env.SPONSOR_TOKEN;
  });

  it("resolveFleetSecrets throws for missing env vars", async () => {
    const b = await bootstrap;
    delete process.env.LAN_FLEET_TOKEN;
    delete process.env.SPONSOR_TOKEN;
    expect(() => resolveFleetSecrets(b)).toThrow(/env.*is missing or empty/);
  });
});
