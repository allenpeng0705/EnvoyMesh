import { describe, expect, it } from "vitest";
import {
  createSocialProxySession,
  transitionSocialProxySession,
} from "@envoymesh/api";

describe("transitionSocialProxySession", () => {
  it("moves discovered → syncing on RUN_PASS", () => {
    const session = createSocialProxySession({ postureRef: "m1" });
    const { session: next, changed } = transitionSocialProxySession(session, "RUN_PASS");
    expect(changed).toBe(true);
    expect(next.status).toBe("syncing");
  });

  it("requires owner commitment before hello", () => {
    let session = createSocialProxySession({ postureRef: "m1" });
    session = transitionSocialProxySession(session, "RUN_PASS").session;
    session = transitionSocialProxySession(session, "SYNC_OK").session;
    session = { ...session, status: "commitment_ready" };
    const blocked = transitionSocialProxySession(session, "SEND_HELLO", {
      autoHello: true,
      helloRequiresApproval: false,
      hasOwnerCommitmentRef: false,
    });
    expect(blocked.changed).toBe(false);
    const ok = transitionSocialProxySession(session, "SEND_HELLO", {
      autoHello: true,
      helloRequiresApproval: false,
      hasOwnerCommitmentRef: true,
    });
    expect(ok.session.status).toBe("hello_sent");
  });

  it("cancels on kill switch", () => {
    const session = createSocialProxySession({ postureRef: "m1" });
    const { session: next } = transitionSocialProxySession(session, "KILL_SWITCH");
    expect(next.status).toBe("cancelled");
  });

  it("moves awaiting_peer → intro_proposed on PEER_OWNER_READY", () => {
    let session = createSocialProxySession({ postureRef: "m1" });
    session = { ...session, status: "awaiting_peer" };
    const { session: next, changed } = transitionSocialProxySession(session, "PEER_OWNER_READY");
    expect(changed).toBe(true);
    expect(next.status).toBe("intro_proposed");
  });
});
