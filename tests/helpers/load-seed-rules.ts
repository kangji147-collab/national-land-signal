// 시험용: supabase/seed.sql 의 규칙표 줄에 migrations/003_rules_update.sql(규칙표 보강)·004_area_rule.sql(면적 규칙)을 덮어 읽는다. (DB에 접속하지 않음)
// 실제 DB도 같은 순서로 만들어진다: 예시 데이터(seed) → 보강(003, 같은 (구분, 이름)이면 덮어씀).
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RuleRow } from "../../lib/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "supabase");

const ROW = /\(\s*'(지목|용도지역|지역지구|질문|면적)'\s*,\s*'([^']+)'\s*,\s*'(green|yellow|red)'\s*,\s*'((?:[^']|'')*)'\s*,\s*(\d{4})\s*\)/g;

function read(file: string): RuleRow[] {
  const sql = readFileSync(resolve(root, file), "utf8");
  return [...sql.matchAll(ROW)].map((m) => ({
    category: m[1] as RuleRow["category"],
    name: m[2],
    signal: m[3] as RuleRow["signal"],
    reason: m[4].replace(/''/g, "'"),
    base_year: Number(m[5]),
  }));
}

/** 예시 데이터만 (보강 전) */
export function loadSeedRulesOnly(): RuleRow[] {
  return read("seed.sql");
}

/** 예시 데이터 + 규칙표 보강 (실제 DB와 같은 내용) */
export function loadSeedRules(): RuleRow[] {
  const byKey = new Map<string, RuleRow>();
  for (const r of [...read("seed.sql"), ...read("migrations/003_rules_update.sql"), ...read("migrations/004_area_rule.sql")]) byKey.set(`${r.category}|${r.name}`, r);
  return [...byKey.values()];
}
