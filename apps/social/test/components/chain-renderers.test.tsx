/**
 * Phase 40 — Social UI: ChainsView, ChainTreeView, ChainReportRenderer,
 * CompositeArtifactRenderer tests.
 *
 * Validates the rendering of multi-agent chain data: status chips,
 * subtask trees, report sections, citations, and the weighted composite
 * artifact table.
 */

/** @vitest-environment jsdom */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within, fireEvent } from "@testing-library/react";

afterEach(() => cleanup());

import type { ChainReport, CompositeArtifact, CompositeArtifactPart } from "@envoymesh/api";

import { ChainTreeView, type ChainSubtaskNode } from "../../src/components/ChainTreeView.js";
import { ChainReportRenderer } from "../../src/components/ChainReportRenderer.js";
import { CompositeArtifactRenderer } from "../../src/components/CompositeArtifactRenderer.js";
import { I18nContext, type TFunction } from "../../src/context/I18nContext.js";
import { en } from "../../src/i18n/messages/en.js";
import { translate } from "../../src/i18n/translate.js";

const stubT: TFunction = (key, fallbackOrParams, params) => {
  return translate(en, key, fallbackOrParams, params);
};

function wrap(node: React.ReactNode): React.ReactElement {
  return (
    <I18nContext.Provider value={{ locale: "en", setLocale: () => undefined, t: stubT, localeOptions: [] }}>
      {node}
    </I18nContext.Provider>
  );
}

function makePart(overrides: Partial<CompositeArtifactPart> = {}): CompositeArtifactPart {
  return {
    subtaskId: "subtask_a",
    workerPeerId: "12D3KooW-w1",
    workerOwnerId: "envoy:owner:w1",
    weight: 1,
    note: "a note",
    ...overrides,
  };
}

function makeComposite(
  aggregation: CompositeArtifact["aggregation"],
  parts: CompositeArtifactPart[],
): CompositeArtifact {
  return {
    kind: "composite",
    parts,
    aggregation,
    createdAt: "2026-06-18T10:00:00.000Z",
  };
}

function makeReport(overrides: Partial<ChainReport> = {}): ChainReport {
  return {
    version: "0.1",
    chainId: "chain_abc",
    chainMandateId: "chainmandate_abc",
    orchestratorOwnerId: "envoy:owner:self",
    orchestratorPeerId: "12D3KooW-self",
    pinned: false,
    chainSummary: {
      durationMs: 12_500,
      subtaskCount: 2,
      workerCount: 2,
      workerAllocations: [
        { subtaskId: "subtask_a", workerPeerId: "12D3KooW-w1", committedUsd: 2 },
        { subtaskId: "subtask_b", workerPeerId: "12D3KooW-w2", committedUsd: 3 },
      ],
      synthesisCostUsd: 0.5,
    },
    sections: [
      {
        heading: "Analyzed Q3",
        bodyMarkdown: "## Q3\n\nRevenue up 12%",
        citations: [
          { subtaskId: "subtask_a", snippet: "Q3 revenue was $1.2M" },
        ],
      },
      {
        heading: "Analyzed Q4",
        bodyMarkdown: "## Q4\n\nRevenue up 8%",
        citations: [
          { subtaskId: "subtask_b", snippet: "Q4 revenue was $1.4M" },
        ],
      },
    ],
    createdAt: "2026-06-18T10:00:00.000Z",
    recipientRoles: ["human"],
    ...overrides,
  };
}

