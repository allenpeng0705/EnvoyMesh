import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  blobToVector,
  createCollectionAnnIndex,
  hitFromRecord,
  vectorToBlob,
  type CollectionAnnIndex,
} from "./hnsw-collection-index.js";
import type { VectorRecord, VectorSearchHit, VectorStore } from "./vector-store.js";

export interface CreateSqliteVectorStoreInput {
  profileDir: string;
  modelKey: string;
}

const DB_FILE = "rag-vectors.sqlite";

interface StoredRow {
  label: number;
  id: string;
  collection: string;
  source_key: string;
  text_preview: string;
  metadata_json: string | null;
  vector_blob: Buffer | Uint8Array;
}

export function collectionIndexPath(profileDir: string, collection: string): string {
  const hash = createHash("sha256").update(collection).digest("hex").slice(0, 16);
  return join(profileDir, "rag-hnsw", `${hash}.hnsw`);
}

export async function createSqliteVectorStore(input: CreateSqliteVectorStoreInput): Promise<VectorStore> {
  await mkdir(join(input.profileDir, "rag-hnsw"), { recursive: true });
  await migrateJsonIndexIfPresent(input.profileDir, input.modelKey);

  const dbPath = join(input.profileDir, DB_FILE);
  await mkdir(input.profileDir, { recursive: true });
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS rag_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rag_vectors (
      label INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT NOT NULL UNIQUE,
      collection TEXT NOT NULL,
      source_key TEXT NOT NULL,
      text_preview TEXT NOT NULL,
      metadata_json TEXT,
      vector_blob BLOB NOT NULL,
      model_key TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_rag_vectors_collection ON rag_vectors(collection);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_vectors_collection_source
      ON rag_vectors(collection, source_key);
  `);

  const storedModelKey = readMeta(db, "model_key");
  if (storedModelKey && storedModelKey !== input.modelKey) {
    db.exec("DELETE FROM rag_vectors");
    writeMeta(db, "model_key", input.modelKey);
    await cleanupHnswFiles(input.profileDir);
  } else if (!storedModelKey) {
    writeMeta(db, "model_key", input.modelKey);
  }

  const annByCollection = new Map<string, CollectionAnnIndex>();
  const dimensionByCollection = new Map<string, number>();
  const dirtyCollections = new Set<string>();

  function rowToRecord(row: StoredRow): VectorRecord {
    const dimension = dimensionForCollection(row.collection, row.vector_blob);
    return {
      id: row.id,
      collection: row.collection,
      sourceKey: row.source_key,
      textPreview: row.text_preview,
      vector: blobToVector(row.vector_blob, dimension),
      metadata: row.metadata_json ? (JSON.parse(row.metadata_json) as Record<string, string>) : undefined,
    };
  }

  function dimensionForCollection(collection: string, sampleBlob?: unknown): number {
    const cached = dimensionByCollection.get(collection);
    if (cached) return cached;
    if (sampleBlob != null) {
      const buf = Buffer.isBuffer(sampleBlob)
        ? sampleBlob
        : sampleBlob instanceof Uint8Array
          ? Buffer.from(sampleBlob)
          : Buffer.from(sampleBlob as ArrayLike<number>);
      const dim = Math.floor(buf.length / 4);
      dimensionByCollection.set(collection, dim);
      return dim;
    }
    const row = db
      .prepare("SELECT vector_blob FROM rag_vectors WHERE collection = ? LIMIT 1")
      .get(collection) as { vector_blob: unknown } | undefined;
    const dim = row?.vector_blob != null
      ? dimensionForCollection(collection, row.vector_blob)
      : 384;
    dimensionByCollection.set(collection, dim);
    return dim;
  }

  function rowsForCollection(collection: string): Array<{ label: number; vector_blob: unknown }> {
    return db
      .prepare(
        "SELECT label, vector_blob FROM rag_vectors WHERE collection = ? AND model_key = ? ORDER BY label ASC",
      )
      .all(collection, input.modelKey) as Array<{ label: number; vector_blob: unknown }>;
  }

  function loadAnn(collection: string): CollectionAnnIndex {
    if (annByCollection.has(collection) && !dirtyCollections.has(collection)) {
      return annByCollection.get(collection)!;
    }

    const rows = rowsForCollection(collection);
    const dim = rows[0]
      ? dimensionForCollection(collection, rows[0].vector_blob)
      : dimensionForCollection(collection);
    dimensionByCollection.set(collection, dim);
    const ann = createCollectionAnnIndex(dim);
    const filePath = collectionIndexPath(input.profileDir, collection);
    if (!ann.tryLoadFromFile(filePath, rows.length)) {
      ann.rebuild(
        rows.map((row) => ({
          label: row.label,
          vector: blobToVector(row.vector_blob, dim),
        })),
      );
    }

    annByCollection.set(collection, ann);
    dirtyCollections.delete(collection);
    return ann;
  }

  const store: VectorStore = {
    modelKey: input.modelKey,
    async upsert(batch) {
      const insert = db.prepare(`
        INSERT INTO rag_vectors (id, collection, source_key, text_preview, metadata_json, vector_blob, model_key)
        VALUES (@id, @collection, @source_key, @text_preview, @metadata_json, @vector_blob, @model_key)
        ON CONFLICT(id) DO UPDATE SET
          collection = excluded.collection,
          source_key = excluded.source_key,
          text_preview = excluded.text_preview,
          metadata_json = excluded.metadata_json,
          vector_blob = excluded.vector_blob,
          model_key = excluded.model_key
      `);

      const touched = new Set<string>();
      db.exec("BEGIN");
      try {
        for (const record of batch) {
          touched.add(record.collection);
          dimensionByCollection.set(record.collection, record.vector.length);
          insert.run({
            id: record.id,
            collection: record.collection,
            source_key: record.sourceKey,
            text_preview: record.textPreview,
            metadata_json: record.metadata ? JSON.stringify(record.metadata) : null,
            vector_blob: vectorToBlob(record.vector),
            model_key: input.modelKey,
          });
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      for (const collection of touched) {
        dirtyCollections.add(collection);
        annByCollection.delete(collection);
      }
    },

    async deleteCollection(collection) {
      db.prepare("DELETE FROM rag_vectors WHERE collection = ?").run(collection);
      annByCollection.delete(collection);
      dimensionByCollection.delete(collection);
      dirtyCollections.delete(collection);
      await unlink(collectionIndexPath(input.profileDir, collection)).catch(() => undefined);
    },

    async deleteBySourceKey(collection, sourceKey) {
      db.prepare("DELETE FROM rag_vectors WHERE collection = ? AND source_key = ?").run(collection, sourceKey);
      dirtyCollections.add(collection);
      annByCollection.delete(collection);
    },

    async deleteByDocumentId(collection, documentId) {
      db.prepare("DELETE FROM rag_vectors WHERE collection = ? AND source_key LIKE ?").run(
        collection,
        `${documentId}:%`,
      );
      dirtyCollections.add(collection);
      annByCollection.delete(collection);
    },

    search(collection, queryVector, limit) {
      if (limit <= 0) return [];
      dimensionByCollection.set(collection, queryVector.length);
      const ann = loadAnn(collection);
      const hits = ann.search(queryVector, limit);
      if (hits.length === 0) return [];

      const placeholders = hits.map(() => "?").join(", ");
      const labels = hits.map((hit) => hit.label);
      const rows = db
        .prepare(`SELECT * FROM rag_vectors WHERE label IN (${placeholders})`)
        .all(...labels) as unknown as StoredRow[];
      const byLabel = new Map(rows.map((row) => [row.label, row]));
      const results: VectorSearchHit[] = [];
      for (const hit of hits) {
        const row = byLabel.get(hit.label);
        if (!row) continue;
        results.push(hitFromRecord(rowToRecord(row), hit.score));
      }
      return results;
    },

    listCollection(collection) {
      const rows = db
        .prepare("SELECT * FROM rag_vectors WHERE collection = ? AND model_key = ? ORDER BY label ASC")
        .all(collection, input.modelKey) as unknown as StoredRow[];
      return rows.map(rowToRecord);
    },

    async flush() {
      const pending = [...dirtyCollections];
      for (const collection of pending) {
        const ann = loadAnn(collection);
        const filePath = collectionIndexPath(input.profileDir, collection);
        const tmp = join(input.profileDir, "rag-hnsw", `.tmp-${randomUUID()}.hnsw`);
        ann.persist(tmp);
        await unlink(filePath).catch(() => undefined);
        await rename(tmp, filePath);
      }
      dirtyCollections.clear();
    },
  };

  return store;
}

function readMeta(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM rag_meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value;
}

function writeMeta(db: DatabaseSync, key: string, value: string): void {
  db.prepare(
    "INSERT INTO rag_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

async function cleanupHnswFiles(profileDir: string): Promise<void> {
  const dir = join(profileDir, "rag-hnsw");
  try {
    const { readdir } = await import("node:fs/promises");
    const files = await readdir(dir);
    await Promise.all(files.map((file) => unlink(join(dir, file)).catch(() => undefined)));
  } catch {
    // ignore
  }
}

async function migrateJsonIndexIfPresent(profileDir: string, modelKey: string): Promise<void> {
  const jsonPath = join(profileDir, "rag-vectors.json");
  try {
    const raw = await readFile(jsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: string; modelKey?: string; records?: VectorRecord[] };
    if (parsed.version !== "0.1" || !Array.isArray(parsed.records) || parsed.modelKey !== modelKey) {
      return;
    }
    const dbPath = join(profileDir, DB_FILE);
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS rag_vectors (
        label INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        collection TEXT NOT NULL,
        source_key TEXT NOT NULL,
        text_preview TEXT NOT NULL,
        metadata_json TEXT,
        vector_blob BLOB NOT NULL,
        model_key TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS rag_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    const insert = db.prepare(`
      INSERT OR IGNORE INTO rag_vectors (id, collection, source_key, text_preview, metadata_json, vector_blob, model_key)
      VALUES (@id, @collection, @source_key, @text_preview, @metadata_json, @vector_blob, @model_key)
    `);
    for (const record of parsed.records) {
      insert.run({
        id: record.id,
        collection: record.collection,
        source_key: record.sourceKey,
        text_preview: record.textPreview,
        metadata_json: record.metadata ? JSON.stringify(record.metadata) : null,
        vector_blob: vectorToBlob(record.vector),
        model_key: modelKey,
      });
    }
    writeMeta(db, "model_key", modelKey);
    await unlink(jsonPath).catch(() => undefined);
  } catch {
    // no migration needed
  }
}
