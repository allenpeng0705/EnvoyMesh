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

import { createCallMutePayload, type CallIceCandidatePayload } from "@envoymesh/protocol";
import { webrtcCallTrace, webrtcCallWarn, shortCallId } from "./webrtc-call-trace.js";

// ------------------------------------------------------------------
// Types
// ------------------------------------------------------------------

export type CallTransportPath = "path1" | "path2";

export interface WebRtcCallTransportOptions {
  /** How to select the transport path (auto or explicit). */
  path: CallTransportPath;
  /** STUN/TURN servers for Path 2 (from relay config). */
  iceServers?: RTCIceServer[];
  /** Called when a remote audio track arrives — pipe to <audio>. */
  onRemoteStream: (stream: MediaStream) => void;
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
  /** End the call and clean up. */
  close(): void;
}

// ------------------------------------------------------------------
// Implementation
// ------------------------------------------------------------------

export function createWebRtcCallTransport(
  opts: WebRtcCallTransportOptions,
): WebRtcCallTransport {
  let pc: RTCPeerConnection | null = null;
  let localStream: MediaStream | null = null;
  let micAvailable = true;
  let isMuted = false;
  let path1Timer: ReturnType<typeof setTimeout> | null = null;
  let isClosed = false;
  let pendingRemoteCandidates: CallIceCandidatePayload["candidate"][] = [];

  const path1Timeout = opts.path1TimeoutMs ?? 5000;

  // --- helpers ---

  async function getIceConfig(): Promise<RTCConfiguration> {
    if (opts.path === "path1") {
      // Path 1: no ICE servers — ICE resolves against libp2p peer addresses
      return { iceServers: [] };
    }
    return {
      iceServers: opts.iceServers ?? [{ urls: "stun:stun.l.google.com:19302" }],
      iceTransportPolicy: "all",
    };
  }

  let remoteMediaStream: MediaStream | null = null;

  function handleRemoteTrack(event: RTCTrackEvent): void {
    const track = event.track;
    if (!track || track.kind !== "audio") return;

    if (event.streams?.[0]) {
      webrtcCallTrace("transport:remote-track", { via: "stream", trackId: track.id });
      opts.onRemoteStream(event.streams[0]);
      return;
    }

    if (!remoteMediaStream) {
      remoteMediaStream = new MediaStream();
    }
    if (!remoteMediaStream.getTracks().some((existing) => existing.id === track.id)) {
      remoteMediaStream.addTrack(track);
    }
    webrtcCallTrace("transport:remote-track", { via: "track", trackId: track.id });
    opts.onRemoteStream(remoteMediaStream);
  }

  async function attachLocalAudioForOffer(connection: RTCPeerConnection): Promise<void> {
    const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (!getUserMedia) {
      webrtcCallWarn("transport:mic-unavailable", {
        path: opts.path,
        error: "mediaDevices unavailable",
      });
      connection.addTransceiver("audio", { direction: "recvonly" });
      micAvailable = false;
      return;
    }

    try {
      localStream = await getUserMedia({ audio: true });
      localStream.getTracks().forEach((track) => {
        connection.addTrack(track, localStream!);
      });
      micAvailable = true;
    } catch (err) {
      webrtcCallWarn("transport:mic-unavailable", {
        path: opts.path,
        error: err instanceof Error ? err.message.slice(0, 80) : String(err),
      });
      connection.addTransceiver("audio", { direction: "recvonly" });
      micAvailable = false;
    }
  }

  async function attachLocalAudioForAnswer(connection: RTCPeerConnection): Promise<void> {
    const getUserMedia = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    const audioTransceivers = connection
      .getTransceivers()
      .filter(
        (transceiver) =>
          transceiver.receiver.track?.kind === "audio" ||
          transceiver.sender.track?.kind === "audio" ||
          transceiver.mid !== null,
      );
    const primaryAudioTransceiver =
      audioTransceivers.find((transceiver) => transceiver.receiver.track?.kind === "audio") ??
      audioTransceivers[0] ??
      null;

    if (!getUserMedia) {
      webrtcCallWarn("transport:mic-unavailable", {
        path: opts.path,
        error: "mediaDevices unavailable",
      });
      setRecvOnlyTransceivers(connection);
      micAvailable = false;
      return;
    }

    try {
      localStream = await getUserMedia({ audio: true });
      const track = localStream.getAudioTracks()[0];
      if (!track) throw new Error("no audio track from getUserMedia");

      if (primaryAudioTransceiver) {
        await primaryAudioTransceiver.sender.replaceTrack(track);
        primaryAudioTransceiver.direction = "sendrecv";
      } else {
        connection.addTrack(track, localStream);
      }
      micAvailable = true;
    } catch (err) {
      webrtcCallWarn("transport:mic-unavailable", {
        path: opts.path,
        error: err instanceof Error ? err.message.slice(0, 80) : String(err),
      });
      setRecvOnlyTransceivers(connection);
      micAvailable = false;
    }
  }

  function setRecvOnlyTransceivers(connection: RTCPeerConnection): void {
    for (const transceiver of connection.getTransceivers()) {
      if (transceiver.mid === null) continue;
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

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      if (pc) {
        webrtcCallTrace("transport:connection-state", { path: opts.path, state: pc.connectionState });
        opts.onConnectionStateChange(pc.connectionState);
      }
      if (pc?.connectionState === "connected" && path1Timer) {
        clearTimeout(path1Timer);
        path1Timer = null;
      }
    };

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

    await attachLocalAudioForOffer(pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    opts.onSdpGenerated(offer.sdp!, "offer");
    webrtcCallTrace("transport:offer-created", { path: opts.path, sdpLen: offer.sdp?.length ?? 0 });
    await flushPendingRemoteCandidates();

    return offer.sdp!;
  }

  async function startAnswer(remoteSdp: string): Promise<string> {
    if (isClosed) throw new Error("Transport closed");

    webrtcCallTrace("transport:start-answer", { path: opts.path, remoteSdpLen: remoteSdp.length });
    const config = await getIceConfig();
    pc = new RTCPeerConnection(config);

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      if (pc) {
        webrtcCallTrace("transport:connection-state", { path: opts.path, state: pc.connectionState });
        opts.onConnectionStateChange(pc.connectionState);
      }
    };

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
    await attachLocalAudioForAnswer(pc);

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    opts.onSdpGenerated(answer.sdp!, "answer");
    webrtcCallTrace("transport:answer-created", { path: opts.path, sdpLen: answer.sdp?.length ?? 0 });
    await flushPendingRemoteCandidates();

    return answer.sdp!;
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

  return {
    startOffer,
    startAnswer,
    applyRemoteAnswer,
    addIceCandidate,
    setMute,
    isMicAvailable,
    close: closeInternal,
  };
}
