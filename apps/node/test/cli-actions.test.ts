import { generateDeviceIdentity, generateOwnerIdentity } from "@envoymesh/identity";
import { createDeviceCertificate } from "@envoymesh/identity";
import type { NodeProfile } from "@envoymesh/local-store";
import {
  parseBondRequestPayload,
  parseChatMessagePayload,
  parseDevicePairRequestPayload,
  parseDiscoveryRequestPayload,
  parseKnowledgeQueryPayload,
  parseReportCreatePayload,
  parseTaskCancelPayload,
  parseTaskMandatePayload,
  parseTaskProposePayload,
} from "@envoymesh/protocol";
import { describe, expect, it } from "vitest";
import { buildOutboundCliEnvelopes } from "../src/cli-actions.js";

describe("cli actions", () => {
  it("builds a signed bond.request envelope", () => {
    const profile = testProfile();
    const [outbound] = buildOutboundCliEnvelopes(
      {
        profileDir: "./data/test",
        listen: [],
        enableMdns: false,
        bondRequestTarget: "peer-b",
        bondMessage: "Let's connect.",
        bondProof: "Met at the meetup.",
        bondRequestedLevel: "referred",
      },
      profile,
    );

    expect(outbound.target).toBe("peer-b");
    expect(outbound.envelope.intent).toBe("bond.request");
    const payload = parseBondRequestPayload(outbound.envelope.payload);
    expect(payload.requesterOwnerId).toBe(profile.owner.ownerId);
    expect(payload.message).toBe("Let's connect.");
    expect(payload.proofOfContext).toBe("Met at the meetup.");
    expect(payload.requestedLevel).toBe("referred");
  });

  it("builds a signed knowledge.query envelope", () => {
    const profile = testProfile();
    const [outbound] = buildOutboundCliEnvelopes(
      {
        profileDir: "./data/test",
        listen: [],
        enableMdns: false,
        knowledgeQueryTarget: "peer-b",
        knowledgeQueryText: "What is in the vault?",
        knowledgeQuerySensitivity: "friends",
      },
      profile,
    );

    expect(outbound.target).toBe("peer-b");
    expect(outbound.envelope.intent).toBe("knowledge.query");
    expect(outbound.envelope.signature).toBeTruthy();
    const payload = parseKnowledgeQueryPayload(outbound.envelope.payload);
    expect(payload.query).toBe("What is in the vault?");
    expect(payload.requestedSensitivity).toBe("friends");
  });

  it("builds a signed discovery.request envelope", () => {
    const profile = testProfile();
    const [outbound] = buildOutboundCliEnvelopes(
      {
        profileDir: "./data/test",
        listen: [],
        enableMdns: false,
        discoveryRequestTarget: "peer-discovery",
        discoveryTagHashes: ["hash:books"],
        discoveryCapabilities: ["task.execute"],
        discoveryMaxResults: 4,
      },
      profile,
    );

    expect(outbound.target).toBe("peer-discovery");
    expect(outbound.envelope.intent).toBe("discovery.request");
    const payload = parseDiscoveryRequestPayload(outbound.envelope.payload);
    expect(payload.requesterOwnerId).toBe(profile.owner.ownerId);
    expect(payload.requestedTagHashes).toEqual(["hash:books"]);
    expect(payload.requestedCapabilities).toEqual(["task.execute"]);
    expect(payload.maxResults).toBe(4);
  });

  it("builds a signed chat.message envelope", () => {
    const profile = testProfile();
    const [outbound] = buildOutboundCliEnvelopes(
      {
        profileDir: "./data/test",
        listen: [],
        enableMdns: false,
        chatTarget: "peer-chat",
        chatText: "hi from cli",
      },
      profile,
    );
    expect(outbound.envelope.intent).toBe("chat.message");
    const payload = parseChatMessagePayload(outbound.envelope.payload);
    expect(payload.senderOwnerId).toBe(profile.owner.ownerId);
    expect(payload.text).toBe("hi from cli");
  });

  it("builds a signed device.pair.request envelope", () => {
    const profile = testProfile();
    const [outbound] = buildOutboundCliEnvelopes(
      {
        profileDir: "./data/test",
        listen: [],
        enableMdns: false,
        pairRequestTarget: "peer-primary",
        pairNote: "Please pair this device.",
      },
      profile,
    );

    expect(outbound.envelope.intent).toBe("device.pair.request");
    const payload = parseDevicePairRequestPayload(outbound.envelope.payload);
    expect(payload.requesterOwnerId).toBe(profile.owner.ownerId);
    expect(payload.requesterDeviceId).toBe(profile.device.deviceId);
    expect(payload.requesterDevicePublicKeyPem).toBe(profile.device.publicKeyPem);
    expect(payload.note).toBe("Please pair this device.");
  });

  it("builds a signed task mandate envelope", () => {
    const profile = testProfile();
    const [outbound] = buildOutboundCliEnvelopes(
      {
        profileDir: "./data/test",
        listen: [],
        enableMdns: false,
        taskMandateTarget: "peer-b",
        taskId: "task-1",
        mandateId: "mandate-1",
        taskIntent: "find.book",
        objective: "Find a distributed systems book.",
      },
      profile,
    );

    expect(outbound.target).toBe("peer-b");
    expect(outbound.envelope.intent).toBe("task.mandate");
    expect(outbound.envelope.signature).toBeTruthy();
    const payload = parseTaskMandatePayload(outbound.envelope.payload);
    expect(payload.taskId).toBe("task-1");
    expect(payload.mandate.mandateId).toBe("mandate-1");
    expect(payload.mandate.ownerId).toBe(profile.owner.ownerId);
  });

  it("builds task proposal, cancellation, and report envelopes", () => {
    const profile = testProfile();
    const outbounds = buildOutboundCliEnvelopes(
      {
        profileDir: "./data/test",
        listen: [],
        enableMdns: false,
        taskProposeTarget: "peer-b",
        taskCancelTarget: "peer-b",
        reportCreateTarget: "peer-b",
        taskId: "task-1",
        mandateId: "mandate-1",
        taskIntent: "find.book",
        objective: "Find a distributed systems book.",
        requestedResult: "One recommendation.",
        reason: "Stop the task.",
        reportSummary: "Task is done.",
        reportMode: "brief",
      },
      profile,
    );

    expect(outbounds.map((outbound) => outbound.envelope.intent)).toEqual([
      "task.propose",
      "task.cancel",
      "report.create",
    ]);
    expect(parseTaskProposePayload(outbounds[0].envelope.payload)).toMatchObject({
      taskId: "task-1",
      mandateId: "mandate-1",
      objective: "Find a distributed systems book.",
      requestedResult: "One recommendation.",
    });
    expect(parseTaskCancelPayload(outbounds[1].envelope.payload)).toMatchObject({
      taskId: "task-1",
      mandateId: "mandate-1",
      reason: "Stop the task.",
    });
    expect(parseReportCreatePayload(outbounds[2].envelope.payload).report).toMatchObject({
      taskId: "task-1",
      mandateId: "mandate-1",
      summary: "Task is done.",
      mode: "brief",
    });
  });

  it("requires task id for A2A task commands", () => {
    expect(() =>
      buildOutboundCliEnvelopes(
        {
          profileDir: "./data/test",
          listen: [],
          enableMdns: false,
          taskCancelTarget: "peer-b",
        },
        testProfile(),
      ),
    ).toThrow("Missing --task-id");
  });
});

function testProfile(): NodeProfile {
  const owner = generateOwnerIdentity();
  const device = generateDeviceIdentity();

  return {
    owner,
    device,
    deviceCertificate: createDeviceCertificate({
      owner,
      device,
      deviceProfile: "primary",
      capabilities: ["mesh.listen", "message.send", "task.execute"],
    }),
  };
}
