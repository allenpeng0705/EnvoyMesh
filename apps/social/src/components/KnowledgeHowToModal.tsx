/**
 * End-user guide for Knowledge — Obsidian / Notion / vault Ask.
 * Opened from the Knowledge hub header.
 */

import { ModalPortal } from "./ModalPortal.js";
import { useT } from "../context/I18nContext.js";

interface KnowledgeHowToModalProps {
  onClose: () => void;
}

function ExampleSection(props: {
  title: string;
  mode: string;
  goal: string;
  rosterTitle?: string;
  roster?: string[];
  flowTitle: string;
  steps: string[];
  result: string;
}) {
  return (
    <section className="howto-modal__section howto-modal__section--example">
      <h3 className="howto-modal__heading">{props.title}</h3>
      <p className="howto-modal__mode">{props.mode}</p>
      <p className="howto-modal__example-goal">{props.goal}</p>
      {props.rosterTitle && props.roster && props.roster.length > 0 ? (
        <>
          <h4 className="howto-modal__subheading">{props.rosterTitle}</h4>
          <ul className="howto-modal__roster">
            {props.roster.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : null}
      <h4 className="howto-modal__subheading">{props.flowTitle}</h4>
      <ol className="howto-modal__steps">
        {props.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="howto-modal__example-result">{props.result}</p>
    </section>
  );
}

export function KnowledgeHowToModal({ onClose }: KnowledgeHowToModalProps) {
  const t = useT();

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="modal-panel howto-modal knowledge-howto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="knowledge-howto-title"
          data-testid="knowledge-howto-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 id="knowledge-howto-title">{t("knowledge.howTo.title")}</h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t("common.close", "Close")}
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <div className="howto-modal__body">
            <p className="howto-modal__intro">{t("knowledge.howTo.intro")}</p>

            <section className="howto-modal__section">
              <h3 className="howto-modal__heading">{t("knowledge.howTo.beforeTitle")}</h3>
              <ol className="howto-modal__steps">
                <li>{t("knowledge.howTo.before1")}</li>
                <li>{t("knowledge.howTo.before2")}</li>
                <li>{t("knowledge.howTo.before3")}</li>
                <li>{t("knowledge.howTo.before4")}</li>
              </ol>
            </section>

            <ExampleSection
              title={t("knowledge.howTo.basicsTitle")}
              mode={t("knowledge.howTo.basicsMode")}
              goal={t("knowledge.howTo.basicsGoal")}
              flowTitle={t("knowledge.howTo.basicsFlowTitle")}
              steps={[
                t("knowledge.howTo.basicsStep1"),
                t("knowledge.howTo.basicsStep2"),
                t("knowledge.howTo.basicsStep3"),
                t("knowledge.howTo.basicsStep4"),
                t("knowledge.howTo.basicsStep5"),
              ]}
              result={t("knowledge.howTo.basicsResult")}
            />

            <ExampleSection
              title={t("knowledge.howTo.obsidianTitle")}
              mode={t("knowledge.howTo.obsidianMode")}
              goal={t("knowledge.howTo.obsidianGoal")}
              rosterTitle={t("knowledge.howTo.obsidianRosterTitle")}
              roster={[
                t("knowledge.howTo.obsidianNode1"),
                t("knowledge.howTo.obsidianNode2"),
                t("knowledge.howTo.obsidianNode3"),
              ]}
              flowTitle={t("knowledge.howTo.obsidianFlowTitle")}
              steps={[
                t("knowledge.howTo.obsidianStep1"),
                t("knowledge.howTo.obsidianStep2"),
                t("knowledge.howTo.obsidianStep3"),
                t("knowledge.howTo.obsidianStep4"),
                t("knowledge.howTo.obsidianStep5"),
                t("knowledge.howTo.obsidianStep6"),
              ]}
              result={t("knowledge.howTo.obsidianResult")}
            />

            <ExampleSection
              title={t("knowledge.howTo.notionTitle")}
              mode={t("knowledge.howTo.notionMode")}
              goal={t("knowledge.howTo.notionGoal")}
              rosterTitle={t("knowledge.howTo.notionRosterTitle")}
              roster={[
                t("knowledge.howTo.notionNode1"),
                t("knowledge.howTo.notionNode2"),
                t("knowledge.howTo.notionNode3"),
              ]}
              flowTitle={t("knowledge.howTo.notionFlowTitle")}
              steps={[
                t("knowledge.howTo.notionStep1"),
                t("knowledge.howTo.notionStep2"),
                t("knowledge.howTo.notionStep3"),
                t("knowledge.howTo.notionStep4"),
                t("knowledge.howTo.notionStep5"),
                t("knowledge.howTo.notionStep6"),
              ]}
              result={t("knowledge.howTo.notionResult")}
            />

            <p className="howto-modal__tip">{t("knowledge.howTo.tip")}</p>
          </div>

          <div className="howto-modal__footer">
            <button
              type="button"
              className="primary"
              data-testid="knowledge-howto-done"
              onClick={onClose}
            >
              {t("knowledge.howTo.done")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
