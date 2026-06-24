/**
 * Global voice-call session — incoming modal and active call UI at app root
 * so peers receive calls on any view (not only when a chat thread is open).
 */

import { createContext, useContext, type ReactNode } from "react";
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
    connectionState,
    remoteStream,
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
        <div className="global-active-call-dock">
          <ActiveCallPanel
            peerDisplayName={activePeerName}
            peerOwnerId={activeCall.peerOwnerId}
            isMuted={isMuted}
            isRemoteMuted={isRemoteMuted}
            micAvailable={micAvailable}
            connectionState={connectionState}
            remoteStream={remoteStream}
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
