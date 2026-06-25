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
        <div className="global-calling-banner" role="status" aria-live="polite">
          <span className="calling-banner-pulse" aria-hidden />
          <span className="calling-banner-text">
            {activePeerDisplayName
              ? t("call:callingWithName", { name: activePeerDisplayName })
              : t("call:calling")}
          </span>
          <button type="button" className="calling-banner-cancel" onClick={() => cancelCall()}>
            {t("call:cancelCall")}
          </button>
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

  useEffect(() => {
    if (!import.meta.env.DEV) return;
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
