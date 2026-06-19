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
  /** Apply a remote ICE candidate (Path 2 trickle). */
  addIceCandidate(candidate: CallIceCandidatePayload["candidate"]): Promise<void>;
  /** Mute/unmute local audio track. */
  setMute(muted: boolean, callId?: string): void;
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
  let isMuted = false;
  let path1Timer: ReturnType<typeof setTimeout> | null = null;
  let isClosed = false;

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

    // Close peer connection
    if (pc) {
      pc.close();
      pc = null;
    }
  }

  // --- public API ---

  async function startOffer(): Promise<string> {
    if (isClosed) throw new Error("Transport closed");

    const config = await getIceConfig();
    pc = new RTCPeerConnection(config);

    // Path 1 timeout: if no connection within path1TimeoutMs, notify caller
    if (opts.path === "path1") {
      path1Timer = setTimeout(() => {
        console.log("[webrtc-call-transport] Path 1 timed out — notifying caller to retry with Path 2");
        opts.onPath1Timeout?.();
      }, path1Timeout);
    }

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      if (pc) opts.onConnectionStateChange(pc.connectionState);
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
    pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        opts.onRemoteStream(event.streams[0]);
      }
    };

    // Get local audio
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.getTracks().forEach((track) => {
        pc!.addTrack(track, localStream!);
      });
    } catch (err) {
      closeInternal();
      throw new Error(`Microphone access denied: ${err instanceof Error ? err.message : err}`);
    }

    // Create offer
    const offer = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(offer);
    opts.onSdpGenerated(offer.sdp!, "offer");

    return offer.sdp!;
  }

  async function startAnswer(remoteSdp: string): Promise<string> {
    if (isClosed) throw new Error("Transport closed");

    const config = await getIceConfig();
    pc = new RTCPeerConnection(config);

    // Connection state monitoring
    pc.onconnectionstatechange = () => {
      if (pc) opts.onConnectionStateChange(pc.connectionState);
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
    pc.ontrack = (event) => {
      if (event.streams?.[0]) {
        opts.onRemoteStream(event.streams[0]);
      }
    };

    // Get local audio
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStream.getTracks().forEach((track) => {
        pc!.addTrack(track, localStream!);
      });
    } catch (err) {
      closeInternal();
      throw new Error(`Microphone access denied: ${err instanceof Error ? err.message : err}`);
    }

    // Set remote offer
    await pc.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: remoteSdp }));

    // Create answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    opts.onSdpGenerated(answer.sdp!, "answer");

    return answer.sdp!;
  }

  async function addIceCandidate(candidate: CallIceCandidatePayload["candidate"]): Promise<void> {
    if (!pc || isClosed) return;
    try {
      await pc.addIceCandidate(new RTCIceCandidate({
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid ?? undefined,
        sdpMLineIndex: candidate.sdpMLineIndex ?? undefined,
      }));
    } catch (err) {
      console.warn("[webrtc-call-transport] addIceCandidate failed:", err);
    }
  }

  function setMute(muted: boolean, callId?: string): void {
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

  return {
    startOffer,
    startAnswer,
    addIceCandidate,
    setMute,
    close: closeInternal,
  };
}
