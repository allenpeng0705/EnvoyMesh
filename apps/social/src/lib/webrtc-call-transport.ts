/**
 * WebRtcCallTransport — Phase 38 WebRTC media transport.
 *
 * Manages an RTCPeerConnection for voice calls with two paths:
 * - Path 1: libp2p data channel (no STUN/TURN, LAN/direct P2P)
 * - Path 2: standard ICE with STUN/TURN fallback (cross-NAT)
 *
 * This module is designed for the Social UI browser context. It
 * accesses `RTCPeerConnection`, `getUserMedia`, and `MediaStream`
 * APIs which are only available in the browser.
 */

import { createCallMutePayload, type CallIceCandidatePayload, type CallMediaType } from "@envoymesh/protocol";
import { webrtcCallTrace, webrtcCallWarn, shortCallId } from "./webrtc-call-trace.js";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type CallTransportPath = "path1" | "path2";

export interface WebRtcCallTransportOptions {
  /** How to select the transport path (auto or explicit). */
  path: CallTransportPath;
  /** Audio-only or audio+video capture. */
  mediaType?: CallMediaType;
  /** STUN/TURN servers for Path 2 (from relay config). */
  iceServers?: RTCIceServer[];
  /** Called when a remote media track arrives — pipe to <audio> / <video>. */
  onRemoteStream: (stream: MediaStream) => void;
  /** Called when local capture stream is ready (for self-view preview). */
  onLocalStream?: (stream: MediaStream) => void;
  /** Called when connection state changes. */
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  /** Called with SDP to send via call.invite or call.accept. */
  onSdpGenerated: (sdp: string, type: "offer" | "answer") => void;
  /** Called when a local ICE candidate is generated (Path 2 trickle). */
  onIceCandidate: (candidate: CallIceCandidatePayload["candidate"]) => void;
  /** Called when mute payload should be sent. */
  onMutePayload: (payload: ReturnType<typeof createCallMutePayload>) => void;
  /** Max time to wait for Path 1 connection before falling back (ms). */
  path1TimeoutMs?: number;
  /**
   * Called when Path 1 (direct/LAN) times out. The caller should:
   * 1. Generate a new SDP offer with iceServers included (Path 2)
   * 2. Send it to the peer via a new call.invite
   *
   * If not provided, the transport logs the timeout but does not
   * automatically restart — the call may fail silently.
   */
  onPath1Timeout?: () => void;
}

export interface WebRtcCallTransport {
  /** Start as offerer (caller). */
  startOffer(): Promise<string>;
  /** Start as answerer (callee) with remote SDP. */
  startAnswer(remoteSdp: string): Promise<string>;
  /** Apply remote answer SDP on the caller side after call.accept. */
  applyRemoteAnswer(remoteSdp: string): Promise<void>;
  /** Apply a remote ICE candidate (Path 2 trickle). */
  addIceCandidate(candidate: CallIceCandidatePayload["candidate"]): Promise<void>;
  /** Mute/unmute local audio track. */
  setMute(muted: boolean, callId?: string): void;
  /** Whether local microphone capture is available for this session. */
  isMicAvailable(): boolean;
  /** Whether local camera capture is available (video calls only). */
  isCameraAvailable(): boolean;
  /** Local capture stream, if any. */
  getLocalStream(): MediaStream | null;
  /** End the call and clean up. */
  close(): void;
}

// ------------------------------------------------------------------
// Implementation
// ------------------------------------------------------------------

/** Max wait for local ICE gathering before shipping SDP (ms).
 * Kept short: blocked public STUN (e.g. Google from CN) never completes
 * gathering, and waiting here delays `call.invite` so the callee never rings.
 * Remaining candidates trickle via `call.ice-candidate`.
 */
const ICE_GATHERING_TIMEOUT_MS = 300;

function countSdpCandidates(sdp: string): number {
  return sdp.split("\n").filter((line) => line.startsWith("a=candidate:")).length;
}

