/**
 * Scoped caller context — the transport-neutral mechanism.
 *
 * Enabling change 2 of the host extraction. This module owns *how* an
 * asynchronous operation carries "who is asking" across `await` boundaries
 * (`AsyncLocalStorage`); it deliberately owns nothing about *what* a caller is.
 * Naming a caller, deciding what a caller may do, and building a caller from a
 * session token are all policy, and live in `rpc-caller-context.ts`.
 *
 * A host/connect package can depend on this file without inheriting EnvoyMesh's
 * family-profile and owner-session authorisation model.
 */

import { AsyncLocalStorage } from "node:async_hooks"

/** A scoped slot for one caller value per asynchronous execution branch. */
export interface CallerContextStore<TCaller> {
  /** Run `fn` — and everything it awaits — with `caller` as the current value. */
  run<TResult>(caller: TCaller, fn: () => Promise<TResult>): Promise<TResult>
  /** The current value, or `undefined` outside any `run`. */
  get(): TCaller | undefined
  /**
   * Run `fn` with `caller` when it is available, otherwise with no caller set.
   * Convenience for call sites that have an optional caller.
   */
  runOptional<TResult>(
    caller: TCaller | undefined,
    fn: () => Promise<TResult>,
  ): Promise<TResult>
}

/**
 * Create an isolated scoped slot. Each call returns an independent store, so a
 * host can carry several unrelated contexts (RPC caller, request id, tenant)
 * without them colliding.
 */
export function createCallerContextStore<TCaller>(): CallerContextStore<TCaller> {
  const storage = new AsyncLocalStorage<TCaller>()
  return {
    run: (caller, fn) => storage.run(caller, fn),
    get: () => storage.getStore(),
    runOptional: (caller, fn) => (caller === undefined ? fn() : storage.run(caller, fn)),
  }
}
