import { describe, expect, it } from "vitest";
import { judge } from "../lib/judge";
import type { Answer, JudgeInput, QuestionKey, RuleRow } from "../lib/types";
import { loadSeedRules, loadSeedRulesOnly } from "./helpers/load-seed-rules";

const rules = loadSeedRules();

const okAnswers: Partial<Record<QuestionKey, Answer>> = { onbid: "yes", dispute: "no", inUse: "no", safety: "no" };

const land = (over: Partial<JudgeInput> = {}): JudgeInput => ({
  type: "land",
  landCategory: "대",
  zone: "제2종일반주거지역",
  otherZones: [],
  answers: okAnswers,
  ...over,
});

describe("예시 데이터 읽기", () => {
  it("seed.sql 에서 예시 규칙표 68줄을 읽는다", () => {
    expect(loadSeedRulesOnly()).toHaveLength(68);
  });
  it("규칙표 보강(003)이 같은 (구분, 이름)은 덮어쓰고 새 줄은 더한다", () => {
    const find = (cat: string, name: string) => rules.find((r) => r.category === cat && r.name === name);
    expect(rules.length).toBeGreaterThan(68);
    expect(find("지역지구", "하천구역")?.signal).toBe("yellow"); // 예시의 🔴에서 🟡로
    expect(find("지역지구", "공공청사")?.signal).toBe("red"); // 새 줄
    expect(find("지목", "유지")?.signal).toBe("red"); // 새 줄
    expect(new Set(rules.map((r) => `${r.category}|${r.name}`)).size).toBe(rules.length); // 중복 없음
  });
});