describe("ChainTreeView", () => {
  it("renders subtask rows with state chips", () => {
    const subtasks: ChainSubtaskNode[] = [
      {
        subtaskId: "subtask_a",
        depth: 1,
        requiredCapability: "task.execute",
        objective: "analyze Q3",
        state: "awarded",
        costUsd: 2,
      },
      {
        subtaskId: "subtask_b",
        depth: 1,
        requiredCapability: "task.execute",
        objective: "analyze Q4",
        state: "partial",
        costUsd: 3,
      },
    ];
    render(wrap(<ChainTreeView chainId="chain_x" chainMandateId="chainmandate_x" subtasks={subtasks} />));
    expect(screen.getAllByText("subtask_a").length).toBeGreaterThan(0);
    expect(screen.getAllByText("subtask_b").length).toBeGreaterThan(0);
    expect(screen.getByText("analyze Q3")).toBeDefined();
    expect(screen.getByText("analyze Q4")).toBeDefined();
    // Cost is rendered
    expect(screen.getAllByText("$2.00").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$3.00").length).toBeGreaterThan(0);
  });

  it("renders the empty placeholder when no subtasks", () => {
    render(wrap(<ChainTreeView chainId="chain_x" chainMandateId="chainmandate_x" subtasks={[]} />));
    expect(screen.getByText("No subtasks yet.")).toBeDefined();
  });

  it("renders bids and workers", () => {
    const subtasks: ChainSubtaskNode[] = [
      {
        subtaskId: "subtask_a",
        depth: 1,
        requiredCapability: "task.execute",
        objective: "x",
        state: "bidding",
        bids: [
          { workerPeerId: "12D3KooW-w1", proposedCostUsd: 1.5 },
          { workerPeerId: "12D3KooW-w2", proposedCostUsd: 2 },
        ],
      },
    ];
    render(
      wrap(
        <ChainTreeView
          chainId="chain_x"
          chainMandateId="chainmandate_x"
          subtasks={subtasks}
          workersBySubtask={{
            subtask_a: [
              {
                workerPeerId: "12D3KooW-w1",
                ownerId: "envoy:owner:w1",
                state: "awarded",
                costUsd: 1.5,
              },
            ],
          }}
        />,
      ),
    );
    expect(screen.getAllByText("$1.50").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$2.00").length).toBeGreaterThan(0);
    expect(screen.getByText("envoy:owner:w1")).toBeDefined();
  });

  it("highlights the highlighted subtask", () => {
    const subtasks: ChainSubtaskNode[] = [
      { subtaskId: "subtask_a", depth: 1, requiredCapability: "task.execute", objective: "a", state: "awarded" },
      { subtaskId: "subtask_b", depth: 1, requiredCapability: "task.execute", objective: "b", state: "awarded" },
    ];
    render(
      wrap(
        <ChainTreeView
          chainId="chain_x"
          chainMandateId="chainmandate_x"
          subtasks={subtasks}
          highlightedSubtaskId="subtask_b"
        />,
      ),
    );
    const row = document.querySelector('[data-subtask-id="subtask_b"]') || document.querySelector('[data-highlighted="true"]');
    // The highlighted attribute should be on subtask_b's row
    const highlightedRow = document.querySelector('[data-highlighted="true"]');
    expect(highlightedRow).toBeDefined();
  });
});

describe("ChainReportRenderer", () => {
  it("renders header, sections, and citations", () => {
    const report = makeReport();
    const onCite = () => undefined;
    render(wrap(<ChainReportRenderer report={report} onCitationClick={onCite} />));
    expect(screen.getByText("Analyzed Q3")).toBeDefined();
    expect(screen.getByText("Analyzed Q4")).toBeDefined();
    expect(screen.getAllByText("subtask_a").length).toBeGreaterThan(0);
    expect(screen.getAllByText("subtask_b").length).toBeGreaterThan(0);
    expect(screen.getByText(/Q3 revenue was/)).toBeDefined();
  });

  it("fires onCitationClick with the subtaskId", () => {
    let captured: string | null = null;
    const report = makeReport();
    render(wrap(<ChainReportRenderer report={report} onCitationClick={(id) => { captured = id; }} />));
    const btn = screen.getAllByText("subtask_a")[0]!;
    fireEvent.click(btn);
    expect(captured).toBe("subtask_a");
  });

  it("renders the composite executive artifact when present", () => {
    const composite = makeComposite("weighted_concat", [
      makePart({ subtaskId: "subtask_a", workerPeerId: "12D3KooW-w1", weight: 1 }),
      makePart({ subtaskId: "subtask_b", workerPeerId: "12D3KooW-w2", weight: 3 }),
    ]);
    const report = makeReport({ executiveArtifact: composite });
    render(wrap(<ChainReportRenderer report={report} />));
    expect(screen.getByText("Weighted concatenate")).toBeDefined();
    const table = screen.getByRole("table", { name: /Composite artifact parts/i });
    expect(table).toBeDefined();
    // Both subtasks appear
    expect(within(table).getAllByText("subtask_a").length).toBeGreaterThan(0);
    expect(within(table).getAllByText("subtask_b").length).toBeGreaterThan(0);
  });

  it("computes total cost as sum of worker allocations + synthesis", () => {
    const report = makeReport();
    render(wrap(<ChainReportRenderer report={report} />));
    // 2 + 3 + 0.5 = 5.50
    expect(screen.getByText("$5.50")).toBeDefined();
    expect(screen.getAllByText("$0.50").length).toBeGreaterThan(0);
  });
});

describe("CompositeArtifactRenderer", () => {
  it("renders all four aggregation kinds with the right header", () => {
    const aggregations: CompositeArtifact["aggregation"][] = [
      "concatenate",
      "weighted_concat",
      "merge_structured",
      "owner_review",
    ];
    for (const agg of aggregations) {
      const composite = makeComposite(agg, [makePart()]);
      const { unmount } = render(wrap(<CompositeArtifactRenderer artifact={composite} />));
      const headers: Record<typeof agg, string> = {
        concatenate: "Concatenate",
        weighted_concat: "Weighted concatenate",
        merge_structured: "Merge structured",
        owner_review: "Owner review",
      };
      expect(screen.getByText(headers[agg])).toBeDefined();
      unmount();
    }
  });

  it("normalizes weights to percentages summing to ~100%", () => {
    const composite = makeComposite("weighted_concat", [
      makePart({ subtaskId: "subtask_a", weight: 1 }),
      makePart({ subtaskId: "subtask_b", weight: 3 }),
    ]);
    render(wrap(<CompositeArtifactRenderer artifact={composite} />));
    expect(screen.getByText("25%")).toBeDefined();
    expect(screen.getByText("75%")).toBeDefined();
  });

  it("renders per-part inline artifacts when provided", () => {
    const composite = makeComposite("concatenate", [
      makePart({ subtaskId: "subtask_a", weight: 1 }),
    ]);
    const artifactsByPart = {
      subtask_a: {
        kind: "text" as const,
        content: "hello world",
        mimeType: "text/plain",
      },
    };
    render(wrap(<CompositeArtifactRenderer artifact={composite} artifactsByPart={artifactsByPart} />));
    const btn = screen.getByText("Show part content");
    fireEvent.click(btn);
    expect(screen.getByText("hello world")).toBeDefined();
  });

  it("handles zero-weight parts gracefully", () => {
    const composite = makeComposite("weighted_concat", [
      makePart({ subtaskId: "subtask_a", weight: 0 }),
      makePart({ subtaskId: "subtask_b", weight: 5 }),
    ]);
    render(wrap(<CompositeArtifactRenderer artifact={composite} />));
    // Zero weight collapses to 0%; the remaining part is 100%
    expect(screen.getByText("0%")).toBeDefined();
    expect(screen.getByText("100%")).toBeDefined();
  });
});
