/**
 * End-user guide for Terminals — plain shell, Envoy, and Pi.
 * Opened from the Terminals sidebar header.
 */

import { ModalPortal } from "./ModalPortal.js";
import { useT } from "../context/I18nContext.js";

interface TerminalsHowToModalProps {
  onClose: () => void;
}

function ExampleSection(props: {
  title: string;
  mode: string;
  goal: string;
  flowTitle: string;
  steps: string[];
  result: string;
}) {
  return (
    <section className="howto-modal__section howto-modal__section--example">
      <h3 className="howto-modal__heading">{props.title}</h3>
      <p className="howto-modal__mode">{props.mode}</p>
      <p className="howto-modal__example-goal">{props.goal}</p>
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

export function TerminalsHowToModal({ onClose }: TerminalsHowToModalProps) {
  const t = useT();

  return (
    <ModalPortal>
      <div className="modal-overlay" role="presentation" onClick={onClose}>
        <div
          className="modal-panel howto-modal terminals-howto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="terminals-howto-title"
          data-testid="terminals-howto-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 id="terminals-howto-title">{t("terminals.howTo.title")}</h2>
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
            <p className="howto-modal__intro">{t("terminals.howTo.intro")}</p>

            <section className="howto-modal__section">
              <h3 className="howto-modal__heading">{t("terminals.howTo.beforeTitle")}</h3>
              <ol className="howto-modal__steps">
                <li>{t("terminals.howTo.before1")}</li>
                <li>{t("terminals.howTo.before2")}</li>
                <li>{t("terminals.howTo.before3")}</li>
              </ol>
            </section>

            <ExampleSection
              title={t("terminals.howTo.shellTitle")}
              mode={t("terminals.howTo.shellMode")}
              goal={t("terminals.howTo.shellGoal")}
              flowTitle={t("terminals.howTo.shellFlowTitle")}
              steps={[
                t("terminals.howTo.shellStep1"),
                t("terminals.howTo.shellStep2"),
                t("terminals.howTo.shellStep3"),
                t("terminals.howTo.shellStep4"),
              ]}
              result={t("terminals.howTo.shellResult")}
            />

            <ExampleSection
              title={t("terminals.howTo.envoyTitle")}
              mode={t("terminals.howTo.envoyMode")}
              goal={t("terminals.howTo.envoyGoal")}
              flowTitle={t("terminals.howTo.envoyFlowTitle")}
              steps={[
                t("terminals.howTo.envoyStep1"),
                t("terminals.howTo.envoyStep2"),
                t("terminals.howTo.envoyStep3"),
                t("terminals.howTo.envoyStep4"),
                t("terminals.howTo.envoyStep5"),
              ]}
              result={t("terminals.howTo.envoyResult")}
            />

            <ExampleSection
              title={t("terminals.howTo.piTitle")}
              mode={t("terminals.howTo.piMode")}
              goal={t("terminals.howTo.piGoal")}
              flowTitle={t("terminals.howTo.piFlowTitle")}
              steps={[
                t("terminals.howTo.piStep1"),
                t("terminals.howTo.piStep2"),
                t("terminals.howTo.piStep3"),
                t("terminals.howTo.piStep4"),
              ]}
              result={t("terminals.howTo.piResult")}
            />

            <p className="howto-modal__tip">{t("terminals.howTo.tip")}</p>
          </div>

          <div className="howto-modal__footer">
            <button
              type="button"
              className="primary"
              data-testid="terminals-howto-done"
              onClick={onClose}
            >
              {t("terminals.howTo.done")}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