function findMediaTransceiver(
  connection: RTCPeerConnection,
  kind: "audio" | "video",
): RTCRtpTransceiver | null {
  const transceivers = connection.getTransceivers();
  return (
    transceivers.find((transceiver) => transceiver.receiver.track?.kind === kind) ??
    transceivers.find((transceiver) => transceiver.sender.track?.kind === kind) ??
    null
  );
}

function videoCaptureConstraints(): MediaTrackConstraints {
  return { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } };
}

async function waitForIceGatheringComplete(
  connection: RTCPeerConnection,
  timeoutMs = ICE_GATHERING_TIMEOUT_MS,
): Promise<void> {
  if (connection.iceGatheringState === "complete") return;

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      connection.removeEventListener("icegatheringstatechange", onChange);
      clearTimeout(timer);
      resolve();
    };
    const onChange = () => {
      if (connection.iceGatheringState === "complete") finish();
    };
    connection.addEventListener("icegatheringstatechange", onChange);
    const timer = setTimeout(finish, timeoutMs);
  });
}

async function readLocalSdp(connection: RTCPeerConnection): Promise<string> {
  // Brief window for host candidates only — do not block on STUN/TURN.
  await waitForIceGatheringComplete(connection);
  const sdp = connection.localDescription?.sdp;
  if (!sdp) throw new Error("missing local SDP after ICE gathering");
  return sdp;
}

