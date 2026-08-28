import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import {
  checkRelayRosterJoinToken,
  loadRelayRosterDocument,
  putRelayRosterDocument,
  RELAY_ROSTER_JOIN_TOKEN_HEADER,
  writeRelayRosterDocument,
} from "../src/relay-roster-http.js";
import {
  buildSelfRosterEntry,
  publishSelfOntoFleetRoster,
} from "../src/relay-roster-sync.js";
import type { RelayRosterDocument } from "@envoymesh/api";

function fakeReq(headers: Record<string, string>): IncomingMessage {
  return { headers } as IncomingMessage;
}

describe("relay-roster-http auth + put", () => {
  it("accepts join token via header or Bearer", () => {
    const token = "super-secret-join-token";
    expect(
      checkRelayRosterJoinToken(
        fakeReq({ [RELAY_ROSTER_JOIN_TOKEN_HEADER]: token }),
        token,
      ),
    ).toBe(true);
    expect(
      checkRelayRosterJoinToken(fakeReq({ authorization: `Bearer ${token}` }), token),
    ).toBe(true);
    expect(
      checkRelayRosterJoinToken(fakeReq({ authorization: "Bearer wrong-token-xx" }), token),
    ).toBe(false);
  });

  it("writes only when candidate issuedAt is newer", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roster-put-"));
    const path = join(dir, "relay-roster.json");
    const older: RelayRosterDocument = {
      v: 1,
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      fleetId: "test",
      maxActiveTargets: 4,
      relays: [
        {
          id: "cn",
          peerId: "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
          multiaddrs: [
            "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
          ],
          role: "hub",
          priority: 100,
          enabled: true,
        },
      ],
    };
    await writeRelayRosterDocument(path, older);
    const token = "super-secret-join-token";
    const newer = {
      ...older,
      issuedAt: "2026-06-01T00:00:00.000Z",
      relays: [
        ...older.relays,
        {
          id: "eu",
          peerId: "12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU",
          multiaddrs: [
            "/dns4/eu.example.com/tcp/4001/p2p/12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU",
          ],
          role: "regional" as const,
          priority: 50,
          enabled: true,
        },
      ],
    };
    const applied = await putRelayRosterDocument({
      path,
      bodyText: JSON.stringify(newer),
      joinTokenConfigured: token,
      req: fakeReq({ [RELAY_ROSTER_JOIN_TOKEN_HEADER]: token }),
    });
    expect(applied.ok && applied.applied).toBe(true);
    const loaded = await loadRelayRosterDocument(path);
    expect(loaded?.relays).toHaveLength(2);

    const stale = await putRelayRosterDocument({
      path,
      bodyText: JSON.stringify(older),
      joinTokenConfigured: token,
      req: fakeReq({ [RELAY_ROSTER_JOIN_TOKEN_HEADER]: token }),
    });
    expect(stale.ok && !stale.applied).toBe(true);
    expect((await loadRelayRosterDocument(path))?.relays).toHaveLength(2);
  });
});

describe("publishSelfOntoFleetRoster", () => {
  it("merges self and PUTs to peer URLs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "roster-pub-"));
    const path = join(dir, "relay-roster.json");
    const base: RelayRosterDocument = {
      v: 1,
      issuedAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
      fleetId: "test",
      maxActiveTargets: 4,
      relays: [
        {
          id: "cn",
          peerId: "12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
          multiaddrs: [
            "/ip4/47.93.11.212/tcp/4001/p2p/12D3KooWLNR4WYWHBswe8ux5zWsy6cuGywnYPJbdbaAbbpmJMjbo",
          ],
          role: "hub",
          priority: 100,
          enabled: true,
        },
      ],
    };
    writeFileSync(path, JSON.stringify(base));

    const puts: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (!init?.method || init.method === "GET") {
        return new Response(JSON.stringify(base), { status: 200 });
      }
      puts.push(u);
      return new Response(JSON.stringify({ ok: true, applied: true }), { status: 200 });
    }) as typeof fetch;

    const self = buildSelfRosterEntry({
      peerId: "12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU",
      publicAddrs: [
        "/dns4/eu.example.com/tcp/4001/p2p/12D3KooWEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEUEU",
      ],
      id: "eu-relay",
      region: "eu",
    });
    expect(self).not.toBeNull();
    const result = await publishSelfOntoFleetRoster({
      localPath: path,
      joinToken: "super-secret-join-token",
      selfEntry: self!,
      fetchImpl,
      log: () => undefined,
      warn: () => undefined,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.relays.some((r) => r.id === "eu-relay")).toBe(true);
      expect(result.pushedOk).toBeGreaterThan(0);
    }
    expect(puts.some((u) => u.includes("47.93.11.212"))).toBe(true);
    const disk = JSON.parse(readFileSync(path, "utf8")) as RelayRosterDocument;
    expect(disk.relays.some((r) => r.id === "eu-relay")).toBe(true);
  });
});