describe("신호등 판정", () => {
  it("모든 항목이 🟢이면 🟢 (근거에 확인한 항목 전체)", () => {
    const r = judge(land(), rules);
    expect(r.signal).toBe("green");
    expect(r.reasons.length).toBe(r.checked.length);
  });

  it("🔴 항목이 하나라도 있으면 🔴", () => {
    expect(judge(land({ landCategory: "도로" }), rules).signal).toBe("red");
  });

  it("🔴와 🟡가 섞이면 🔴이고, 근거에는 🔴 항목만 보여준다", () => {
    const r = judge(land({ landCategory: "도로", otherZones: ["상대보호구역(A유치원)<교육환경법>"] }), rules);
    expect(r.signal).toBe("red");
    expect(r.reasons.every((b) => b.signal === "red")).toBe(true);
  });

  it("🟡 항목이 있으면 🟡이고, 근거에는 🟡 항목을 보여준다", () => {
    const r = judge(land({ landCategory: "전" }), rules);
    expect(r.signal).toBe("yellow");
    expect(r.reasons.map((b) => b.name)).toEqual(["전"]);
  });

  it("PRD 예시: 괄호·법령 이름이 붙은 지역지구가 규칙표 '문화재보호구역'(🟡)과 비교된다", () => {
    const r = judge(land({ otherZones: ["문화재보호구역(경복궁)<문화재보호법>"] }), rules);
    expect(r.signal).toBe("yellow");
    expect(r.checked.some((b) => b.kind === "지역지구" && b.name === "문화재보호구역")).toBe(true);
  });

  it("규칙표에 없는 지역·지구는 🟡 (근거에 이름이 나온다)", () => {
    const r = judge(land({ otherZones: ["없는구역<어떤법>"] }), rules);
    expect(r.signal).toBe("yellow");
    expect(r.reasons[0].reason).toContain("없는구역");
  });

  it("규칙표에 없는 지목·용도지역도 🟡", () => {
    expect(judge(land({ landCategory: "없는지목" }), rules).signal).toBe("yellow");
    expect(judge(land({ zone: "없는지역" }), rules).signal).toBe("yellow");
  });

  it("지목·용도지역이 비어 있으면 🟡 (읽지 못한 값은 🟢가 될 수 없다)", () => {
    expect(judge(land({ landCategory: "" }), rules).signal).toBe("yellow");
    expect(judge(land({ zone: "  " }), rules).signal).toBe("yellow");
  });

  it("보완 질문에 '모르겠음'이 하나라도 있으면 🟡", () => {
    for (const key of ["onbid", "dispute", "inUse"] as const) {
      const r = judge(land({ answers: { ...okAnswers, [key]: "unknown" } }), rules);
      expect(r.signal, key).toBe("yellow");
    }
  });

  it("국유재산 확인 질문은 '예'일 때만 통과: '아니오'도 🟡", () => {
    expect(judge(land({ answers: { ...okAnswers, onbid: "no" } }), rules).signal).toBe("yellow");
  });

  it("답을 안 한 질문(null·빠짐)은 🟡", () => {
    expect(judge(land({ answers: { ...okAnswers, dispute: null } }), rules).signal).toBe("yellow");
    expect(judge(land({ answers: { onbid: "yes", dispute: "no" } }), rules).signal).toBe("yellow");
  });

  it("소송·점유에 '예'로 답하면 🟡", () => {
    expect(judge(land({ answers: { ...okAnswers, dispute: "yes" } }), rules).signal).toBe("yellow");
    expect(judge(land({ answers: { ...okAnswers, inUse: "yes" } }), rules).signal).toBe("yellow");
  });

  it("건물은 안전진단 질문이 필수: 빠지면 🟡, 답하면 🟢, '예'면 🟡", () => {
    const noSafety = { onbid: "yes", dispute: "no", inUse: "no" } as const;
    expect(judge(land({ type: "building", answers: noSafety }), rules).signal).toBe("yellow");
    expect(judge(land({ type: "building" }), rules).signal).toBe("green");
    expect(judge(land({ type: "building", answers: { ...okAnswers, safety: "yes" } }), rules).signal).toBe("yellow");
  });

  it("토지는 안전진단 질문을 묻지 않는다 (답이 없어도 🟢)", () => {
    const r = judge(land({ answers: { onbid: "yes", dispute: "no", inUse: "no" } }), rules);
    expect(r.signal).toBe("green");
    expect(r.checked.some((b) => b.name.startsWith("safety"))).toBe(false);
  });

  it("규칙표가 비어 있으면 절대 🟢가 아니다", () => {
    expect(judge(land(), []).signal).not.toBe("green");
  });

  it("관리자가 표에서 '모르겠음'/'아니오'를 🟢로 바꿔도 🟡를 유지한다 (PRD 고정 규칙)", () => {
    const tampered: RuleRow[] = rules.map((r) =>
      r.category === "질문" && (r.name.endsWith(":unknown") || r.name === "onbid:no") ? { ...r, signal: "green" } : r,
    );
    expect(judge(land({ answers: { ...okAnswers, onbid: "no" } }), tampered).signal).toBe("yellow");
    expect(judge(land({ answers: { ...okAnswers, inUse: "unknown" } }), tampered).signal).toBe("yellow");
  });

  it("관리자가 질문 규칙을 🔴로 바꾸면 🔴가 된다 (표로 고칠 수 있음)", () => {
    const stricter: RuleRow[] = rules.map((r) => (r.name === "dispute:yes" ? { ...r, signal: "red" } : r));
    expect(judge(land({ answers: { ...okAnswers, dispute: "yes" } }), stricter).signal).toBe("red");
  });

  it("기준 연도는 판정에 쓴 줄들의 연도(오름차순·중복 없음)", () => {
    const mixed: RuleRow[] = rules.map((r) => (r.category === "지목" && r.name === "대" ? { ...r, base_year: 2025 } : r));
    expect(judge(land(), mixed).baseYears).toEqual([2025, 2026]);
    expect(judge(land(), rules).baseYears).toEqual([2026]);
  });

  it("입력값을 바꾸지 않는다", () => {
    const input = land({ otherZones: ["상대보호구역(A)<B>"] });
    const copy = structuredClone(input);
    judge(input, rules);
    expect(input).toEqual(copy);
  });
});

