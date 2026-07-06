import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

type DailyRecord = { date: string; count: number };

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export function createBondAutonomyDailyCounter(profileDir: string) {
  const path = join(profileDir, "bond-autonomy-daily.json");

  async function readRecord(): Promise<DailyRecord> {
    try {
      const raw = await readFile(path, "utf8");
      const parsed = JSON.parse(raw) as DailyRecord;
      if (parsed.date === todayUtc() && typeof parsed.count === "number") {
        return parsed;
      }
    } catch {
      // fresh day or missing file
    }
    return { date: todayUtc(), count: 0 };
  }

  return {
    async getCount(): Promise<number> {
      const record = await readRecord();
      return record.count;
    },
    async increment(): Promise<void> {
      const record = await readRecord();
      record.count += 1;
      await mkdir(profileDir, { recursive: true });
      await writeFile(path, JSON.stringify(record, null, 2), "utf8");
    },
  };
}
