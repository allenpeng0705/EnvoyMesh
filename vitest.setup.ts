/**
 * Vitest global setup.
 *
 * Patches `os.networkInterfaces()` to return a stub loopback interface when
 * the host environment has none (e.g. some sandboxes). Without this, libp2p's
 * `multicast-dns` throws `uv_interface_addresses returned Unknown system
 * error 1`, which then cascades into hundreds of false-positive test
 * failures across the whole suite.
 *
 * This is environment-only — it does not change behavior in normal dev / CI
 * environments where real interfaces exist.
 */
import { vi } from "vitest";
import os from "node:os";

const realNetworkInterfaces = os.networkInterfaces.bind(os);

interface FakeInterface {
  address: string;
  netmask: string;
  family: "IPv4";
  mac: string;
  internal: boolean;
  cidr: string | null;
}

const FAKE_LOOPBACK: FakeInterface = {
  address: "127.0.0.1",
  netmask: "255.0.0.0",
  family: "IPv4",
  mac: "00:00:00:00:00:00",
  internal: true,
  cidr: "127.0.0.1/8",
};

let patched = false;

export function patchOsNetworkInterfaces(): void {
  if (patched) return;
  patched = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (os as any).networkInterfaces = function patchedNetworkInterfaces() {
    try {
      const real = realNetworkInterfaces();
      if (real && Object.keys(real).length > 0) return real;
    } catch {
      // fall through to stub
    }
    return { lo: [FAKE_LOOPBACK] };
  };
}

patchOsNetworkInterfaces();

// --------------------------------------------------------------------------
// WebRTC globals for jsdom environment
// --------------------------------------------------------------------------

// Mock RTCSessionDescription
class MockRTCSessionDescription {
  type: RTCSdpType;
  sdp: string;
  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type ?? "offer";
    this.sdp = init.sdp ?? "";
  }
}

// Mock RTCIceCandidate
class MockRTCIceCandidate {
  constructor(_init: RTCIceCandidateInit) {}
}

// Mock RTCPeerConnection
// eslint-disable-next-line @typescript-eslint/no-explicit-any
class MockRTCPeerConnection {
  createOffer: ReturnType<typeof vi.fn>;
  setLocalDescription: ReturnType<typeof vi.fn>;
  setRemoteDescription: ReturnType<typeof vi.fn>;
  createAnswer: ReturnType<typeof vi.fn>;
  addTrack: ReturnType<typeof vi.fn>;
  addTransceiver: ReturnType<typeof vi.fn>;
  getTransceivers: () => Array<{
    mid: string | null;
    direction: RTCRtpTransceiverDirection;
    sender: { replaceTrack: ReturnType<typeof vi.fn>; track: MediaStreamTrack | null };
    receiver: { track: { kind: string } | null };
  }>;
  addIceCandidate: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  onconnectionstatechange: ((() => void) | null) | null;
  oniceconnectionstatechange: ((() => void) | null) | null;
  onicecandidate: ((event: { candidate: RTCIceCandidate | null }) => void) | null;
  ontrack: ((event: { streams: [MediaStream] }) => void) | null;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;

  constructor(_config?: RTCConfiguration) {
    this.createOffer = vi.fn().mockResolvedValue({ sdp: "mock-offer", type: "offer" });
    this.setLocalDescription = vi.fn().mockResolvedValue(undefined);
    this.setRemoteDescription = vi.fn().mockResolvedValue(undefined);
    this.createAnswer = vi.fn().mockResolvedValue({ sdp: "mock-answer", type: "answer" });
    this.addTrack = vi.fn();
    this.addTransceiver = vi.fn();
    this.getTransceivers = () => [
      {
        mid: "0",
        direction: "sendrecv",
        sender: { replaceTrack: vi.fn().mockResolvedValue(undefined), track: null },
        receiver: { track: { kind: "audio" } },
      },
    ];
    this.addIceCandidate = vi.fn().mockResolvedValue(undefined);
    this.close = vi.fn();
    this.onconnectionstatechange = null;
    this.oniceconnectionstatechange = null;
    this.onicecandidate = null;
    this.ontrack = null;
    this.connectionState = "new";
    this.iceConnectionState = "new";
  }

  static generateCertificate(_keygenAlgorithm: AlgorithmIdentifier): Promise<RTCCertificate> {
    return Promise.resolve({} as RTCCertificate);
  }
}

// Mock MediaStream
class MockMediaStream {
  private tracks: Array<{ id?: string; kind: string; enabled: boolean; stop: ReturnType<typeof vi.fn> }>;

  constructor(
    initialTracks?: Array<{ id?: string; kind: string; enabled?: boolean; stop?: ReturnType<typeof vi.fn> }>,
  ) {
    this.tracks = [];
    if (initialTracks) {
      for (const track of initialTracks) {
        this.addTrack(track);
      }
    }
  }

  addTrack(track: { id?: string; kind: string; enabled?: boolean; stop?: ReturnType<typeof vi.fn> }) {
    this.tracks.push({
      kind: track.kind,
      id: track.id,
      enabled: track.enabled ?? true,
      stop: track.stop ?? vi.fn(),
    });
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
}

// Mock getUserMedia
const mockGetUserMedia = vi.fn().mockImplementation(async () => {
  const stream = new MockMediaStream();
  stream.addTrack({ kind: "audio", id: "mic", enabled: true, stop: vi.fn() });
  return stream;
});

// Set up globals globally (before any module imports them)
(globalThis as any).RTCSessionDescription = MockRTCSessionDescription;
(globalThis as any).RTCIceCandidate = MockRTCIceCandidate;
(globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
(globalThis as any).MediaStream = MockMediaStream;

// Only override getUserMedia, preserve everything else on navigator
if (!(globalThis as any).navigator) {
  (globalThis as any).navigator = {};
}
if (!(globalThis as any).navigator.mediaDevices) {
  (globalThis as any).navigator.mediaDevices = {};
}
(globalThis as any).navigator.mediaDevices.getUserMedia = mockGetUserMedia;
