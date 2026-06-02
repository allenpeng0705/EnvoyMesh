import { useEffect } from "react";
import type { AutoReplyPausedNotification } from "@envoymesh/api";
import { useT } from "../context/I18nContext.js";
import { useNodeService } from "../hooks/useNodeService.js";
import { useToast } from "../hooks/useToast.js";

export function AutoReplyPausedNotifier() {
  const t = useT();
  const nodeService = useNodeService();
  const { showToast } = useToast();

  useEffect(() => {
    const unsub = nodeService.on("chat:auto-reply-paused", (data) => {
      const notification = data as AutoReplyPausedNotification;
      const message =
        notification.reason === "daily_cap"
          ? t("settings.ai.limits.toastDaily", {
              name: notification.contactDisplayName,
              count: notification.dailyCount,
              max: notification.maxPerContactPerDay,
            })
          : t("settings.ai.limits.toastHourly", {
              name: notification.contactDisplayName,
              count: notification.hourlyCount,
              max: notification.maxPerContactPerHour,
            });
      showToast(message, "info");
    });
    return unsub;
  }, [nodeService, showToast, t]);

  return null;
}
