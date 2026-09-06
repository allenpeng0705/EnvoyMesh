import { useEffect, useMemo, useState } from "react";

import type { EnvoyHarnessStatus } from "@envoymesh/api";
import type { EhuiPanelId } from "@envoymesh/envoy-harness-client/ehui";
import {
  EhuiCommandRail,
  EhuiPanelModal,
} from "@envoymesh/envoy-harness-ehui";

import { useNodeService } from "../../hooks/useNodeService.js";
import { createRemoteEhuiDataSource } from "../../lib/envoy-harness-ehui-data-source.js";

export interface EnvoyHarnessEhuiRailProps {
  /** Bump after chat turns to refresh panel bodies. */
  refreshKey?: number;
  /** Scope EHUI session ops to this Envoy Harness chat id. */
  chatId?: string;
  className?: string;
}

export function EnvoyHarnessEhuiRail({
  refreshKey,
  chatId,
  className,
}: EnvoyHarnessEhuiRailProps) {
  const nodeService = useNodeService();
  const [status, setStatus] = useState<EnvoyHarnessStatus | null>(null);
  const [openPanel, setOpenPanel] = useState<EhuiPanelId | null>(null);
  const dataSource = useMemo(
    () =>
      createRemoteEhuiDataSource(
        nodeService,
        chatId !== undefined ? { chatId } : {},
      ),
    [nodeService, chatId],
  );

  useEffect(() => {
    void nodeService.getEnvoyHarnessStatus().then(setStatus).catch(() => {
      setStatus(null);
    });
  }, [nodeService, refreshKey]);

  if (status?.state !== "ready") {
    const hint =
      status?.state === "disabled"
        ? "Configure a model in Settings → AI."
        : status?.error ?? "envoy-harness is not ready.";
    return (
      <div className={className ?? "eh-ehui-command-bar eh-ehui-placeholder"}>
        <p className="eh-ehui-placeholder-text">{hint}</p>
      </div>
    );
  }

  return (
    <>
      <EhuiCommandRail
        className={className ?? "eh-ehui-command-bar contact-web-content__actions contact-web-content__actions--links"}
        linkClassName="contact-web-content__link"
        showSeparators
        onOpen={setOpenPanel}
      />
      {openPanel ? (
        <EhuiPanelModal
          panel={openPanel}
          dataSource={dataSource}
          refreshKey={refreshKey}
          onClose={() => setOpenPanel(null)}
          overlayClassName="modal-overlay"
          panelClassName="modal-panel eh-ehui-modal-panel"
          closeButtonClassName="modal-close"
          inputClassName="pi-chat-input eh-ehui-field"
        />
      ) : null}
    </>
  );
}
