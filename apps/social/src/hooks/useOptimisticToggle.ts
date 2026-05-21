import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";

/**
 * Keeps a checkbox in sync with server truth while reflecting clicks immediately,
 * avoiding the "two clicks" feel from controlled inputs + slow async persists.
 */
export function useOptimisticToggle(
  serverValue: boolean,
  persist: (next: boolean) => Promise<void>,
) {
  const [local, setLocal] = useState(serverValue);

  useEffect(() => {
    setLocal(serverValue);
  }, [serverValue]);

  const onCheckboxChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked;
    setLocal(next);
    void persist(next).catch(() => setLocal(serverValue));
  };

  return { checked: local, onCheckboxChange };
}