describe("면적 규칙 (2024년도 국유재산 처분기준 제5조)", () => {
  it("특별시·광역시: 2,000㎡ 이하는 🟢, 초과하면 🟡 (근거에 면적과 기준이 나온다)", () => {
    expect(judge(land({ area: 2000, region: "metro" }), rules).signal).toBe("green");
    const r = judge(land({ area: 2000.1, region: "metro" }), rules);
    expect(r.signal).toBe("yellow");
    const b = r.reasons.find((x) => x.kind === "면적");
    expect(b?.name).toContain("2,000㎡");
    expect(b?.reason).toContain("총괄청");
  });

  it("그 밖의 시·시 외 지역: 3,000㎡ 이하는 🟢, 초과하면 🟡", () => {
    expect(judge(land({ area: 3000, region: "other" }), rules).signal).toBe("green");
    expect(judge(land({ area: 3001, region: "other" }), rules).signal).toBe("yellow");
    // 같은 2,500㎡라도 광역시는 🟡, 그 밖의 지역은 🟢
    expect(judge(land({ area: 2500, region: "metro" }), rules).signal).toBe("yellow");
    expect(judge(land({ area: 2500, region: "other" }), rules).signal).toBe("green");
  });

  it("면적이나 소재지 구분이 없으면 면적 규칙을 적용하지 않는다", () => {
    expect(judge(land({ area: 999999 }), rules).signal).toBe("green");
    expect(judge(land({ region: "metro" }), rules).signal).toBe("green");
    expect(judge(land({ area: Number.NaN, region: "metro" }), rules).signal).toBe("green");
  });

  it("🔴가 있으면 면적이 커도 🔴 (면적 규칙은 🟡만 더한다)", () => {
    expect(judge(land({ landCategory: "하천", area: 99999, region: "metro" }), rules).signal).toBe("red");
  });

  it("기준 면적은 규칙표 줄에서 읽는다 (관리자가 고치면 따라간다)", () => {
    const custom = rules.map((r) => (r.category === "면적" && r.name === "metro:2000" ? { ...r, name: "metro:1000" } : r));
    expect(judge(land({ area: 1500, region: "metro" }), custom).signal).toBe("yellow");
    // 규칙표에 면적 줄이 아예 없으면 적용하지 않는다
    expect(judge(land({ area: 99999, region: "metro" }), rules.filter((r) => r.category !== "면적")).signal).toBe("green");
  });

  it("상수원 관련 구역(수변구역·수질보전특별대책지역·상수원보호구역)은 🟡 (처분기준 제4조①6)", () => {
    for (const z of ["수변구역", "수질보전특별대책지역", "상수원보호구역"]) {
      expect(judge(land({ otherZones: [z] }), rules).signal, z).toBe("yellow");
    }
  });
});

describe("위험한 오판정 0건 (전수 시험)", () => {
  const byCat = (c: RuleRow["category"]) => rules.filter((r) => r.category === c);

  it("지목 × 용도지역 모든 조합: 🔴가 있으면 🔴, 🟡가 있으면 🟢가 아니다", () => {
    let combos = 0;
    for (const j of byCat("지목")) {
      for (const z of byCat("용도지역")) {
        const r = judge(land({ landCategory: j.name, zone: z.name }), rules);
        const worst = [j.signal, z.signal];
        if (worst.includes("red")) expect(r.signal, `${j.name}/${z.name}`).toBe("red");
        else if (worst.includes("yellow")) expect(r.signal, `${j.name}/${z.name}`).toBe("yellow");
        else expect(r.signal, `${j.name}/${z.name}`).toBe("green");
        combos++;
      }
    }
    expect(combos).toBe(byCat("지목").length * byCat("용도지역").length);
  });

  it("지역지구 하나씩 붙여도: 🔴 지역지구는 항상 🔴, 🟡는 🟢가 아니다", () => {
    for (const d of byCat("지역지구")) {
      const r = judge(land({ otherZones: [`${d.name}(예시)<예시법>`] }), rules);
      if (d.signal === "red") expect(r.signal, d.name).toBe("red");
      else if (d.signal === "yellow") expect(r.signal, d.name).toBe("yellow");
      else expect(r.signal, d.name).toBe("green");
    }
  });

  it("보완 질문 답 모든 조합: 🟢는 모두 '정상 답'일 때만 나온다", () => {
    const vals: Answer[] = ["yes", "no", "unknown"];
    for (const onbid of vals)
      for (const dispute of vals)
        for (const inUse of vals)
          for (const safety of vals) {
            const r = judge(land({ type: "building", answers: { onbid, dispute, inUse, safety } }), rules);
            const allGood = onbid === "yes" && dispute === "no" && inUse === "no" && safety === "no";
            expect(r.signal === "green", JSON.stringify({ onbid, dispute, inUse, safety })).toBe(allGood);
          }
  });
});
