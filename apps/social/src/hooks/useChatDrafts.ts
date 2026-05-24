import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChatDraft } from "@envoymesh/api";
import { useNodeService } from "./useNodeService.js";

function sortDrafts(drafts: ChatDraft[]): ChatDraft[] {
  return [...drafts].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

export function useChatDrafts(threadPeerOwnerId: string | null, enabled: boolean) {
  const nodeService = useNodeService();
  const [drafts, setDrafts] = useState<ChatDraft[]>([]);

  useEffect(() => {
    if (!threadPeerOwnerId || !enabled) {
      setDrafts([]);
      return;
    }

    let cancelled = false;
    void nodeService.getChatDrafts(threadPeerOwnerId).then((list) => {
      if (!cancelled) setDrafts(sortDrafts(list));
    });

    return () => {
      cancelled = true;
    };
  }, [threadPeerOwnerId, enabled, nodeService]);

  useEffect(() => {
    if (!threadPeerOwnerId || !enabled) return;

    return nodeService.on("chat:draft", ({ threadPeerOwnerId: tid, draft }) => {
      if (tid !== threadPeerOwnerId) return;
      setDrafts((prev) => sortDrafts([...prev.filter((d) => d.draftId !== draft.draftId), draft]));
    });
  }, [threadPeerOwnerId, enabled, nodeService]);

  const dismissDraft = useCallback(
    async (draftId: string) => {
      await nodeService.deleteChatDraft(draftId);
      setDrafts((prev) => prev.filter((d) => d.draftId !== draftId));
    },
    [nodeService],
  );

  const latestDraft = useMemo(() => drafts[drafts.length - 1] ?? null, [drafts]);

  return { drafts, latestDraft, dismissDraft };
}
