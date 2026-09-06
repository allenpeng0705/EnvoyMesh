/**
 * End-user guide for Team jobs — opened from the Team jobs header / empty state.
 * Two worked examples: skill-based matching and role-based seating.
 */

import { ModalPortal } from "./ModalPortal.js";
import { useT } from "../context/I18nContext.js";

interface TeamJobsHowToModalProps {
  onClose: () => void;
}

function ExampleSection(props: {
  title: string;
  mode: string;
  goal: string;
  rosterTitle: string;
  roster: string[];
  flowTitle: string;
  steps: string[];
  result: string;
}) {
  return (
    <section className="team-jobs-howto__section team-jobs-howto__section--example">
      <h3 className="team-jobs-howto__heading">{props.title}</h3>
      <p className="team-jobs-howto__mode">{props.mode}</p>
      <p className="team-jobs-howto__example-goal">{props.goal}</p>

      <h4 className="team-jobs-howto__subheading">{props.rosterTitle}</h4>
      <ul className="team-jobs-howto__roster">
        {props.roster.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h4 className="team-jobs-howto__subheading">{props.flowTitle}</h4>
      <ol className="team-jobs-howto__steps">
        {props.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="team-jobs-howto__example-result">{props.result}</p>
    </section>
  );
}

export function TeamJobsHowToModal({ onClose }: TeamJobsHowToModalProps) {
  const t = useT();

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="modal-panel team-jobs-howto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="team-jobs-howto-title"
          data-testid="team-jobs-howto-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 id="team-jobs-howto-title">{t("chains.howTo.title")}</h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t("common.close", "Close")}
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <div className="team-jobs-howto__body">
            <p className="team-jobs-howto__intro">{t("chains.howTo.intro")}</p>

            <section className="team-jobs-howto__section">
              <h3 className="team-jobs-howto__heading">{t("chains.howTo.beforeTitle")}</h3>
              <ol className="team-jobs-howto__steps">
                <li>{t("chains.howTo.before1")}</li>
                <li>{t("chains.howTo.before2")}</li>
                <li>{t("chains.howTo.before3")}</li>
                <li>{t("chains.howTo.before4")}</li>
              </ol>
            </section>

            <ExampleSection
              title={t("chains.howTo.skillTitle")}
              mode={t("chains.howTo.skillMode")}
              goal={t("chains.howTo.skillGoal")}
              rosterTitle={t("chains.howTo.skillRosterTitle")}
              roster={[
                t("chains.howTo.skillNode1"),
                t("chains.howTo.skillNode2"),
                t("chains.howTo.skillNode3"),
                t("chains.howTo.skillNode4"),
              ]}
              flowTitle={t("chains.howTo.skillFlowTitle")}
              steps={[
                t("chains.howTo.skillStep1"),
                t("chains.howTo.skillStep2"),
                t("chains.howTo.skillStep3"),
                t("chains.howTo.skillStep4"),
                t("chains.howTo.skillStep5"),
                t("chains.howTo.skillStep6"),
              ]}
              result={t("chains.howTo.skillResult")}
            />

            <ExampleSection
              title={t("chains.howTo.roleTitle")}
              mode={t("chains.howTo.roleMode")}
              goal={t("chains.howTo.roleGoal")}
              rosterTitle={t("chains.howTo.roleRosterTitle")}
              roster={[
                t("chains.howTo.roleNode1"),
                t("chains.howTo.roleNode2"),
                t("chains.howTo.roleNode3"),
                t("chains.howTo.roleNode4"),
                t("chains.howTo.roleNode5"),
              ]}
              flowTitle={t("chains.howTo.roleFlowTitle")}
              steps={[
                t("chains.howTo.roleStep1"),
                t("chains.howTo.roleStep2"),
                t("chains.howTo.roleStep3"),
                t("chains.howTo.roleStep4"),
                t("chains.howTo.roleStep5"),
                t("chains.howTo.roleStep6"),
              ]}
              result={t("chains.howTo.roleResult")}
            />

            <p className="team-jobs-howto__tip">{t("chains.howTo.tip")}</p>
          </div>

          <div className="team-jobs-howto__footer">
            <button
              type="button"
              className="primary"
              data-testid="team-jobs-howto-done"
              onClick={onClose}
            >
              {t("chains.howTo.done")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
