export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function topKByCosine<T extends { vector: readonly number[] }>(
  queryVector: readonly number[],
  items: readonly T[],
  limit: number,
): Array<T & { score: number }> {
  if (limit <= 0 || items.length === 0) {
    return [];
  }
  return items
    .map((item) => ({ ...item, score: cosineSimilarity(queryVector, item.vector) }))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
