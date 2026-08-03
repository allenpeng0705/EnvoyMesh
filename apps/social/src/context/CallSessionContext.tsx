/**
 * Global voice-call session — incoming modal and active call UI at app root
 * so peers receive calls on any view (not only when a chat thread is open).
 */

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useCallSession, type UseCallSessionResult } from "../hooks/useCallSession.js";
import { IncomingCallModal } from "../components/IncomingCallModal.js";
import { ActiveCallPanel } from "../components/ActiveCallPanel.js";
import { useT } from "./I18nContext.js";

const CallSessionContext = createContext<UseCallSessionResult | null>(null);

function GlobalCallOverlay({ session }: { session: UseCallSessionResult }) {
  const t = useT();
  const {
    incomingCall,
    activeCall,
    activePeerDisplayName,
    acceptCall,
    declineCall,
    endCall,
    toggleMute,
    isMuted,
    isRemoteMuted,
    micAvailable,
    cameraAvailable,
    connectionState,
    remoteStream,
    localStream,
    callingState,
    callingCallType,
    cancelCall,
  } = session;

  const activePeerName = activePeerDisplayName ?? activeCall?.peerOwnerId ?? t("call:unknownPeer", "Contact");

  return (
    <>
      {incomingCall ? (
        <IncomingCallModal
          callerName={incomingCall.peerDisplayName}
          callerOwnerId={incomingCall.peerOwnerId}
          callType={incomingCall.callType}
          onAccept={() => void acceptCall()}
          onDecline={declineCall}
        />
      ) : null}
      {callingState && !activeCall ? (
        <div className={`global-active-call-dock${callingCallType === "video" ? " global-active-call-dock--video" : ""}`}>
          <ActiveCallPanel
            peerDisplayName={activePeerDisplayName ?? activePeerName}
            peerOwnerId=""
            callType={callingCallType ?? "audio"}
            isMuted={isMuted}
            isRemoteMuted={isRemoteMuted}
            micAvailable={micAvailable}
            cameraAvailable={cameraAvailable}
            connectionState="ringing"
            remoteStream={null}
            localStream={localStream}
            onToggleMute={toggleMute}
            onEndCall={cancelCall}
          />
        </div>
      ) : null}
      {activeCall ? (
        <div className={`global-active-call-dock${activeCall.callType === "video" ? " global-active-call-dock--video" : ""}`}>
          <ActiveCallPanel
            peerDisplayName={activePeerName}
            peerOwnerId={activeCall.peerOwnerId}
            callType={activeCall.callType}
            isMuted={isMuted}
            isRemoteMuted={isRemoteMuted}
            micAvailable={micAvailable}
            cameraAvailable={cameraAvailable}
            connectionState={connectionState}
            remoteStream={remoteStream}
            localStream={localStream}
            onToggleMute={toggleMute}
            onEndCall={endCall}
          />
        </div>
      ) : null}
    </>
  );
}

export function CallSessionProvider({ children }: { children: ReactNode }) {
  const session = useCallSession();

  // Always expose the call session on `window.__envoyCallSession` so the
  // chromium E2E tests can drive outbound calls via the dev hook. The previous
  // `if (!import.meta.env.DEV) return;` guard tree-shook the assignment in
  // `vite build` output (DEV is false for `vite build` regardless of
  // `--mode`), which made `waitForCallSessionHook` time out and silently
  // disabled test 8 / 12. The cost in production is one window property and
  // a single useEffect per session change — negligible.
  useEffect(() => {
    (window as unknown as { __envoyCallSession?: UseCallSessionResult }).__envoyCallSession = session;
    return () => {
      delete (window as unknown as { __envoyCallSession?: UseCallSessionResult }).__envoyCallSession;
    };
  }, [session]);

  return (
    <CallSessionContext.Provider value={session}>
      {children}
      <GlobalCallOverlay session={session} />
    </CallSessionContext.Provider>
  );
}

export function useCallSessionContext(): UseCallSessionResult {
  const ctx = useContext(CallSessionContext);
  if (!ctx) {
    throw new Error("useCallSessionContext() must be used within CallSessionProvider");
  }
  return ctx;
}
