import type { EhTurnReviewFile } from "@envoymesh/api"

interface EhSplitDiffProps {
  diff: string
  className?: string
}

/** Side-by-side view of a unified diff snippet. */
export function EhSplitDiff({ diff, className }: EhSplitDiffProps) {
  const removed: string[] = []
  const added: string[] = []
  for (const line of diff.split("\n")) {
    if (
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("@@")
    ) {
      continue
    }
    if (line.startsWith("-")) removed.push(line.slice(1))
    else if (line.startsWith("+")) added.push(line.slice(1))
    else {
      removed.push(line)
      added.push(line)
    }
  }
  const classes = ["eh-split-diff", className].filter(Boolean).join(" ")
  return (
    <div className={classes}>
      <pre className="eh-split-diff__col eh-split-diff__col--old" aria-label="Before">
        {removed.join("\n")}
      </pre>
      <pre className="eh-split-diff__col eh-split-diff__col--new" aria-label="After">
        {added.join("\n")}
      </pre>
    </div>
  )
}

export function reviewFileLabel(file: EhTurnReviewFile): string {
  return file.path
}
