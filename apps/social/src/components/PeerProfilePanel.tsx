import { useEffect, useState } from "react";
import type { PeerProfileView } from "@envoymesh/api";
import { useNodeService } from "../hooks/useNodeService.js";
import { useT } from "../context/I18nContext.js";
import { AgentCardPanel } from "./AgentCardPanel.js";

interface PeerProfilePanelProps {
  ownerId: string;
  fallbackDisplayName: string;
}

/** Bonded contact profile (bio, interests) + cached agent card — not shown in the chat thread. */
export function PeerProfilePanel({ ownerId, fallbackDisplayName }: PeerProfilePanelProps) {
  const t = useT();
  const nodeService = useNodeService();
  const [peer, setPeer] = useState<PeerProfileView | undefined>();

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void nodeService.getPeerProfile(ownerId).then((row) => {
        if (!cancelled) setPeer(row);
      });
    };
    load();
    // Human profile (chat protocol) + agent card (message protocol) are separate
    // exchanges — without requesting the card, Agent capabilities stay empty forever.
    void nodeService.requestPeerProfile(ownerId).catch(() => {});
    void nodeService.requestAgentCard(ownerId).catch(() => {});
    const unsubProfile = nodeService.on?.("profile:updated", (data: { ownerId: string }) => {
      if (data.ownerId === ownerId) load();
    });
    return () => {
      cancelled = true;
      unsubProfile?.();
    };
  }, [nodeService, ownerId]);

  const profile = peer?.profile;
  const displayName = profile?.displayName?.trim() || fallbackDisplayName;
  const username = profile?.username?.trim();
  const bio = profile?.bio?.trim();
  const hobbies = (profile?.hobbies ?? []).filter(Boolean);
  const knowledge = (profile?.knowledge ?? []).filter(Boolean);

  return (
    <div className="peer-profile-panel-wrap">
      <details className="peer-profile-panel" data-testid="peer-profile-details">
        <summary>{t("contactChat.contactProfileSummary", "Contact profile")}</summary>
        <div className="peer-profile-panel__body">
          <div className="peer-profile-panel__about">
            <h4 className="peer-profile-panel__name">{displayName}</h4>
            {username ? <p className="peer-profile-panel__username muted small">@{username}</p> : null}
            {bio ? <p className="peer-profile-panel__bio">{bio}</p> : null}
            {hobbies.length > 0 ? (
              <p className="peer-profile-panel__meta muted small">
                {t("profileAbout.hobbies", "Hobbies")}: {hobbies.join(", ")}
              </p>
            ) : null}
            {knowledge.length > 0 ? (
              <p className="peer-profile-panel__meta muted small">
                {t("profileAbout.knowledge", "Knowledge")}: {knowledge.join(", ")}
              </p>
            ) : null}
            {!bio && hobbies.length === 0 && knowledge.length === 0 ? (
              <p className="field-desc">{t("contactChat.contactProfileEmpty", "No profile details synced yet.")}</p>
            ) : null}
          </div>
          <section className="peer-profile-panel__agent" aria-labelledby={`agent-cap-${ownerId}`}>
            <h5 className="peer-profile-panel__section-title" id={`agent-cap-${ownerId}`}>
              {t("contactChat.agentCardSummary", "Agent capabilities")}
            </h5>
            <AgentCardPanel ownerId={ownerId} showWebContentShortcuts={false} />
          </section>
        </div>
      </details>
    </div>
  );
}
