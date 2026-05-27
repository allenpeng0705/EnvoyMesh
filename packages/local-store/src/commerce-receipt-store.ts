import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const COMMERCE_RECEIPTS_FILE = "commerce-receipts.json";

export interface CommerceReceiptRecord {
  receiptId: string;
  taskId: string;
  mandateId?: string;
  counterpartyOwnerId: string;
  documentId: string;
  relativePath: string;
  contentHash: string;
  cid?: string;
  direction: "inbound" | "outbound";
  summary: string;
  messageId?: string;
  createdAt: string;
}

interface CommerceReceiptFile {
  version: "0.1";
  receipts: CommerceReceiptRecord[];
}

export interface ListCommerceReceiptsParams {
  counterpartyOwnerId?: string;
  limit?: number;
}

export interface CommerceReceiptStore {
  append(record: CommerceReceiptRecord): Promise<CommerceReceiptRecord>;
  list(params?: ListCommerceReceiptsParams): Promise<CommerceReceiptRecord[]>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readFileJson(path: string): Promise<CommerceReceiptFile> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as CommerceReceiptFile;
    if (parsed.version === "0.1" && Array.isArray(parsed.receipts)) {
      return parsed;
    }
  } catch (error) {
    if (!isMissingFileError(error)) throw error;
  }
  return { version: "0.1", receipts: [] };
}

export function createCommerceReceiptStore(profileDir: string): CommerceReceiptStore {
  const path = join(profileDir, COMMERCE_RECEIPTS_FILE);

  return {
    async append(record) {
      const file = await readFileJson(path);
      file.receipts.push(record);
      await mkdir(profileDir, { recursive: true });
      await writeFile(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
      return record;
    },

    async list(params) {
      const file = await readFileJson(path);
      let rows = [...file.receipts];
      const counterparty = params?.counterpartyOwnerId?.trim();
      if (counterparty) {
        rows = rows.filter((row) => row.counterpartyOwnerId === counterparty);
      }
      rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const limit = params?.limit ?? 50;
      return rows.slice(0, limit);
    },
  };
}
