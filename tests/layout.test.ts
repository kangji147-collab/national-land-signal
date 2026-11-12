// 배치 시뮬레이터 규칙 시험 (lib/layout.ts) + 배치를 반영한 수익 계산 (lib/calc.ts)
import { describe, expect, it } from "vitest";
import { type CalcInput, type PriceRow, calcIncome } from "../lib/calc";
import { type LayoutItem, clamp01, fitsParcel, summarizeLayout, usagePercent } from "../lib/layout";

const item = (over: Partial<LayoutItem>): LayoutItem => ({
  theme: "공영주차장", name: "주차 1면", icon: "🚗", areaM2: 25, units: 1, unitLabel: "면", sortOrder: 1, ...over,
});
const ITEMS: LayoutItem[] = [
  item({}),
  item({ name: "관리 부스", icon: "🏠", areaM2: 9, units: 0, unitLabel: "", sortOrder: 2 }),
];

describe("summarizeLayout", () => {
  it("개수 × 면적·수익 단위를 모으고, 순서는 표의 순서를 따른다", () => {
    const r = summarizeLayout(ITEMS, [{ name: "관리 부스", count: 1 }, { name: "주차 1면", count: 8 }]);
    expect(r).toEqual({
      ok: true,
      lines: [
        { name: "주차 1면", icon: "🚗", count: 8, area: 200 },
        { name: "관리 부스", icon: "🏠", count: 1, area: 9 },
      ],
      totalArea: 209,
      units: 8,
      unitLabel: "면",
    });
  });
  it("같은 이름이 여러 번 오면 합친다", () => {
    const r = summarizeLayout(ITEMS, [{ name: "주차 1면", count: 3 }, { name: "주차 1면", count: 2 }]);
    expect(r.ok && r.units).toBe(5);
  });
  it("수익 단위가 없는 시설물만 놓으면 units 0", () => {
    const r = summarizeLayout(ITEMS, [{ name: "관리 부스", count: 2 }]);
    expect(r).toMatchObject({ ok: true, units: 0, totalArea: 18 });
  });
  it("표에 없는 이름·0개·소수·너무 많은 개수는 거절", () => {
    expect(summarizeLayout(ITEMS, [{ name: "없는 시설", count: 1 }]).ok).toBe(false);
    expect(summarizeLayout(ITEMS, [{ name: "주차 1면", count: 0 }]).ok).toBe(false);
    expect(summarizeLayout(ITEMS, [{ name: "주차 1면", count: 1.5 }]).ok).toBe(false);
    expect(summarizeLayout(ITEMS, [{ name: "주차 1면", count: 501 }]).ok).toBe(false);
    // 합쳐서 한도를 넘는 경우도 거절
    expect(summarizeLayout(ITEMS, [{ name: "주차 1면", count: 300 }, { name: "주차 1면", count: 300 }]).ok).toBe(false);
  });
  it("빈 목록은 빈 요약", () => {
    expect(summarizeLayout(ITEMS, [])).toMatchObject({ ok: true, lines: [], totalArea: 0, units: 0 });
  });
});

describe("면적 확인", () => {
  it("fitsParcel: 같으면 통과, 넘으면 거절, 필지 면적이 이상하면 거절", () => {
    expect(fitsParcel(100, 100)).toBe(true);
    expect(fitsParcel(100.01, 100)).toBe(false);
    expect(fitsParcel(10, 0)).toBe(false);
    expect(fitsParcel(10, Number.NaN)).toBe(false);
  });
  it("usagePercent", () => {
    expect(usagePercent(50, 200)).toBe(25);
    expect(usagePercent(250, 200)).toBe(125);
    expect(usagePercent(10, 0)).toBe(0);
  });
  it("clamp01", () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(2)).toBe(1);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(Number.NaN)).toBe(0);
  });
});

const price = (theme: string, item: string, min: number, max: number, unit: string): PriceRow => ({ theme, item, min_value: min, max_value: max, unit, source: "[시험]", base_year: 2026 });
const PRICES: PriceRow[] = [
  price("공영주차장", "1면당 필요 면적", 25, 25, "㎡/면"),
  price("공영주차장", "월정기 요금", 40000, 120000, "원/월/면"),
  price("태양광", "1kW당 필요 면적", 10, 15, "㎡/kW"),
  price("태양광", "연 발전량", 1100, 1300, "kWh/kW/년"),
  price("태양광", "전력 판매 단가", 80, 180, "원/kWh"),
  price("스마트팜", "㎡당 연 매출", 150000, 400000, "원/㎡/년"),
];
const base = (over: Partial<CalcInput>): CalcInput => ({ type: "land", theme: "공영주차장", landArea: 1000, officialPrice: 1000000, ...over });

describe("calcIncome — 배치한 시설물 기준", () => {
  it("공영주차장: 배치한 주차면 수 × 월정기 요금 × 12 (면적으로 면 수를 따로 세지 않는다)", () => {
    const r = calcIncome(base({ layout: { units: 8 }, edited: { landArea: true } }), PRICES);
    expect(r).toMatchObject({ ok: true, min: 8 * 40000 * 12, max: 8 * 120000 * 12, basedOnLayout: true, basedOnUserEdited: false });
    if (r.ok) expect(r.formula).toContain("배치한 주차면 8면");
  });
  it("태양광: 배치한 kW × 연 발전량 × 판매 단가", () => {
    const r = calcIncome(base({ theme: "태양광", layout: { units: 20 } }), PRICES);
    expect(r).toMatchObject({ ok: true, min: 20 * 1100 * 80, max: 20 * 1300 * 180, basedOnLayout: true });
  });
  it("스마트팜: 배치한 온실 재배 면적 × ㎡당 연 매출", () => {
    const r = calcIncome(base({ theme: "스마트팜", layout: { units: 200 } }), PRICES);
    expect(r).toMatchObject({ ok: true, min: 200 * 150000, max: 200 * 400000, basedOnLayout: true });
  });
  it("배치가 없거나 수익 단위가 0이면 기존처럼 면적으로 계산한다", () => {
    const area = calcIncome(base({}), PRICES);
    expect(area).toMatchObject({ ok: true, min: 40 * 40000 * 12, max: 40 * 120000 * 12 }); // 1000㎡ ÷ 25㎡ = 40면
    expect(area.ok && area.basedOnLayout).toBeFalsy();
    expect(calcIncome(base({ layout: { units: 0 } }), PRICES)).toEqual(area);
    expect(calcIncome(base({ layout: null }), PRICES)).toEqual(area);
  });
  it("소공원은 배치해도 수익 0", () => {
    expect(calcIncome(base({ theme: "소공원", layout: { units: 0 } }), PRICES)).toMatchObject({ ok: true, min: 0, max: 0 });
  });
});
