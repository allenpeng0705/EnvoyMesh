/**
 * Tests for `parseRelayArgs`. The relay's CLI is the public contract for
 * how operators tune the circuit-relay-v2 server — any change here must
 * keep these tests green, and any new flag must be exercised here.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { parseRelayArgs, PUBLIC_RELAY_V2_DEFAULTS } from "../src/args.js";

// Snapshot the env at suite start so we can wipe every variable the parser
// reads after each test, regardless of what the host happened to have set.
const VARS = [
  "ENVOYMESH_PROFILE",
  "ENVOYMESH_BOOTSTRAP_PEERS",
  "ENVOYMESH_ADVERTISE_ADDRS",
  "ENVOYMESH_WS_AUTH_TOKEN",
  "ENVOYMESH_RELAY_PUBLIC_MODE",
  "ENVOYMESH_RELAY_MAX_RESERVATIONS",
  "ENVOYMESH_RELAY_RESERVATION_TTL_MS",
  "ENVOYMESH_RELAY_DEFAULT_DATA_LIMIT_BYTES",
  "ENVOYMESH_RELAY_DEFAULT_DURATION_LIMIT_MS",
  "ENVOYMESH_RELAY_HOP_TIMEOUT_MS",
  "ENVOYMESH_RELAY_MAX_OUTBOUND_STOP_STREAMS",
  "ENVOYMESH_RELAY_ADMIN_USER",
  "ENVOYMESH_RELAY_ADMIN_PASSWORD",
  "ENVOYMESH_RELAY_LOG_MAX_LINES",
  "ENVOYMESH_RELAY_LOG_MAX_BYTES",
  "ENVOYMESH_RELAY_LOG_RETAIN_DAYS",
] as const;
const SAVED_ENV: Record<string, string | undefined> = {};

describe("parseRelayArgs", () => {
  beforeEach(() => {
    for (const name of VARS) {
      SAVED_ENV[name] = process.env[name];
      delete process.env[name];
    }
  });
  afterEach(() => {
    for (const name of VARS) {
      if (SAVED_ENV[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = SAVED_ENV[name];
      }
    }
  });

  it("returns the default profile + listen + http port when called with no args", () => {
    const args = parseRelayArgs([]);
    expect(args.profileDir).toBe("./data/relay");
    expect(args.listen).toEqual(["/ip4/0.0.0.0/tcp/4001"]);
    expect(args.httpPort).toBe(15432);
    expect(args.enableDht).toBe(true);
    expect(args.dhtClientMode).toBe(true);
    expect(args.enableRendezvous).toBe(true);
    expect(args.adminUser).toBe("admin");
    expect(args.adminPassword).toBe("envoymesh123456");
  });

  it("returns libp2p-default v2 server config when no override is set", () => {
    // The parser doesn't return a v2 config object directly — it returns
    // the individual override fields. The relay's `index.ts` combines
    // them with public-mode presets. This test pins the "all null" path.
    const args = parseRelayArgs([]);
    expect(args.relayPublicMode).toBe(false);
    expect(args.relayMaxReservations).toBeNull();
    expect(args.relayReservationTtlMs).toBeNull();
    expect(args.relayDefaultDataLimitBytes).toBeNull();
    expect(args.relayDefaultDurationLimitMs).toBeNull();
    expect(args.relayHopTimeoutMs).toBeNull();
    expect(args.relayMaxOutboundStopStreams).toBeNull();
  });

  it("PUBLIC_RELAY_V2_DEFAULTS exposes the documented community-relay values", () => {
    // Sanity-check the constant — these are the values the user sees in
    // the docs and on /version when --relay-public-mode is set.
    expect(PUBLIC_RELAY_V2_DEFAULTS.maxReservations).toBe(1024);
    expect(PUBLIC_RELAY_V2_DEFAULTS.reservationTtlMs).toBe(30 * 60_000);
    expect(PUBLIC_RELAY_V2_DEFAULTS.defaultDataLimitBytes).toBe(4 * 1024 * 1024);
    expect(PUBLIC_RELAY_V2_DEFAULTS.defaultDurationLimitMs).toBe(60 * 60_000);
    expect(PUBLIC_RELAY_V2_DEFAULTS.hopTimeoutMs).toBe(90_000);
    expect(PUBLIC_RELAY_V2_DEFAULTS.maxOutboundStopStreams).toBe(1024);
  });

  it("parses --relay-public-mode", () => {
    const args = parseRelayArgs(["--relay-public-mode"]);
    expect(args.relayPublicMode).toBe(true);
  });

  it("parses individual --relay-* overrides", () => {
    const args = parseRelayArgs([
      "--relay-max-reservations", "512",
      "--relay-reservation-ttl-ms", "300000",
      "--relay-default-data-limit-bytes", "2097152",
      "--relay-default-duration-limit-ms", "900000",
      "--relay-hop-timeout-ms", "45000",
      "--relay-max-outbound-stop-streams", "600",
    ]);
    expect(args.relayMaxReservations).toBe(512);
    expect(args.relayReservationTtlMs).toBe(300_000);
    expect(args.relayDefaultDataLimitBytes).toBe(2_097_152);
    expect(args.relayDefaultDurationLimitMs).toBe(900_000);
    expect(args.relayHopTimeoutMs).toBe(45_000);
    expect(args.relayMaxOutboundStopStreams).toBe(600);
  });

  it("reads ENVOYMESH_RELAY_PUBLIC_MODE env var", () => {
    process.env.ENVOYMESH_RELAY_PUBLIC_MODE = "1";
    const args = parseRelayArgs([]);
    expect(args.relayPublicMode).toBe(true);
  });

  it("reads ENVOYMESH_RELAY_PUBLIC_MODE=0 as false (not just unset)", () => {
    process.env.ENVOYMESH_RELAY_PUBLIC_MODE = "0";
    const args = parseRelayArgs([]);
    expect(args.relayPublicMode).toBe(false);
  });

  it("reads per-field v2 overrides from env vars", () => {
    process.env.ENVOYMESH_RELAY_MAX_RESERVATIONS = "128";
    process.env.ENVOYMESH_RELAY_HOP_TIMEOUT_MS = "90000";
    const args = parseRelayArgs([]);
    expect(args.relayMaxReservations).toBe(128);
    expect(args.relayHopTimeoutMs).toBe(90_000);
  });

  it("CLI args win over env vars (CLI > env > default)", () => {
    process.env.ENVOYMESH_RELAY_MAX_RESERVATIONS = "128";
    const args = parseRelayArgs(["--relay-max-reservations", "512"]);
    expect(args.relayMaxReservations).toBe(512);
  });

  it("rejects --relay-max-reservations=0 (must be positive)", () => {
    expect(() => parseRelayArgs(["--relay-max-reservations", "0"])).toThrow(
      /must be a positive integer/,
    );
  });

  it("rejects --relay-max-reservations=abc (must be a number)", () => {
    expect(() => parseRelayArgs(["--relay-max-reservations", "abc"])).toThrow(
      /must be a positive integer/,
    );
  });

  it("rejects --relay-max-reservations=-1 (must be positive)", () => {
    expect(() => parseRelayArgs(["--relay-max-reservations", "-1"])).toThrow(
      /must be a positive integer/,
    );
  });

  it("rejects ENVOYMESH_RELAY_PUBLIC_MODE=junk", () => {
    process.env.ENVOYMESH_RELAY_PUBLIC_MODE = "maybe";
    expect(() => parseRelayArgs([])).toThrow(/must be a boolean/);
  });

  it("rejects unknown CLI flag", () => {
    expect(() => parseRelayArgs(["--totally-unknown", "x"])).toThrow(
      /Unknown argument/,
    );
  });

  it("parses --http-port and validates the range", () => {
    const args = parseRelayArgs(["--http-port", "8080"]);
    expect(args.httpPort).toBe(8080);
    expect(() => parseRelayArgs(["--http-port", "0"])).toThrow(/between 1 and 65535/);
    expect(() => parseRelayArgs(["--http-port", "70000"])).toThrow(/between 1 and 65535/);
  });

  it("combines --advertise-addr + ENVOYMESH_ADVERTISE_ADDRS", () => {
    // Env vars are applied first, CLI flags append. Operators using
    // `ENVOYMESH_ADVERTISE_ADDRS` for the always-needed public IP and
    // adding CLI flags for occasional overrides get both — neither
    // source silently wins.
    process.env.ENVOYMESH_ADVERTISE_ADDRS = "/ip4/5.6.7.8/tcp/4001";
    const args = parseRelayArgs(["--advertise-addr", "/ip4/1.2.3.4/tcp/4001"]);
    expect(args.advertiseAddrs).toEqual([
      "/ip4/5.6.7.8/tcp/4001",
      "/ip4/1.2.3.4/tcp/4001",
    ]);
  });

  it("parses admin credentials and log retention from CLI and env", () => {
    const cli = parseRelayArgs([
      "--admin-user",
      "ops",
      "--admin-password",
      "pw",
      "--log-max-lines",
      "100",
      "--log-max-bytes",
      "1024",
      "--log-retain-days",
      "3",
    ]);
    expect(cli.adminUser).toBe("ops");
    expect(cli.adminPassword).toBe("pw");
    expect(cli.logMaxLines).toBe(100);
    expect(cli.logMaxBytes).toBe(1024);
    expect(cli.logRetainDays).toBe(3);

    process.env.ENVOYMESH_RELAY_ADMIN_USER = "env-ops";
    process.env.ENVOYMESH_RELAY_ADMIN_PASSWORD = "env-pw";
    process.env.ENVOYMESH_RELAY_LOG_MAX_LINES = "50";
    const env = parseRelayArgs([]);
    expect(env.adminUser).toBe("env-ops");
    expect(env.adminPassword).toBe("env-pw");
    expect(env.logMaxLines).toBe(50);
  });
});
