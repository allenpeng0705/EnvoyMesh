import type { NodeServiceClient } from "../../src/hooks/useNodeService.js";

/**
 * Why this exists.
 *
 * `vi.mock(path, factory)` types the factory as `ModuleMockFactoryWithHelper<unknown>`
 * — `(importOriginal) => Awaitable<Partial<unknown>>` — so a stub that names a
 * member `NodeServiceClient` no longer has compiles fine and fails at run time as
 * `nodeService.someRemovedMethod is not a function`. `vi.mock<typeof import(...)>`
 * checks the factory, but it must be written at every call site and forces each
 * stub to be annotated as `Partial<typeof module>` by hand.
 *
 * This wrapper checks the stub the same way while keeping the stub's *own*
 * inferred type, so `mock.chainListActive.mockResolvedValue(...)` in a test still
 * typechecks and members that are simply not mocked stay allowed:
 *
 *   const mockNodeService = partialNodeService({
 *     chainListActive: vi.fn(),
 *     getOpenClawStatus: vi.fn(),   // removed upstream? -> compile error here
 *   });
 *
 * The `never` mapping is what turns an unknown key into an error without changing
 * the wrapper's return type (a plain `stub: Partial<NodeServiceClient>` parameter
 * would erase the mock methods and a plain generic constraint does not reject
 * excess keys).
 *
 * What it does NOT catch: a member the component under test calls but the stub
 * omits. `Partial` deliberately allows omissions, so that failure stays
 * runtime-only — this guard is about *stale* names, not *missing* ones.
 */
type CheckedStub<T extends Partial<NodeServiceClient>> = T &
  Record<Exclude<keyof T, keyof NodeServiceClient>, never>;

export function partialNodeService<T extends Partial<NodeServiceClient>>(
  stub: CheckedStub<T>,
): T {
  return stub;
}
