// 판정 결과 화면의 표시 규칙 시험 (app/diagnose/_components/result-view.ts)
import { describe, expect, it } from "vitest";
import { describeBasis, formatBaseYears, signalView } from "../app/diagnose/_components/result-view";
import type { Basis } from "../lib/types";

describe("신호별 표시", () => {
  it("🟢🟡🔴 모두 색과 함께 글이 있다 (색을 구별하기 어려운 사람도 알 수 있게)", () => {
    expect(signalView("green")).toMatchObject({ icon: "🟢", title: "매각 가능해요" });
    expect(signalView("yellow")).toMatchObject({ icon: "🟡", title: "담당자 상담이 필요해요" });
    expect(signalView("red")).toMatchObject({ icon: "🔴", title: "내부 규정상 매각이 어려워요" });
    for (const s of ["green", "yellow", "red"] as const) {
      const v = signalView(s);
      expect(v.summary.length).toBeGreaterThan(10);
      expect(v.reasonsTitle.length).toBeGreaterThan(0);
    }
  });

  it("🟢는 최종 결정이 심사로 정해진다는 점을 요약에 밝힌다", () => {
    expect(signalView("green").summary).toContain("심사");
  });

  it("근거 제목이 신호에 맞다", () => {
    expect(signalView("red").reasonsTitle).toContain("어려운 이유");
    expect(signalView("yellow").reasonsTitle).toContain("상담이 필요한 이유");
  });
});

describe("규칙표 기준 연도", () => {
  it.each([
    [[2026], "2026년"],
    [[2025, 2026], "2025~2026년"],
    [[2024, 2025, 2026], "2024~2026년"],
    [[], ""],
  ])("%j → '%s'", (years, text) => {
    expect(formatBaseYears(years)).toBe(text);
  });
});

describe("근거 한 줄", () => {
  const basis = (over: Partial<Basis>): Basis => ({ kind: "지목", name: "도로", signal: "red", reason: "[예시] 공공용", baseYear: 2026, ...over });

  it("지목·용도지역·지역지구는 '구분: 이름'과 이유", () => {
    expect(describeBasis(basis({}))).toEqual({ title: "지목: 도로", detail: "[예시] 공공용" });
    expect(describeBasis(basis({ kind: "지역지구", name: "상대보호구역" })).title).toBe("지역지구: 상대보호구역");
  });

  it("질문은 질문 글과 답을 보여준다 (질문키:답 같은 내부 이름을 보여주지 않는다)", () => {
    const d = describeBasis(basis({ kind: "질문", name: "onbid:no", signal: "yellow", reason: "[예시] 확인되지 않음" }));
    expect(d.title).toBe("온비드 등에서 국유재산으로 확인한 곳인가요?");
    expect(d.detail).toBe("답: 아니오 — [예시] 확인되지 않음");
    expect(d.title + d.detail).not.toContain("onbid");
  });

  it.each([
    ["dispute:yes", "예"],
    ["inUse:unknown", "모르겠음"],
    ["safety:no", "아니오"],
  ])("질문 %s → 답 '%s'", (name, label) => {
    expect(describeBasis(basis({ kind: "질문", name })).detail).toContain(`답: ${label}`);
  });

  it("답을 하지 않은 질문(키만 옴)은 '답 없음'", () => {
    const d = describeBasis(basis({ kind: "질문", name: "dispute", reason: "답하지 않아 담당자 상담이 필요합니다." }));
    expect(d.title).toBe("소송·분쟁 중인 곳인가요?");
    expect(d.detail).toContain("답: 답 없음");
  });

  it("모르는 질문 키는 그대로 보여준다 (화면이 깨지지 않게)", () => {
    expect(describeBasis(basis({ kind: "질문", name: "새질문:yes" })).title).toBe("질문: 새질문:yes");
  });
});
