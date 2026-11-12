// 시험 사례로 "주소 조회부터 판정까지" 이어서 채점한다. (PRD 3번 성공 기준 2 ②, PLAN 작업 22번) 기본 `npm test`에서는 건너뜀.
// 실행:  bash →  RUN_LIVE_TESTS=1 npm test -- tests/live/e2e-cases.live.test.ts
//        PowerShell →  $env:RUN_LIVE_TESTS=1; npm test -- tests/live/e2e-cases.live.test.ts
// 하는 일: 모든 칸을 채운 사례마다 ① 주소 검색 ② 토지 정보 조회 ③ (건물) 건축물대장 조회 ④ 실제 규칙표(Supabase)로 판정
//          → 작성자가 정한 정답(expectedSignal)과 비교하고, 일치율·위험한 오판정(🔴인데 🟢)을 센다.
// 사용 횟수(하루 20회)는 쓰지 않는다 — 서버 API가 아니라 조회·판정 함수를 직접 부르기 때문이다. (공공 API 호출 한도는 쓴다)
// 사례 파일이 20건 모두 채워졌을 때만 목표(일치 90% 이상, 위험한 오판정 0건)를 시험 실패 기준으로 삼는다.
// 환경 변수 E2E_CASES_DIR 로 사례 폴더를 바꿀 수 있고(기본 tests/cases), E2E_REPORT 에 파일 경로를 주면 결과 표를 저장한다.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { judge } from "../../lib/judge";
import { lookupBuildings, lookupLand, searchAddress } from "../../lib/public-api";
import { fetchRules } from "../../lib/rules-source";
import type { Answer, QuestionKey, Signal } from "../../lib/types";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function loadEnv(): Record<string, string> {
  try {
    const out: Record<string, string> = {};
    for (const line of readFileSync(join(root, ".env"), "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_]\w*)\s*=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
    return out;
  } catch {
    return {};
  }
}
const env = loadEnv();
const enabled =
  process.env.RUN_LIVE_TESTS === "1" &&
  !!env.VWORLD_API_KEY && !!env.VWORLD_DOMAIN && !!env.DATA_GO_KR_API_KEY && !!env.SUPABASE_URL && !!env.SUPABASE_ANON_KEY;
const deps = { vworldKey: env.VWORLD_API_KEY, vworldDomain: env.VWORLD_DOMAIN, dataGoKey: env.DATA_GO_KR_API_KEY };

interface CaseFile {
  id: string;
  type: "land" | "building";
  pnu?: string; // (선택) 주소 검색이 엉뚱한 필지를 고를 때 작성자가 직접 적는 필지 번호
  extracted: { address?: string; landCategory?: string; zone?: string; otherZones?: string[] };
  answers: Partial<Record<QuestionKey, Answer | null>>;
  expectedSignal: Signal | null;
}

const casesDir = process.env.E2E_CASES_DIR ? resolve(process.env.E2E_CASES_DIR) : join(root, "tests", "cases");
const all: CaseFile[] = readdirSync(casesDir)
  .filter((f) => f.endsWith(".json") && !f.startsWith("_"))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(casesDir, f), "utf8")) as CaseFile);

const ready = all.filter(
  (c) =>
    c.expectedSignal != null &&
    !!c.extracted?.address &&
    ["onbid", "dispute", "inUse", ...(c.type === "building" ? ["safety"] : [])].every((k) => c.answers?.[k as QuestionKey] != null),
);

interface Row {
  id: string;
  type: string;
  expected: Signal;
  actual: Signal | "-";
  ok: boolean;
  dangerous: boolean; // 정답이 🔴인데 🟢로 판정
  note: string;
}

async function runCase(c: CaseFile, rules: Awaited<ReturnType<typeof fetchRules>>): Promise<Row> {
  const base = { id: c.id, type: c.type, expected: c.expectedSignal as Signal };
  try {
    let pnu = c.pnu;
    if (!pnu) {
      const found = await searchAddress(c.extracted.address as string, deps);
      const hit = found.candidates.find((x) => x.label === c.extracted.address) ?? found.candidates[0];
      if (!hit) return { ...base, actual: "-", ok: false, dangerous: false, note: "주소를 찾지 못함" };
      pnu = hit.pnu;
    }
    const land = await lookupLand(pnu, deps);
    if (!land.found) return { ...base, actual: "-", ok: false, dangerous: false, note: "토지 정보 없음" };
    let note = "";
    if (c.type === "building") {
      const b = await lookupBuildings(pnu, deps);
      if (b.buildings.length === 0) return { ...base, actual: "-", ok: false, dangerous: false, note: "건축물대장 없음" };
      note = `건물 ${b.buildings.length}동`;
    }
    const result = judge(
      { type: c.type, landCategory: land.info.landCategory, zone: land.info.zone, otherZones: land.info.zones, answers: c.answers },
      rules,
    );
    const actual = result.signal;
    return { ...base, actual, ok: actual === base.expected, dangerous: base.expected === "red" && actual === "green", note };
  } catch (e) {
    // 공공 API 오류 등: 내용(키·응답)은 남기지 않는다
    return { ...base, actual: "-", ok: false, dangerous: false, note: `조회 오류(${(e as Error).name})` };
  }
}

const ICON: Record<string, string> = { green: "🟢", yellow: "🟡", red: "🔴", "-": "⚠️" };

describe.skipIf(!enabled)(`주소 조회~판정 이어서 시험 (준비된 사례 ${ready.length}/${all.length}건, RUN_LIVE_TESTS=1)`, () => {
  it("일치율과 위험한 오판정을 센다", async () => {
    if (ready.length === 0) {
      console.log("준비된 사례가 아직 없어요 — tests/cases/README.md 를 보고 사례(주소·정답·질문 답)를 채워 주세요");
      return;
    }
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const rules = await fetchRules(client);
    const rows: Row[] = [];
    for (const c of ready) rows.push(await runCase(c, rules)); // 공공 API 에 부담을 주지 않게 하나씩

    const matched = rows.filter((r) => r.ok).length;
    const dangerous = rows.filter((r) => r.dangerous).length;
    const errors = rows.filter((r) => r.actual === "-").length;
    const rate = Math.round((matched / rows.length) * 1000) / 10;
    const lines = [
      `| 사례 | 종류 | 정답 | 시스템 판정 | 일치 | 비고 |`,
      `|---|---|---|---|---|---|`,
      ...rows.map((r) => `| ${r.id} | ${r.type === "land" ? "토지" : "건물"} | ${ICON[r.expected]} | ${ICON[r.actual]} | ${r.ok ? "O" : "X"}${r.dangerous ? " (위험)" : ""} | ${r.note} |`),
      ``,
      `일치 ${matched}/${rows.length}건 (${rate}%) · 위험한 오판정 ${dangerous}건 · 조회 실패 ${errors}건`,
    ];
    console.log(lines.join("\n"));
    if (process.env.E2E_REPORT) writeFileSync(process.env.E2E_REPORT, lines.join("\n") + "\n");

    // 위험한 오판정은 사례가 몇 건이든 0건이어야 한다
    expect(dangerous).toBe(0);
    // 20건이 모두 준비되었을 때만 일치율 목표를 실패 기준으로 삼는다
    if (ready.length >= 20) expect(rate).toBeGreaterThanOrEqual(90);
  }, 600_000);
});
