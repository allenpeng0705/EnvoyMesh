import type { HelloRequest } from "@envoymesh/api";
import { useT } from "../../context/I18nContext.js";
import { PeerProfileAvatar } from "../PeerProfileAvatar.js";

export function PendingHellosPanel({
  requests,
  onAccept,
  onDecline,
}: {
  requests: HelloRequest[];
  onAccept: (request: HelloRequest) => void | Promise<void>;
  onDecline: (request: HelloRequest) => void | Promise<void>;
}) {
  const t = useT();
  if (requests.length === 0) return null;

  return (
    <section className="discover-panel pending-hellos-panel" aria-labelledby="pending-hellos-heading">
      <header className="discover-panel__header">
        <h4 id="pending-hellos-heading" className="discover-panel__title">
          {t("discover.pending.title")}
        </h4>
        <p className="discover-panel__lede">
          {requests.length === 1
            ? t("discover.pending.one")
            : t("discover.pending.many", { count: requests.length })}
        </p>
      </header>
      <ul className="around-me-list pending-hellos-list">
        {requests.map((request) => {
          const label = request.profile.displayName?.trim() || t("discover.nearby.someoneNearby");
          const ownerId = request.sender.ownerId?.trim() || request.sender.nodeId;
          return (
            <li key={request.messageId} className="around-me-item pending-hello-item">
              <PeerProfileAvatar ownerId={ownerId} fallbackLabel={label} className="discover-peer-card__avatar" />
              <div className="peer-info discover-peer-card__body">
                <strong>{label}</strong>
                {request.message?.trim() ? <span className="peer-id">{request.message.trim()}</span> : null}
              </div>
              <div className="pending-hello-item__actions">
                <button type="button" className="say-hello-btn" onClick={() => void onAccept(request)}>
                  {t("common.accept")}
                </button>
                <button type="button" className="secondary" onClick={() => void onDecline(request)}>
                  {t("common.decline")}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
