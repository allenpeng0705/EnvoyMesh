/**
 * Programmatic incoming-call ringtone (Web Audio API).
 *
 * Avoids bundling binary assets; works in desktop Social and Capacitor WebView.
 * Browsers may block audio until the user has interacted with the page once.
 */

const RING_FREQS_HZ = [440, 480] as const;
const RING_GAIN = 0.12;
/** Single tone burst length (seconds). */
const BURST_SEC = 0.9;
/** Gap between the two bursts in one ring cycle (seconds). */
const INTER_BURST_SEC = 0.25;
/** Pause before the next double-ring cycle (seconds). */
const CYCLE_PAUSE_SEC = 2.4;

export type IncomingCallRingtone = {
  start: () => void;
  stop: () => void;
  isPlaying: () => boolean;
};

type AudioContextCtor = typeof AudioContext;

function getAudioContextClass(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext;
}

export function createIncomingCallRingtone(): IncomingCallRingtone {
  let audioContext: AudioContext | null = null;
  let cycleTimer: ReturnType<typeof setInterval> | null = null;
  let interBurstTimer: ReturnType<typeof setTimeout> | null = null;
  let playing = false;

  function disconnectBurstNodes(nodes: AudioNode[]): void {
    for (const node of nodes) {
      try {
        if (node instanceof OscillatorNode) node.stop();
        node.disconnect();
      } catch {
        /* already stopped */
      }
    }
  }

  function playBurst(): AudioNode[] {
    if (!audioContext) return [];

    const nodes: AudioNode[] = [];
    const gain = audioContext.createGain();
    gain.gain.value = RING_GAIN;
    gain.connect(audioContext.destination);
    nodes.push(gain);

    const startAt = audioContext.currentTime;
    const endAt = startAt + BURST_SEC;

    for (const freq of RING_FREQS_HZ) {
      const osc = audioContext.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(startAt);
      osc.stop(endAt);
      nodes.push(osc);
    }

    return nodes;
  }

  function runRingCycle(): void {
    if (!audioContext || !playing) return;

    let burstNodes = playBurst();

    interBurstTimer = setTimeout(() => {
      if (!playing) {
        disconnectBurstNodes(burstNodes);
        return;
      }
      disconnectBurstNodes(burstNodes);
      burstNodes = playBurst();
      interBurstTimer = setTimeout(() => {
        disconnectBurstNodes(burstNodes);
      }, BURST_SEC * 1000 + 50);
    }, (BURST_SEC + INTER_BURST_SEC) * 1000);
  }

  return {
    start() {
      if (playing) return;
      const Ctx = getAudioContextClass();
      if (!Ctx) return;

      playing = true;
      audioContext = new Ctx();
      void audioContext.resume().catch(() => {
        /* autoplay policy — ring may be silent until next user gesture */
      });

      runRingCycle();
      const cycleMs = (BURST_SEC * 2 + INTER_BURST_SEC + CYCLE_PAUSE_SEC) * 1000;
      cycleTimer = setInterval(runRingCycle, cycleMs);
    },

    stop() {
      playing = false;
      if (cycleTimer) {
        clearInterval(cycleTimer);
        cycleTimer = null;
      }
      if (interBurstTimer) {
        clearTimeout(interBurstTimer);
        interBurstTimer = null;
      }
      const ctx = audioContext;
      audioContext = null;
      void ctx?.close().catch(() => {});
    },

    isPlaying() {
      return playing;
    },
  };
}

/** Module singleton so overlapping mounts do not stack ringtone instances. */
let activeRingtone: IncomingCallRingtone | null = null;

export function startIncomingCallRingtone(): void {
  if (activeRingtone?.isPlaying()) return;
  activeRingtone?.stop();
  activeRingtone = createIncomingCallRingtone();
  activeRingtone.start();
}

export function stopIncomingCallRingtone(): void {
  activeRingtone?.stop();
  activeRingtone = null;
}
