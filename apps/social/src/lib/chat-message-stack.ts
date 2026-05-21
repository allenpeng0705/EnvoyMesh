/** Position of a bubble inside a consecutive run from the same side (sender). */
export type MessageStackPosition = "single" | "first" | "middle" | "last";

/** Split a chronological list into runs of consecutive items in the same group. */
export function buildMessageStacks<T>(
  items: readonly T[],
  sameGroup: (prev: T, next: T) => boolean,
): T[][] {
  if (items.length === 0) return [];
  const stacks: T[][] = [];
  let current: T[] = [items[0]];
  for (let i = 1; i < items.length; i++) {
    const item = items[i];
    const prev = items[i - 1];
    if (sameGroup(prev, item)) {
      current.push(item);
    } else {
      stacks.push(current);
      current = [item];
    }
  }
  stacks.push(current);
  return stacks;
}

export function stackPosition(index: number, stackLength: number): MessageStackPosition {
  if (stackLength <= 1) return "single";
  if (index === 0) return "first";
  if (index === stackLength - 1) return "last";
  return "middle";
}

export function stackPositionClass(position: MessageStackPosition): string {
  return `group-${position}`;
}
