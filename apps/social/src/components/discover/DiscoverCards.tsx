import type {
  MorningReportEntry,
  MultiHopDiscoveryMatch,
  PeerSearchResult,
  ResolvedDidImport,
} from "@envoymesh/api";
import { shortOwnerId } from "../../lib/display.js";

export function TrustPathTrail({ path }: { path: string }) {
  const segments = path.split(/\s*→\s*/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return null;
  return (
    <ol className="multihop-trust-path" aria-label="Trust path">
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
  onSayHello: (peerId: string) => void;
}) {
  const via =
    row.viaDisplayName?.trim() ||
    (row.viaOwnerId ? shortOwnerId(row.viaOwnerId) : null);
  return (
    <li
      className="multihop-result search-result peer-result-card"
      style={{ ["--discover-i" as string]: String(index) }}
    >
      <span
        className={`multihop-hop-badge multihop-hop-badge--${row.hopDistance}`}
        aria-label={`${row.hopDistance} hop${row.hopDistance === 1 ? "" : "s"}`}
      >
        {row.hopDistance}
      </span>
      <div className="result-info multihop-result__body">
        <strong title={row.ownerId}>{shortOwnerId(row.ownerId, 22)}</strong>
        {via && (
          <span className="multihop-result__via">
            Referred via <em>{via}</em>
          </span>
        )}
        {row.trustPath && <TrustPathTrail path={row.trustPath} />}
      </div>
      <button type="button" className="peer-result-card__action" onClick={() => void onSayHello(row.peerId)}>
        Say Hello
      </button>
    </li>
  );
}

export function PeerResultCard({
  result,
  index,
  onSayHello,
}: {
  result: PeerSearchResult;
  index: number;
  onSayHello: (nodeId: string) => void;
}) {
  const trustBits: string[] = [];
  if (result.discoverySource) trustBits.push(result.discoverySource);
  if (result.trustLevel) trustBits.push(result.trustLevel);
  if (result.signedRecordValid === true) trustBits.push("signed");
  else if (result.signedRecordValid === false) trustBits.push("unsigned");

  return (
    <li
      className="search-result peer-result-card"
      style={{ ["--discover-i" as string]: String(index) }}
    >
      <span className="avatar peer-result-card__avatar" aria-hidden>
        {result.displayName?.[0] || "?"}
      </span>
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
      <button type="button" className="peer-result-card__action" onClick={() => void onSayHello(result.nodeId)}>
        Say Hello
      </button>
    </li>
  );
}

export function MorningReportPanel({ entries }: { entries: MorningReportEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section className="discover-panel morning-report-panel" aria-labelledby="morning-report-heading">
      <header className="discover-panel__header">
        <h4 id="morning-report-heading" className="discover-panel__title">
          Morning report
        </h4>
        <p className="discover-panel__lede">Ranked discovery candidates from overnight bond and DHT activity.</p>
      </header>
      <ol className="morning-report-list">
        {entries.map((entry, index) => (
          <li
            key={entry.ownerId}
            className="morning-report-card"
            style={{ ["--discover-i" as string]: String(index) }}
          >
            <span className="morning-report-card__rank" aria-hidden>
              {index + 1}
            </span>
            <div className="morning-report-card__body">
              <strong title={entry.ownerId}>{shortOwnerId(entry.ownerId, 20)}</strong>
              <div className="morning-report-card__metrics">
                <span className="morning-report-card__score" title="Discovery score">
                  {entry.score}
                </span>
                <span className="peer-result-card__tag">{entry.trustLevel}</span>
                <span className="morning-report-card__meta">
                  {entry.discoveryMatchCount} match{entry.discoveryMatchCount === 1 ? "" : "es"}
                  {entry.hopDistance !== undefined ? ` · ${entry.hopDistance} hop` : ""}
                </span>
              </div>
              <p className="morning-report-card__reason">{entry.reason}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function DidImportPanel({
  input,
  onInputChange,
  busy,
  error,
  result,
  onImport,
}: {
  input: string;
  onInputChange: (value: string) => void;
  busy: boolean;
  error: string | null;
  result: ResolvedDidImport | null;
  onImport: () => void;
}) {
  return (
    <section className="discover-panel did-import-panel" aria-labelledby="did-import-heading">
      <header className="discover-panel__header">
        <h4 id="did-import-heading" className="discover-panel__title">
          Import external DID
        </h4>
        <p className="discover-panel__lede">
          Paste a <code>did:key</code> or JSON DID document to cache keys for bonded-contact lookup.
        </p>
      </header>
      <div className="did-import-panel__form">
        <textarea
          className="did-import-panel__input"
          rows={4}
          placeholder="did:key:z… or { &quot;@context&quot;: … }"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
        />
        <button
          type="button"
          className="search-btn did-import-panel__submit"
          disabled={busy || !input.trim()}
          onClick={() => void onImport()}
        >
          {busy ? "Resolving…" : "Import for lookup"}
        </button>
      </div>
      {error && (
        <p className="did-import-panel__error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="did-import-panel__success" role="status">
          <strong>Resolved</strong>
          <p className="did-import-panel__did" title={result.did}>
            {result.did}
          </p>
          <p className="did-import-panel__owner">
            Owner <code>{result.ownerId}</code>
          </p>
        </div>
      )}
    </section>
  );
}
