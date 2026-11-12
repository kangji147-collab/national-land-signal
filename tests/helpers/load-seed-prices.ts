// 시험용: supabase/seed.sql 의 단가표 줄을 읽어 온다. (DB에 접속하지 않음)
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { PriceRow } from "../../lib/calc";

const seedPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase", "seed.sql");

// ('테마', '항목', 최소, 최대, '단위', '출처', 연도)
const ROW =
  /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*'([^']+)'\s*,\s*'([^']*)'\s*,\s*(\d{4})\s*\)/g;

export function loadSeedPrices(): PriceRow[] {
  const sql = readFileSync(seedPath, "utf8");
  return [...sql.matchAll(ROW)].map((m) => ({
    theme: m[1],
    item: m[2],
    min_value: Number(m[3]),
    max_value: Number(m[4]),
    unit: m[5],
    source: m[6],
    base_year: Number(m[7]),
  }));
}
