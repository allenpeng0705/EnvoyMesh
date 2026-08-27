/**
 * Agent Network settings modal — opened from Team jobs (ChainsView) header.
 *
 * Three tiers:
 *
 *   1. Network setup (always visible) — Office LAN (Join + LAN auto-bond +
 *      shared fleet token in one section)
 *   2. Advanced (collapsed by default):
 *        a. Team job defaults (award mode, rebalance, stall — runtime knobs
 *           that are too low-level for the main Team jobs screen; per-job
 *           overrides live inside New team job → Job settings instead).
 *        b. Fleet onboarding: Pairing kiosk + Fleet manifest
 *        c. Misc: Bond autonomy, Setup sponsor friend
 *
 * Company invites was removed — use the Family invite QR in Settings instead.
 * Daily-use controls (Join toggle, worker pool status) stay inline in
 * ChainsView so the owner can see & flip them without opening a modal.
 */
import { useState, type ReactNode } from "react";

import { ModalPortal } from "./ModalPortal.js";
import { useT } from "../context/I18nContext.js";
import { ChainDefaultsPanel } from "./views/settings/ChainDefaultsPanel.js";
import {
  BondAutonomySection,
  FleetManifestSection,
  OfficeLanPresetSection,
  PairingKioskSection,
  SetupSponsorFriendSection,
  AgentNetworkTestSection,
} from "./views/settings/agent-network-sections.js";

interface AgentNetworkSettingsModalProps {
  onClose: () => void;
}

/** Collapsible accordion section with a clickable header. */
function AccordionGroup({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="an-modal__group">
      <button
        type="button"
        className="an-modal__group-header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="an-modal__group-chevron">{open ? "▾" : "▸"}</span>
        <span className="an-modal__group-title">{title}</span>
      </button>
      {open ? <div className="an-modal__group-body">{children}</div> : null}
    </div>
  );
}

export function AgentNetworkSettingsModal({ onClose }: AgentNetworkSettingsModalProps) {
  const t = useT();

  return (
    <ModalPortal>
      <div
        className="modal-overlay"
        role="presentation"
        onClick={onClose}
      >
        <div
          className="modal-panel an-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="an-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <h2 id="an-modal-title">{t("chains.manageWorkers.title")}</h2>
            <button
              type="button"
              className="modal-close"
              aria-label={t("common.close", "Close")}
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <>
            <p className="an-modal__intro">{t("chains.manageWorkers.intro")}</p>

              <OfficeLanPresetSection />

              <AgentNetworkTestSection />

              <AccordionGroup
                title={t("chains.manageWorkers.advancedGroup")}
                defaultOpen={false}
              >
                {/* Team job / chain runtime defaults (award mode, rebalance,
                    stall, etc.) — truly global infrastructure knobs that don't
                    make sense per-job, so they live in Advanced rather than
                    cluttering the main Team jobs screen. Per-job overrides
                    (refinement rounds, judge mode, extend cap) live inside
                    the "New team job" dialog → Job settings. */}
                <div className="an-modal__subgroup">
                  <ChainDefaultsPanel />
                </div>
                <PairingKioskSection />
                <FleetManifestSection />
                <BondAutonomySection />
                <SetupSponsorFriendSection />
              </AccordionGroup>
            </>
        </div>
      </div>
    </ModalPortal>
  );
}
