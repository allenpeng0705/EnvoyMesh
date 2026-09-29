/**
 * Regression: phone hang-up (or ws.close) during dialProtocol must free the
 * per-target proxy slot. Before the fix, the close listener was registered
 * only after dial + handshake, so a single phone's retry storm filled
 * MAX_PROXY_CONNS_PER_TARGET and stayed at 10/10 until relay restart.
 */

import { describe, expect, it, vi } from "vitest";
import {
  armProxySlotRelease,
  ProxyConnectionSlots,
  type ProxySlotSocket,
} from "../src/proxy-connection-slots.js";

function sock(readyState = 1): ProxySlotSocket {
  return { readyState };
}

describe("ProxyConnectionSlots", () => {
  it("releases a slot when close fires before dial would finish", () => {
    const slots = new ProxyConnectionSlots({ maxTotal: 50, maxPerTarget: 10 });
    const home = "12D3KooWHomePeerId";
    const phone = sock();

    expect(slots.tryAcquire(phone, home)).toEqual({ ok: true });
    expect(slots.totalConnections).toBe(1);
    expect(slots.connectionsFor(home)).toBe(1);

    // Simulate mid-dial hang-up: close listener runs while dial is still pending.
    expect(slots.release(phone)).toBe(true);
    expect(slots.holds(phone)).toBe(false);
    expect(slots.totalConnections).toBe(0);
    expect(slots.connectionsFor(home)).toBe(0);

    // Same phone (or a retry) can acquire again — not stuck at the cap.
    expect(slots.tryAcquire(sock(), home)).toEqual({ ok: true });
    expect(slots.totalConnections).toBe(1);
  });

  it("release is idempotent (close + error path)", () => {
    const slots = new ProxyConnectionSlots({ maxTotal: 50, maxPerTarget: 10 });
    const phone = sock();
    slots.tryAcquire(phone, "home");
    expect(slots.release(phone)).toBe(true);
    expect(slots.release(phone)).toBe(false);
    expect(slots.totalConnections).toBe(0);
  });

  it("rejects at per-target cap until a dead socket is pruned", () => {
    const CLOSED = 3;
    const slots = new ProxyConnectionSlots({
      maxTotal: 50,
      maxPerTarget: 2,
      closedReadyState: CLOSED,
    });
    const home = "home";
    const a = sock(1);
    const b = sock(1);
    expect(slots.tryAcquire(a, home).ok).toBe(true);
    expect(slots.tryAcquire(b, home).ok).toBe(true);
    expect(slots.tryAcquire(sock(), home)).toEqual({ ok: false, reason: "per-target" });

    // Missed close listener: socket is CLOSED but still in the set.
    (b as { readyState: number }).readyState = CLOSED;
    expect(slots.tryAcquire(sock(), home).ok).toBe(true);
    expect(slots.totalConnections).toBe(2);
    expect(slots.holds(b)).toBe(false);
  });

  it("rejects at total cap", () => {
    const slots = new ProxyConnectionSlots({ maxTotal: 2, maxPerTarget: 10 });
    expect(slots.tryAcquire(sock(), "a").ok).toBe(true);
    expect(slots.tryAcquire(sock(), "b").ok).toBe(true);
    expect(slots.tryAcquire(sock(), "c")).toEqual({ ok: false, reason: "full" });
  });

  it("refuses sockets that are already CLOSED/CLOSING", () => {
    const slots = new ProxyConnectionSlots({ maxTotal: 50, maxPerTarget: 10 });
    expect(slots.tryAcquire(sock(3), "home")).toEqual({ ok: false, reason: "gone" });
    expect(slots.tryAcquire(sock(2), "home")).toEqual({ ok: false, reason: "gone" });
    expect(slots.totalConnections).toBe(0);
  });
});

describe("armProxySlotRelease", () => {
  it("sync-releases when close already fired before the listener was attached", () => {
    const slots = new ProxyConnectionSlots({ maxTotal: 50, maxPerTarget: 10 });
    const listeners: Array<() => void> = [];
    const phone: ProxySlotSocket = {
      readyState: 1,
      on(event, listener) {
        if (event === "close") listeners.push(listener);
      },
    };
    expect(slots.tryAcquire(phone, "home").ok).toBe(true);

    // Race: close fires (and readyState flips) before armProxySlotRelease runs.
    phone.readyState = 3;
    // Listener was never invoked because it was not registered yet.
    expect(listeners).toHaveLength(0);

    const release = vi.fn(() => {
      slots.release(phone);
    });
    armProxySlotRelease(phone, release);
    expect(release).toHaveBeenCalledTimes(1);
    expect(slots.totalConnections).toBe(0);

    // Later close emission must not double-release.
    for (const l of listeners) l();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases on a later close event when the socket is still open", () => {
    const slots = new ProxyConnectionSlots({ maxTotal: 50, maxPerTarget: 10 });
    const listeners: Array<() => void> = [];
    const phone: ProxySlotSocket = {
      readyState: 1,
      on(event, listener) {
        if (event === "close") listeners.push(listener);
      },
    };
    slots.tryAcquire(phone, "home");
    const release = vi.fn(() => {
      slots.release(phone);
    });
    armProxySlotRelease(phone, release);
    expect(release).not.toHaveBeenCalled();
    phone.readyState = 3;
    for (const l of listeners) l();
    expect(release).toHaveBeenCalledTimes(1);
    expect(slots.totalConnections).toBe(0);
  });
});
