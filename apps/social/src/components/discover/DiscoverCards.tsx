import type {
  MorningReportEntry,
  MultiHopDiscoveryMatch,
  PeerSearchResult,
  BondRecord,
} from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { shortOwnerId } from "../../lib/display.js";
import {
  filterFriendSuggestions,
  formatFriendSuggestionReason,
  friendSuggestionDisplayName,
} from "../../lib/discover-friend-suggestion.js";
import { resolvePeerHelloState } from "../../lib/discover-peer-state.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";

export function TrustPathTrail({ path }: { path: string }) {
  const t = useT();
  const segments = path.split(/\s*→\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;
  return (
    <ol className="multihop-trust-path" aria-label={t("discoverCards.trustPathLabel")}>
      {segments.map((segment, i) => (
        <li key={`${i}-${segment}`}>
          <span className="multihop-trust-path__node" title={segment}>
            {shortOwnerId(segment, 18)}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function MultiHopResultCard({
  row,
  index,
  onSayHello,
}: {
  row: MultiHopDiscoveryMatch;
  index: number;
  onSayHello: (ownerId: string) => void;
}) {
  const t = useT();
  const via =
    row.viaDisplayName?.trim() ||
    (row.viaOwnerId ? shortOwnerId(row.viaOwnerId) : null);
  const hopLabel =
    row.hopDistance === 1
      ? t("discoverCards.hopAria", { count: row.hopDistance })
      : t("discoverCards.hopsAria", { count: row.hopDistance });
  return (
    <li
      className="multihop-result search-result peer-result-card"
      style={{ ["--discover-i" as string]: String(index) }}
    >
      <span
        className={`multihop-hop-badge multihop-hop-badge--${row.hopDistance}`}
        aria-label={hopLabel}
      >
        {row.hopDistance}
      </span>
      <PeerProfileAvatar
        ownerId={row.ownerId}
        fallbackLabel={via ?? row.ownerId}
        className="peer-result-card__avatar multihop-result__avatar"
      />
      <div className="result-info multihop-result__body">
        <strong title={row.ownerId}>{shortOwnerId(row.ownerId, 22)}</strong>
        {via && (
          <span className="multihop-result__via">
            {t("discoverCards.referredVia")} <em>{via}</em>
          </span>
        )}
        {row.trustPath && <TrustPathTrail path={row.trustPath} />}
      </div>
      <button type="button" className="peer-result-card__action" onClick={() => void onSayHello(row.ownerId)}>
        {t("discoverCards.sayHello")}
      </button>
    </li>
  );
}

export function PeerResultCard({
  result,
  index,
  helloState = "none",
  onSayHello,
}: {
  result: PeerSearchResult;
  index: number;
  helloState?: "none" | "sent" | "connected";
  onSayHello: (nodeId: string) => void;
}) {
  const t = useT();
  const trustBits: string[] = [];
  if (result.discoverySource) trustBits.push(result.discoverySource);
  if (result.trustLevel) trustBits.push(result.trustLevel);
  if (result.signedRecordValid === true) trustBits.push(t("discoverCards.signed"));
  else if (result.signedRecordValid === false) trustBits.push(t("discoverCards.unsigned"));

  return (
    <li
      className="search-result peer-result-card"
      style={{ ["--discover-i" as string]: String(index) }}
    >
      <PeerProfileAvatar
        ownerId={result.ownerId}
        fallbackLabel={result.displayName || result.ownerId}
        className="peer-result-card__avatar"
      />
      <div className="result-info peer-result-card__body">
        <strong>{result.displayName || shortOwnerId(result.nodeId, 20)}</strong>
        {result.username && <span className="result-username">@{result.username}</span>}
        {result.did && (
          <span className="result-username peer-result-card__did" title={result.did}>
            {result.did.slice(0, 24)}…
          </span>
        )}
        {trustBits.length > 0 && (
          <div className="peer-result-card__tags">
            {trustBits.map((bit) => (
              <span key={bit} className="peer-result-card__tag">
                {bit}
              </span>
            ))}
          </div>
        )}
        {result.bio && <p className="peer-result-card__bio">{result.bio}</p>}
        {result.interests.length > 0 && (
          <span className="interests peer-result-card__interests">{result.interests.join(", ")}</span>
        )}
      </div>
      {helloState === "connected" ? (
        <span className="discover-peer-card__status discover-peer-card__status--connected" role="status">
          {t("common.connected")}
        </span>
      ) : helloState === "sent" ? (
        <span className="discover-peer-card__status discover-peer-card__status--sent" role="status">
          {t("common.helloSentWaiting")}
        </span>
      ) : (
        <button type="button" className="peer-result-card__action" onClick={() => void onSayHello(result.ownerId)}>
          {t("discoverCards.sayHello")}
        </button>
      )}
    </li>
  );
}

export function FriendSuggestionsPanel({
  entries,
  bonds,
  outboundHellos,
  onSayHello,
}: {
  entries: MorningReportEntry[];
  bonds: readonly BondRecord[];
  outboundHellos: ReadonlySet<string>;
  onSayHello: (targetId: string) => void;
}) {
  const t = useT();
  const visible = filterFriendSuggestions(entries, bonds);
  if (visible.length === 0) return null;
  return (
    <section className="discover-panel friend-suggestions-panel" aria-labelledby="friend-suggestions-heading">
      <header className="discover-panel__header">
        <h4 id="friend-suggestions-heading" className="discover-panel__title">
          {t("discoverCards.friendSuggestionsTitle")}
        </h4>
        <p className="discover-panel__lede">{t("discoverCards.friendSuggestionsLede")}</p>
      </header>
      <ul className="friend-suggestions-list">
        {visible.map((entry, index) => {
          const label = friendSuggestionDisplayName(entry, t);
          const helloState = resolvePeerHelloState(
            entry.ownerId,
            entry.peerId ?? entry.ownerId,
            bonds,
            outboundHellos,
          );
          return (
            <li
              key={entry.ownerId}
              className="friend-suggestion-card"
              style={{ ["--discover-i" as string]: String(index) }}
            >
              <PeerProfileAvatar
                ownerId={entry.ownerId}
                fallbackLabel={label}
                className="friend-suggestion-card__avatar"
              />
              <div className="friend-suggestion-card__body">
                <strong>{label}</strong>
                <p className="friend-suggestion-card__reason">{formatFriendSuggestionReason(entry, t)}</p>
              </div>
              <div className="friend-suggestion-card__actions">
                {helloState === "sent" ? (
                  <span className="discover-peer-card__status discover-peer-card__status--sent" role="status">
                    {t("common.helloSentWaiting")}
                  </span>
                ) : (
                  <button type="button" className="discover-primary-btn" onClick={() => onSayHello(entry.ownerId)}>
                    {t("discoverCards.sayHello")}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
