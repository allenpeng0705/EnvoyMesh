/**
 * libp2p uses `CustomEvent` in some dependency paths; older Node runtimes may not define it globally.
 * Import this module before any `@envoymesh/network` import in node entrypoints.
 */
const g = globalThis as typeof globalThis & {
  CustomEvent?: typeof CustomEvent;
};

if (typeof g.CustomEvent === "undefined") {
  type MinimalCustomEventInit<T> = {
    bubbles?: boolean;
    cancelable?: boolean;
    composed?: boolean;
    detail?: T;
  };

  class MinimalCustomEvent<T = unknown> extends Event {
    readonly detail: T | null;

    constructor(type: string, eventInitDict?: MinimalCustomEventInit<T>) {
      super(type, eventInitDict);
      this.detail = eventInitDict?.detail ?? null;
    }
  }

  g.CustomEvent = MinimalCustomEvent as unknown as typeof CustomEvent;
}
