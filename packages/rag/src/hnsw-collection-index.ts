import { HierarchicalNSW } from "hnswlib-node";
import type { VectorRecord, VectorSearchHit } from "./vector-store.js";

export interface CollectionAnnIndex {
  search(queryVector: readonly number[], limit: number): Array<{ label: number; score: number }>;
  rebuild(records: Array<{ label: number; vector: number[] }>): void;
  tryLoadFromFile(filePath: string, expectedCount: number): boolean;
  persist(filePath: string): void;
}

export function createCollectionAnnIndex(dimension: number): CollectionAnnIndex {
  let index: HierarchicalNSW | null = null;

  function ensureFresh(maxElements: number): HierarchicalNSW {
    index = new HierarchicalNSW("cosine", dimension);
    index.initIndex(Math.max(maxElements, 16), 16, 200, 100, true);
    index.setEf(64);
    return index;
  }

  return {
    search(queryVector, limit) {
      if (!index || index.getCurrentCount() === 0) {
        return [];
      }
      const result = index.searchKnn([...queryVector], limit);
      const neighbors: Array<{ label: number; score: number }> = [];
      for (let i = 0; i < result.neighbors.length; i++) {
        const label = result.neighbors[i];
        const distance = result.distances[i] ?? 0;
        if (label === undefined) continue;
        neighbors.push({ label, score: Math.max(0, 1 - distance) });
      }
      return neighbors;
    },
    rebuild(records) {
      const hnsw = ensureFresh(records.length + 16);
      for (const record of records) {
        if (record.vector.length !== dimension) continue;
        hnsw.addPoint(record.vector, record.label, true);
      }
    },
    tryLoadFromFile(filePath, expectedCount) {
      if (expectedCount <= 0) {
        index = null;
        return false;
      }
      try {
        const loaded = new HierarchicalNSW("cosine", dimension);
        loaded.readIndexSync(filePath, true);
        if (loaded.getCurrentCount() !== expectedCount) {
          return false;
        }
        loaded.setEf(64);
        index = loaded;
        return true;
      } catch {
        return false;
      }
    },
    persist(filePath) {
      if (!index) return;
      index.writeIndexSync(filePath);
    },
  };
}

export function vectorToBlob(vector: readonly number[]): Buffer {
  const buf = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buf.writeFloatLE(vector[i] ?? 0, i * 4);
  }
  return buf;
}

export function blobToVector(blob: unknown, dimension: number): number[] {
  if (blob == null) return [];
  const buf = Buffer.isBuffer(blob)
    ? blob
    : blob instanceof Uint8Array
      ? Buffer.from(blob)
      : Buffer.from(blob as ArrayLike<number>);
  const count = Math.floor(buf.length / 4);
  const out: number[] = [];
  for (let i = 0; i < count && i < dimension; i++) {
    out.push(buf.readFloatLE(i * 4));
  }
  return out;
}

export function hitFromRecord(record: VectorRecord, score: number): VectorSearchHit {
  return { ...record, score };
}
