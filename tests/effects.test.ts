// 기대효과 규칙 시험 (lib/effects.ts) — AI 호출은 가짜 함수로 바꿔 끼운다.
import { describe, expect, it, vi } from "vitest";
import { buildPolishMessages, hasNewNumber, makeEffects, parsePolished } from "../lib/effects";

const BASE = [
  "방치된 땅이 주차 공간으로 바뀌어 인근 주민의 주차 불편이 줄어듭니다.",
  "꾸준한 주차 수요를 바탕으로 안정적인 운영 수입을 기대할 수 있습니다.",
  "관리되지 않던 공터가 정비되어 주변 환경이 깨끗해집니다.",
];
const ok = (list: string[]) => JSON.stringify({ effects: list });
const GOOD = [
  "버려진 땅이 주차장이 되어 주민의 주차 걱정이 줄어듭니다.",
  "꾸준한 수요 덕에 안정적인 운영 수입을 기대할 수 있어요.",
  "방치된 공터가 정리되어 동네가 깨끗해집니다.",
];

describe("hasNewNumber", () => {
  it("기본 문장에 없는 숫자·수량 표현이 나오면 true", () => {
    expect(hasNewNumber("주차 면이 30% 늘어납니다.", BASE)).toBe(true);
    expect(hasNewNumber("연 방문객 1,200명", BASE)).toBe(true);
    expect(hasNewNumber("수만 명이 이용합니다.", BASE)).toBe(true);
    expect(hasNewNumber("지가가 몇 퍼센트 오릅니다.", BASE)).toBe(true);
    expect(hasNewNumber("１００면 규모", BASE)).toBe(true); // 전각 숫자
  });
  it("숫자가 없거나 기본 문장에 이미 있던 숫자는 통과", () => {
    expect(hasNewNumber("주민의 불편이 줄어듭니다.", BASE)).toBe(false);
    expect(hasNewNumber("연 3회 점검합니다.", ["연 3회 점검합니다."])).toBe(false);
    expect(hasNewNumber("연 4회 점검합니다.", ["연 3회 점검합니다."])).toBe(true);
  });
});

describe("parsePolished", () => {
  it("올바른 JSON 3개 이상이면 통과", () => {
    expect(parsePolished(ok(GOOD), BASE)).toEqual(GOOD);
  });
  it("JSON 아님·모양 틀림·문장 수 부족/초과·긴 문장·빈 문장은 null", () => {
    expect(parsePolished("그냥 글", BASE)).toBeNull();
    expect(parsePolished(JSON.stringify({ x: 1 }), BASE)).toBeNull();
    expect(parsePolished(ok(GOOD.slice(0, 2)), BASE)).toBeNull();
    expect(parsePolished(ok([...GOOD, ...GOOD, ...GOOD]), BASE)).toBeNull();
    expect(parsePolished(ok([GOOD[0], GOOD[1], "가".repeat(201)]), BASE)).toBeNull();
    expect(parsePolished(ok([GOOD[0], GOOD[1], "  "]), BASE)).toBeNull();
    expect(parsePolished(JSON.stringify({ effects: [GOOD[0], GOOD[1], 3] }), BASE)).toBeNull();
  });
  it("새 숫자가 한 문장이라도 있으면 전체를 버린다", () => {
    expect(parsePolished(ok([GOOD[0], GOOD[1], "주변 지가가 15% 오릅니다."]), BASE)).toBeNull();
  });
});

describe("makeEffects", () => {
  const opts = { theme: "공영주차장", type: "land" as const, base: BASE };
  it("AI가 통과하면 다듬은 문장(ai)을 쓴다", async () => {
    const polish = vi.fn().mockResolvedValue(ok(GOOD));
    expect(await makeEffects({ ...opts, aiAllowed: true, polish })).toEqual({ sentences: GOOD, source: "ai" });
  });
  it("남은 횟수가 없으면 AI를 부르지 않고 문장표 기본 문장(table)", async () => {
    const polish = vi.fn();
    expect(await makeEffects({ ...opts, aiAllowed: false, polish })).toEqual({ sentences: BASE, source: "table" });
    expect(polish).not.toHaveBeenCalled();
  });
  it("AI 오류·시간 초과·새 숫자·이상한 답이면 문장표 기본 문장으로 대신한다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const polish of [
      vi.fn().mockRejectedValue(new Error("sk-secret timeout")),
      vi.fn().mockResolvedValue(ok([GOOD[0], GOOD[1], "방문객이 30% 늘어납니다."])),
      vi.fn().mockResolvedValue("```json 이상한 답"),
    ]) {
      expect(await makeEffects({ ...opts, aiAllowed: true, polish })).toEqual({ sentences: BASE, source: "table" });
    }
  });
  it("기본 문장이 3개 미만이면 AI로 늘리지 않고 표 그대로", async () => {
    const polish = vi.fn();
    expect(await makeEffects({ ...opts, base: BASE.slice(0, 2), aiAllowed: true, polish })).toEqual({
      sentences: BASE.slice(0, 2),
      source: "table",
    });
    expect(polish).not.toHaveBeenCalled();
  });
});

describe("buildPolishMessages", () => {
  it("테마·종류·기본 문장만 담고, 새 숫자 금지 지시가 있다", () => {
    const m = buildPolishMessages("공영주차장", "land", BASE);
    expect(m.user).toContain("공영주차장");
    expect(m.user).toContain(BASE[0]);
    expect(m.system).toContain("숫자");
    expect(m.system).toContain("JSON");
  });
});
