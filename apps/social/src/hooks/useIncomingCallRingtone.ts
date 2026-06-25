/**
 * Play/stop the incoming-call ringtone while the modal is visible.
 */

import { useEffect } from "react";
import { startIncomingCallRingtone, stopIncomingCallRingtone } from "../lib/incoming-call-ringtone.js";

export function useIncomingCallRingtone(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    startIncomingCallRingtone();
    return () => {
      stopIncomingCallRingtone();
    };
  }, [active]);
}
