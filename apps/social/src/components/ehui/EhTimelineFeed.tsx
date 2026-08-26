import type {
  EhActivityGroupItem,
  EhChangeSetItem,
  EhCompletionItem,
  EhApprovalItem,
  EhQuestionItem,
  EhTimelineItem,
} from "@envoymesh/api"

export function EhTimelineFeed({ items, onReviewTurn, onRevertTurn }: {
  items: EhTimelineItem[]
  onReviewTurn?: (turnId: string) => void
  onRevertTurn?: (turnId: string) => void
}) {
  if (items.length === 0) return null
  return (
    <div className="eh-timeline-feed" aria-label="Agent activity">
      {items.map((item) => {
        switch (item.type) {
          case "activity":
            return <ActivityCard key={item.id} item={item} />
          case "changes":
            return <ChangesCard key={item.id} item={item} onReviewTurn={onReviewTurn} onRevertTurn={onRevertTurn} />
          case "completion":
            return <CompletionCard key={item.id} item={item} />
          case "approval":
            return <ApprovalCard key={item.id} item={item} />
          case "question":
            return <QuestionCard key={item.id} item={item} />
          default:
            return null
        }
      })}
    </div>
  )
}

function ApprovalCard({ item }: { item: EhApprovalItem }) {
  return (
    <div className={`eh-timeline-card eh-timeline-card--${item.status}`} role="status">
      <strong>{item.status === "allowed" ? "✓" : item.status === "pending" ? "…" : "✗"} {item.toolName}</strong>
      <span> · {item.status}</span>
      <p>{item.description}</p>
    </div>
  )
}

function QuestionCard({ item }: { item: EhQuestionItem }) {
  return (
    <div className={`eh-timeline-card eh-timeline-card--${item.status}`} role="status">
      <strong>{item.status === "answered" ? "✓" : item.status === "pending" ? "…" : "✗"} {item.prompt}</strong>
      <span> · {item.status}</span>
      {item.answer ? <p>{item.answer}</p> : null}
    </div>
  )
}

function ActivityCard({ item }: { item: EhActivityGroupItem }) {
  const glyph = item.status === "failed" ? "✗" : item.status === "running" ? "⚙" : "✓"
  return (
    <details className={`eh-timeline-card eh-timeline-card--${item.status}`}>
      <summary>
        <span aria-hidden="true">{glyph}</span>{" "}
        {item.summary}
      </summary>
      <dl>
        {item.toolName ? <><dt>Tool</dt><dd>{item.toolName}</dd></> : null}
        {item.durationMs !== undefined ? <><dt>Duration</dt><dd>{item.durationMs} ms</dd></> : null}
        {item.execution?.deviceLabel ? <><dt>Executor</dt><dd>{item.execution.deviceLabel}</dd></> : null}
      </dl>
      {item.output ? <pre>{item.output}</pre> : null}
    </details>
  )
}

function ChangesCard({ item, onReviewTurn, onRevertTurn }: {
  item: EhChangeSetItem
  onReviewTurn?: (turnId: string) => void
  onRevertTurn?: (turnId: string) => void
}) {
  return (
    <details className="eh-timeline-card eh-timeline-card--changes">
      <summary>✓ {item.files.length} file(s) changed</summary>
      <ul>{item.files.map((file) => <li key={file}><code>{file}</code></li>)}</ul>
      {item.turnId ? <div className="eh-timeline-card-actions">
        {onReviewTurn ? <button type="button" className="secondary" onClick={() => onReviewTurn(item.turnId!)}>Review diff</button> : null}
        {onRevertTurn ? <button type="button" className="secondary" onClick={() => onRevertTurn(item.turnId!)}>Revert this turn</button> : null}
      </div> : null}
    </details>
  )
}

function CompletionCard({ item }: { item: EhCompletionItem }) {
  const glyph = item.status === "completed" ? "✓" : item.status === "cancelled" ? "■" : "✗"
  return (
    <div className={`eh-timeline-card eh-timeline-card--${item.status}`} role="status">
      <strong>{glyph} {item.summary}</strong>
      {item.changedFileCount ? <span> · {item.changedFileCount} file(s) changed</span> : null}
      {item.testsPassed !== undefined ? <span> · {item.testsPassed} tests passed</span> : null}
    </div>
  )
}