export function createWebRtcCallTransport(
  opts: WebRtcCallTransportOptions,
): WebRtcCallTransport {
  let pc: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let micAvailable = true;
  let cameraAvailable = true;
  let isMuted = false;
  let path1Timer: ReturnType<typeof setTimeout> | null = null;
  let isClosed = false;
  let pendingRemoteCandidates: CallIceCandidatePayload["candidate"][] = [];

  const path1Timeout = opts.path1TimeoutMs ?? 5000;
  const mediaType = opts.mediaType ?? "audio";
  const wantsVideo = mediaType === "video";

  // --- helpers ---

  function notifyLocalStream(): void {
    if (localStream && opts.onLocalStream) {
      opts.onLocalStream(localStream);
    }
  }

  async function getIceConfig(): Promise<RTCConfiguration> {
    if (opts.path === "path1") {
      // Path 1: no ICE servers — ICE resolves against libp2p peer addresses
      return { iceServers: [] };
    }
    return {
      iceServers: opts.iceServers ?? [{ urls: "stun:stun.miwifi.com:3478" }],
      iceTransportPolicy: "all",
    };
  }

  let remoteMediaStream: MediaStream | null = null;

  function handleRemoteTrack(event: RTCTrackEvent): void {
    const track = event.track;
    if (!track || (track.kind !== "audio" && track.kind !== "video")) return;

    if (event.streams?.[0]) {
      webrtcCallTrace("transport:remote-track", { via: "stream", kind: track.kind, trackId: track.id });
      opts.onRemoteStream(event.streams[0]);
      return;
    }

    if (!remoteMediaStream) {
      remoteMediaStream = new MediaStream();
    }
    if (!remoteMediaStream.getTracks().some((existing) => existing.id === track.id)) {
      remoteMediaStream.addTrack(track);
    }
    webrtcCallTrace("transport:remote-track", { via: "track", kind: track.kind, trackId: track.id });
    opts.onRemoteStream(remoteMediaStream);
  }

  async function attachLocalMediaForOffer(connection: RTCPeerConnection): Promise<void> {
    const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!getUserMedia) {
      webrtcCallWarn("transport:mic-unavailable", {
        path: opts.path,
        error: "mediaDevices unavailable",
      });
      connection.addTransceiver("audio", { direction: "recvonly" });
      if (wantsVideo) {
        connection.addTransceiver("video", { direction: "recvonly" });
        cameraAvailable = false;
      }
      micAvailable = false;
      return;
    }

    const constraints: MediaStreamConstraints = { audio: true };
    if (wantsVideo) {
      constraints.video = videoCaptureConstraints();
    }

    try {
      localStream = await getUserMedia(constraints);
      localStream.getTracks().forEach((track) => {
        connection.addTrack(track, localStream!);
      });
      micAvailable = localStream.getAudioTracks().length > 0;
      cameraAvailable = !wantsVideo || localStream.getVideoTracks().length > 0;
      notifyLocalStream();
    } catch (err) {
      if (wantsVideo) {
        try {
          localStream = await getUserMedia({ audio: true });
          localStream.getTracks().forEach((track) => {
            connection.addTrack(track, localStream!);
          });
          connection.addTransceiver("video", { direction: "recvonly" });
          micAvailable = true;
          cameraAvailable = false;
          notifyLocalStream();
          return;
        } catch {
          /* fall through to listen-only */
        }
      }
      webrtcCallWarn("transport:mic-unavailable", {
        path: opts.path,
        error: err instanceof Error ? err.message.slice(0, 80) : String(err),
      });
      connection.addTransceiver("audio", { direction: "recvonly" });
      if (wantsVideo) {
        connection.addTransceiver("video", { direction: "recvonly" });
        cameraAvailable = false;
      }
      micAvailable = false;
    }
  }

  async function attachLocalMediaForAnswer(connection: RTCPeerConnection): Promise<void> {
    const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    const audioTransceiver = findMediaTransceiver(connection, "audio");
    const videoTransceiver = wantsVideo ? findMediaTransceiver(connection, "video") : null;

    if (!getUserMedia) {
      webrtcCallWarn("transport:mic-unavailable", {
        path: opts.path,
        error: "mediaDevices unavailable",
      });
      setRecvOnlyTransceivers(connection, "audio");
      if (videoTransceiver) {
        setRecvOnlyTransceivers(connection, "video");
        cameraAvailable = false;
      }
      micAvailable = false;
      return;
    }

    const constraints: MediaStreamConstraints = { audio: true };
    if (wantsVideo && videoTransceiver) {
      constraints.video = videoCaptureConstraints();
    }

    try {
      localStream = await getUserMedia(constraints);
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack && audioTransceiver) {
        await audioTransceiver.sender.replaceTrack(audioTrack);
        audioTransceiver.direction = "sendrecv";
        micAvailable = true;
      } else if (audioTransceiver) {
        setRecvOnlyTransceivers(connection, "audio");
        micAvailable = false;
      }

      if (wantsVideo && videoTransceiver) {
        const videoTrack = localStream.getVideoTracks()[0];
        if (videoTrack) {
          await videoTransceiver.sender.replaceTrack(videoTrack);
          videoTransceiver.direction = "sendrecv";
          cameraAvailable = true;
        } else {
          setRecvOnlyTransceivers(connection, "video");
          cameraAvailable = false;
        }
      }

      notifyLocalStream();
    } catch (err) {
      if (wantsVideo && videoTransceiver) {
        try {
          localStream = await getUserMedia({ audio: true });
          const audioTrack = localStream.getAudioTracks()[0];
          if (audioTrack && audioTransceiver) {
            await audioTransceiver.sender.replaceTrack(audioTrack);
            audioTransceiver.direction = "sendrecv";
            micAvailable = true;
          }
          setRecvOnlyTransceivers(connection, "video");
          cameraAvailable = false;
          notifyLocalStream();
          return;
        } catch {
          /* fall through */
        }
      }
      webrtcCallWarn("transport:mic-unavailable", {
        path: opts.path,
        error: err instanceof Error ? err.message.slice(0, 80) : String(err),
      });
      setRecvOnlyTransceivers(connection, "audio");
      if (videoTransceiver) {
        setRecvOnlyTransceivers(connection, "video");
        cameraAvailable = false;
      }
      micAvailable = false;
    }
  }

  function setRecvOnlyTransceivers(connection: RTCPeerConnection, kind?: "audio" | "video"): void {
    for (const transceiver of connection.getTransceivers()) {
      if (transceiver.mid === null) continue;
      const trackKind = transceiver.receiver.track?.kind ?? transceiver.sender.track?.kind;
      if (kind && trackKind !== kind) continue;
      void transceiver.sender.replaceTrack(null);
      transceiver.direction = "recvonly";
    }
  }

  function closeInternal(): void {
    if (isClosed) return;
    isClosed = true;

    if (path1Timer) {
      clearTimeout(path1Timer);
      path1Timer = null;
    }

    // Stop all tracks
    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
      localStream = null;
    }

    micAvailable = true;
    cameraAvailable = true;
    remoteMediaStream = null;
    pendingRemoteCandidates = [];

    // Close peer connection
    if (pc) {
      pc.close();
      pc = null;
    }
  }

  // --- public API ---

  async function startOffer(): Promise<string> {
    if (isClosed) throw new Error("Transport closed");

    webrtcCallTrace("transport:start-offer", { path: opts.path });
    const config = await getIceConfig();
    pc = new RTCPeerConnection(config);

    // Path 1 timeout: if no connection within path1TimeoutMs, notify caller
    if (opts.path === "path1") {
      path1Timer = setTimeout(() => {
        webrtcCallWarn("transport:path1-timeout", { timeoutMs: path1Timeout });
        console.log("[webrtc-call-transport] Path 1 timed out — notifying caller to retry with Path 2");
        opts.onPath1Timeout?.();
      }, path1Timeout);
    }

    // Connection state monitoring (connectionState can lag behind ICE on some browsers)
    const reportConnectionState = () => {
      if (!pc) return;
      const ice = pc.iceConnectionState;
      if (ice === "connected" || ice === "completed") {
        webrtcCallTrace("transport:connection-state", { path: opts.path, state: "connected", via: "ice" });
        opts.onConnectionStateChange("connected");
        return;
      }
      if (ice === "failed") {
        webrtcCallTrace("transport:connection-state", { path: opts.path, state: "failed", via: "ice" });
        opts.onConnectionStateChange("failed");
        return;
      }
      if (ice === "disconnected") {
        webrtcCallTrace("transport:connection-state", { path: opts.path, state: "disconnected", via: "ice" });
        opts.onConnectionStateChange("disconnected");
        return;
      }
      webrtcCallTrace("transport:connection-state", { path: opts.path, state: pc.connectionState, via: "pc" });
      opts.onConnectionStateChange(pc.connectionState);
    };

    pc.onconnectionstatechange = () => {
      if (pc?.connectionState === "connected" && path1Timer) {
        clearTimeout(path1Timer);
        path1Timer = null;
      }
      reportConnectionState();
    };

    pc.oniceconnectionstatechange = reportConnectionState;

    // ICE candidate handler (Path 2 trickle)
    pc.onicecandidate = (event) => {
      if (event.candidate && opts.path === "path2") {
        opts.onIceCandidate({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid ?? null,
          sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
          usernameFragment: (event.candidate as any).usernameFragment ?? null,
        });
      }
    };

    // Remote track handler
    pc.ontrack = handleRemoteTrack;

    await attachLocalMediaForOffer(pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    const sdpWithCandidates = await readLocalSdp(pc);
    opts.onSdpGenerated(sdpWithCandidates, "offer");
    webrtcCallTrace("transport:offer-created", {
      path: opts.path,
      sdpLen: sdpWithCandidates.length,
      candidates: countSdpCandidates(sdpWithCandidates),
    });
    await flushPendingRemoteCandidates();

    return sdpWithCandidates;
  }

  async function startAnswer(remoteSdp: string): Promise<string> {
    if (isClosed) throw new Error("Transport closed");

    webrtcCallTrace("transport:start-answer", { path: opts.path, remoteSdpLen: remoteSdp.length });
    const config = await getIceConfig();
    pc = new RTCPeerConnection(config);

    // Connection state monitoring (connectionState can lag behind ICE on some browsers)
    const reportConnectionState = () => {
      if (!pc) return;
      const ice = pc.iceConnectionState;
      if (ice === "connected" || ice === "completed") {
        webrtcCallTrace("transport:connection-state", { path: opts.path, state: "connected", via: "ice" });
        opts.onConnectionStateChange("connected");
        return;
      }
      if (ice === "failed") {
        webrtcCallTrace("transport:connection-state", { path: opts.path, state: "failed", via: "ice" });
        opts.onConnectionStateChange("failed");
        return;
      }
      if (ice === "disconnected") {
        webrtcCallTrace("transport:connection-state", { path: opts.path, state: "disconnected", via: "ice" });
        opts.onConnectionStateChange("disconnected");
        return;
      }
      webrtcCallTrace("transport:connection-state", { path: opts.path, state: pc.connectionState, via: "pc" });
      opts.onConnectionStateChange(pc.connectionState);
    };

    pc.onconnectionstatechange = reportConnectionState;
    pc.oniceconnectionstatechange = reportConnectionState;

    // ICE candidate handler (Path 2 trickle)
    pc.onicecandidate = (event) => {
      if (event.candidate && opts.path === "path2") {
        opts.onIceCandidate({
          candidate: event.candidate.candidate,
          sdpMid: event.candidate.sdpMid ?? null,
          sdpMLineIndex: event.candidate.sdpMLineIndex ?? null,
          usernameFragment: (event.candidate as any).usernameFragment ?? null,
        });
      }
    };

    // Remote track handler
    pc.ontrack = handleRemoteTrack;

    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: remoteSdp }));
    await attachLocalMediaForAnswer(pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    const sdpWithCandidates = await readLocalSdp(pc);
    opts.onSdpGenerated(sdpWithCandidates, "answer");
    webrtcCallTrace("transport:answer-created", {
      path: opts.path,
      sdpLen: sdpWithCandidates.length,
      candidates: countSdpCandidates(sdpWithCandidates),
    });
    await flushPendingRemoteCandidates();

    return sdpWithCandidates;
  }

  async function applyRemoteAnswer(remoteSdp: string): Promise<void> {
    if (!pc || isClosed) throw new Error("Transport not ready for remote answer");
    webrtcCallTrace("transport:apply-remote-answer", { sdpLen: remoteSdp.length });
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: remoteSdp }));
    await flushPendingRemoteCandidates();
  }

  async function addIceCandidateNow(
    candidate: CallIceCandidatePayload["candidate"],
  ): Promise<void> {
    if (!pc || isClosed) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate({
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? undefined,
        sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
      }));
      webrtcCallTrace("transport:ice-candidate-added", {
        typ: candidate.candidate.split(" typ ")[1]?.split(" ")[0] ?? "?",
      });
    } catch (err) {
      webrtcCallWarn("transport:ice-candidate-failed", {
        error: err instanceof Error ? err.message.slice(0, 80) : String(err),
      });
      console.warn("[webrtc-call-transport] addIceCandidate failed:", err);
    }
  }

  async function flushPendingRemoteCandidates(): Promise<void> {
    if (!pc || isClosed || pendingRemoteCandidates.length === 0) return;
    const queued = pendingRemoteCandidates.splice(0);
    webrtcCallTrace("transport:ice-candidate-flush", { count: queued.length });
    for (const candidate of queued) {
      await addIceCandidateNow(candidate);
    }
  }

  async function addIceCandidate(candidate: CallIceCandidatePayload["candidate"]): Promise<void> {
    if (!pc || isClosed) return;
    if (!pc.remoteDescription?.type) {
      pendingRemoteCandidates.push(candidate);
      webrtcCallTrace("transport:ice-candidate-queued", {
        typ: candidate.candidate.split(" typ ")[1]?.split(" ")[0] ?? "?",
        pending: pendingRemoteCandidates.length,
      });
      return;
    }
    await addIceCandidateNow(candidate);
  }

  function setMute(muted: boolean, callId?: string): void {
    if (!micAvailable) return;
    isMuted = muted;
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !muted;
      });
    }
    opts.onMutePayload(createCallMutePayload({
      callId: callId ?? "00000000-0000-0000-0000-000000000000",
      muted,
    }));
  }

  function isMicAvailable(): boolean {
    return micAvailable;
  }

  function isCameraAvailable(): boolean {
    return !wantsVideo || cameraAvailable;
  }

  function getLocalStream(): MediaStream | null {
    return localStream;
  }

  return {
    startOffer,
    startAnswer,
    applyRemoteAnswer,
    addIceCandidate,
    setMute,
    isMicAvailable,
    isCameraAvailable,
    getLocalStream,
    close: closeInternal,
  };
}
