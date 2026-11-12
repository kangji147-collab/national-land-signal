// 시험 사례 20건(tests/cases/*.json)으로 판정 규칙을 채점한다. (PLAN 작업 1·5·22번)
// - 모든 칸을 채운 사례만 채점한다. (아직 비어 있는 사례는 건너뜀)
// - 사례 20건이 모두 준비되면 목표(일치 90% 이상, 위험한 오판정 0건)까지 확인한다.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { judge } from "../lib/judge";
import { regionOf } from "../lib/judge-request";
import type { Answer, JudgeInput, QuestionKey, Signal } from "../lib/types";
import { loadSeedRules } from "./helpers/load-seed-rules";

interface CaseFile {
  id: string;
  type: "land" | "building";
  extracted: { address?: string; area?: number | null; landCategory?: string; zone?: string; otherZones?: string[] };
  answers: Partial<Record<QuestionKey, Answer | null>>;
  expectedSignal: Signal | null;
}

const dir = join(dirname(fileURLToPath(import.meta.url)), "cases");
const rules = loadSeedRules();

const all: CaseFile[] = readdirSync(dir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as CaseFile);

const ready = all.filter(
  (c) =>
    c.expectedSignal != null &&
    !!c.extracted?.landCategory &&
    !!c.extracted?.zone &&
    ["onbid", "dispute", "inUse", ...(c.type === "building" ? ["safety"] : [])].every(
      (k) => c.answers?.[k as QuestionKey] != null,
    ),
);

const run = (c: CaseFile) => {
  const input: JudgeInput = {
    type: c.type,
    landCategory: c.extracted.landCategory ?? "",
    zone: c.extracted.zone ?? "",
    otherZones: c.extracted.otherZones ?? [],
    answers: c.answers,
    // 면적 규칙(처분기준 제5조): 사례에 면적이 있으면 함께 판정한다
    area: c.extracted.area ?? null,
    region: regionOf(c.extracted.address ?? ""),
  };
  return judge(input, rules).signal;
};

describe(`시험 사례 판정 (준비된 사례 ${ready.length}/${all.length}건)`, () => {
  if (ready.length === 0) {
    it.skip("준비된 사례가 아직 없어요 — tests/cases/README.md 를 보고 사례를 채워 주세요", () => {});
  }

  for (const c of ready) {
    it(`${c.id}: 정답 ${c.expectedSignal}`, () => {
      expect(run(c)).toBe(c.expectedSignal);
    });
  }

  if (ready.length > 0) {
    it("위험한 오판정(정답이 🔴·🟡인데 🟢로 판정) 0건", () => {
      const dangerous = ready.filter((c) => c.expectedSignal !== "green" && run(c) === "green").map((c) => c.id);
      expect(dangerous).toEqual([]);
    });
  }

  // 20건 이상 준비되면 일치율 90% 이상을 확인한다 (사례가 늘어도 같은 비율)
  if (ready.length >= 20) {
    it(`일치율 90% 이상 (${ready.length}건 기준 ${Math.ceil(ready.length * 0.9)}건 이상)`, () => {
      const match = ready.filter((c) => run(c) === c.expectedSignal).length;
      expect(match).toBeGreaterThanOrEqual(Math.ceil(ready.length * 0.9));
    });
  }
});
