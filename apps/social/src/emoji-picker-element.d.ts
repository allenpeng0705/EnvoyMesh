import type { DetailedHTMLProps, HTMLAttributes } from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "emoji-picker": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "emoji-picker": HTMLElement;
  }
}

export {};
