// 계산 규칙 시험: 손으로 계산한 값과 비교한다. (예시 단가표 = supabase/seed.sql)
import { describe, expect, it } from "vitest";
import { annualFactor, calcIncome, calcPurchasePrice, isOldBuilding, parseApprovalDate } from "../lib/calc";
import type { CalcInput, IncomeRange, PriceRow, PurchasePrice } from "../lib/calc";
import { BUILDING_THEMES, LAND_THEMES } from "../lib/themes";
import { loadSeedPrices } from "./helpers/load-seed-prices";

const prices = loadSeedPrices();

const land = (over: Partial<CalcInput> = {}): CalcInput => ({
  type: "land",
  theme: "공영주차장",
  landArea: 330,
  officialPrice: 1_250_000,
  ...over,
});
const building = (over: Partial<CalcInput> = {}): CalcInput => ({
  type: "building",
  theme: "공유오피스",
  landArea: 300,
  officialPrice: 1_250_000,
  totalFloorArea: 500,
  ...over,
});

const income = (input: CalcInput, p: readonly PriceRow[] = prices) => {
  const r = calcIncome(input, p);
  if (!r.ok) throw new Error(`계산 실패: ${r.message}`);
  return r as IncomeRange;
};

describe("예시 단가표 읽기", () => {
  it("seed.sql 에서 단가표 11줄을 읽는다", () => {
    expect(prices).toHaveLength(11);
  });
});

describe("단위 환산", () => {
  it("'월'이 들어 있으면 ×12, 아니면 ×1", () => {
    expect(annualFactor("원/월/면")).toBe(12);
    expect(annualFactor("원/㎡/월")).toBe(12);
    expect(annualFactor("원/㎡/년")).toBe(1);
    expect(annualFactor("원/kWh")).toBe(1);
  });
});

describe("예상 수익 — 토지 (손계산과 비교)", () => {
  it("공영주차장 330㎡: 면 수 13(내림) × 월정기 요금 4만~12만원 × 12개월", () => {
    const r = income(land());
    expect(r.min).toBe(13 * 40_000 * 12); // 6,240,000
    expect(r.max).toBe(13 * 120_000 * 12); // 18,720,000
  });

  it("태양광 3000㎡: 최소는 1kW당 면적이 큰 쪽(15㎡), 최대는 작은 쪽(10㎡)", () => {
    const r = income(land({ theme: "태양광", landArea: 3000 }));
    expect(r.min).toBe((3000 / 15) * 1100 * 80); // 17,600,000
    expect(r.max).toBe((3000 / 10) * 1300 * 180); // 70,200,000
  });

  it("스마트팜 1000㎡: 면적 × ㎡당 연 매출", () => {
    const r = income(land({ theme: "스마트팜", landArea: 1000 }));
    expect([r.min, r.max]).toEqual([150_000_000, 400_000_000]);
  });

  it("소공원: 직접 수익 0원", () => {
    const r = income(land({ theme: "소공원" }));
    expect([r.min, r.max]).toEqual([0, 0]);
    expect(r.used).toEqual([]);
  });

  it("면적이 작아 주차 면이 0개면 수익 0원 (음수·소수 없음)", () => {
    expect(income(land({ landArea: 10 })).max).toBe(0);
  });
});

describe("예상 수익 — 건물", () => {
  it.each([
    ["공유오피스", 15_000, 35_000],
    ["청년주택", 10_000, 25_000],
    ["카페/문화공간", 12_000, 40_000],
    ["창고(물류)", 3_000, 10_000],
  ])("%s 연면적 500㎡: 연면적 × 임대료 단가 × 12", (theme, lo, hi) => {
    const r = income(building({ theme }));
    expect(r.min).toBe(500 * lo * 12);
    expect(r.max).toBe(500 * hi * 12);
  });
});

describe("예상 수익 — 공통 약속", () => {
  const allCases: CalcInput[] = [
    ...LAND_THEMES.map((theme) => land({ theme, landArea: 1234.5 })),
    ...BUILDING_THEMES.map((theme) => building({ theme, totalFloorArea: 987.6 })),
  ];

  it("8개 테마 모두 최소 ≤ 최대, 정수, 0 이상", () => {
    for (const c of allCases) {
      const r = income(c);
      expect(r.min, c.theme).toBeLessThanOrEqual(r.max);
      expect(Number.isInteger(r.min) && Number.isInteger(r.max), c.theme).toBe(true);
      expect(r.min, c.theme).toBeGreaterThanOrEqual(0);
    }
  });

  it("출처·기준 연도·계산식을 함께 돌려준다 (소공원 제외)", () => {
    for (const c of allCases.filter((c) => c.theme !== "소공원")) {
      const r = income(c);
      expect(r.formula.length, c.theme).toBeGreaterThan(0);
      expect(r.used.length, c.theme).toBeGreaterThan(0);
      expect(r.used.every((u) => u.source && u.baseYear), c.theme).toBe(true);
      expect(r.baseYears, c.theme).toEqual([2026]);
    }
  });

  it("단가표 값이 바뀌면 결과도 바뀐다 (표로만 계산, 코드에 박힌 값 없음)", () => {
    const doubled = prices.map((p) =>
      p.theme === "스마트팜" ? { ...p, min_value: p.min_value * 2, max_value: p.max_value * 2 } : p,
    );
    const a = income(land({ theme: "스마트팜", landArea: 100 }));
    const b = income(land({ theme: "스마트팜", landArea: 100 }), doubled);
    expect(b.min).toBe(a.min * 2);
    expect(b.max).toBe(a.max * 2);
  });

  it("단가표에 값이 없으면 숫자를 만들지 않고 계산 불가를 돌려준다", () => {
    const r = calcIncome(land({ theme: "태양광", landArea: 100 }), prices.filter((p) => p.item !== "연 발전량"));
    expect(r).toMatchObject({ ok: false, code: "PRICE_MISSING" });
    expect(calcIncome(land(), [])).toMatchObject({ ok: false, code: "PRICE_MISSING" });
  });

  it("토지에 건물 테마(또는 반대)·모르는 테마는 거절한다", () => {
    expect(calcIncome(land({ theme: "공유오피스" }), prices)).toMatchObject({ ok: false, code: "THEME_MISMATCH" });
    expect(calcIncome(building({ theme: "스마트팜" }), prices)).toMatchObject({ ok: false, code: "THEME_MISMATCH" });
    expect(calcIncome(land({ theme: "없는테마" }), prices)).toMatchObject({ ok: false, code: "THEME_MISMATCH" });
  });

  it("면적이 0·음수·NaN이거나 건물 연면적이 없으면 거절한다", () => {
    for (const landArea of [0, -5, Number.NaN]) {
      expect(calcIncome(land({ landArea }), prices)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    }
    expect(calcIncome(building({ totalFloorArea: null }), prices)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
    expect(calcIncome(building({ totalFloorArea: 0 }), prices)).toMatchObject({ ok: false, code: "INVALID_INPUT" });
  });

  it("'민원인이 수정한 값 기준' 표시: 계산에 쓴 면적을 고쳤을 때만 true", () => {
    expect(income(land()).basedOnUserEdited).toBe(false);
    expect(income(land({ edited: { landArea: true } })).basedOnUserEdited).toBe(true);
    expect(income(land({ edited: { officialPrice: true } })).basedOnUserEdited).toBe(false); // 수익 계산엔 공시지가를 안 씀
    expect(income(building({ edited: { totalFloorArea: true } })).basedOnUserEdited).toBe(true);
    expect(income(building({ edited: { landArea: true } })).basedOnUserEdited).toBe(false); // 건물 수익은 연면적 기준
  });
});

describe("예상 매수 가격", () => {
  const price = (input: CalcInput) => {
    const r = calcPurchasePrice(input);
    if (!r.ok) throw new Error(r.message);
    return r as PurchasePrice;
  };

  it("토지: 공시지가 × 면적", () => {
    const r = price(land({ landArea: 330.5 }));
    expect(r.amount).toBe(413_125_000); // 1,250,000 × 330.5
    expect(r.buildingExcluded).toBe(false);
    expect(r.buildingAmount).toBeNull();
  });

  it("건물 + 시가표준액 입력: 토지분 + 건물분", () => {
    const r = price(building({ buildingStandardValue: 200_000_000 }));
    expect(r.landAmount).toBe(375_000_000); // 1,250,000 × 300
    expect(r.amount).toBe(575_000_000);
    expect(r.buildingExcluded).toBe(false);
  });

  it("건물 + 시가표준액 없음(null·0·미입력): 토지분만, '건물분 미포함'", () => {
    for (const v of [undefined, null, 0]) {
      const r = price(building({ buildingStandardValue: v }));
      expect(r.amount, String(v)).toBe(375_000_000);
      expect(r.buildingExcluded, String(v)).toBe(true);
      expect(r.formula).toContain("건물분 미포함");
    }
  });

  it("토지에 시가표준액을 보내도 무시한다", () => {
    expect(price(land({ buildingStandardValue: 999 })).amount).toBe(price(land()).amount);
  });

  it("면적 또는 공시지가를 고쳤으면 '민원인이 수정한 값 기준'", () => {
    expect(price(land()).basedOnUserEdited).toBe(false);
    expect(price(land({ edited: { landArea: true } })).basedOnUserEdited).toBe(true);
    expect(price(land({ edited: { officialPrice: true } })).basedOnUserEdited).toBe(true);
    expect(price(land({ edited: { totalFloorArea: true } })).basedOnUserEdited).toBe(false);
  });

  it("잘못된 입력은 거절: 면적 0, 공시지가 음수·NaN, 시가표준액 음수", () => {
    expect(calcPurchasePrice(land({ landArea: 0 }))).toMatchObject({ ok: false });
    expect(calcPurchasePrice(land({ officialPrice: -1 }))).toMatchObject({ ok: false });
    expect(calcPurchasePrice(land({ officialPrice: Number.NaN }))).toMatchObject({ ok: false });
    expect(calcPurchasePrice(building({ buildingStandardValue: -5 }))).toMatchObject({ ok: false });
  });

  it("공시지가 0원은 허용한다 (금액 0원)", () => {
    expect(price(land({ officialPrice: 0 })).amount).toBe(0);
  });
});

describe("노후 건물 (사용승인일 30년 이상)", () => {
  const now = new Date("2026-11-12T03:00:00Z"); // 한국 시간 2026-11-12 정오

  it("날짜 형식을 여러 가지로 읽는다", () => {
    for (const s of ["1990-05-20", "1990.05.20", "19900520", "1990년 5월 20일", "1990.5.20."]) {
      expect(parseApprovalDate(s), s).toEqual({ y: 1990, m: 5, d: 20 });
    }
  });

  it("없는 날짜·글자·빈 값은 읽지 못한다", () => {
    for (const s of ["1990-02-30", "abc", "", "1990", "2026-13-01"]) {
      expect(parseApprovalDate(s), s).toBeNull();
    }
  });

  it("딱 30년이 되는 날부터 노후, 하루 전은 아직 아니다", () => {
    expect(isOldBuilding("1996-11-12", now)).toEqual({ status: "old", years: 30 });
    expect(isOldBuilding("1996-11-13", now)).toEqual({ status: "not_old", years: 29 });
  });

  it("오래된 건물은 노후, 새 건물은 아님", () => {
    expect(isOldBuilding("1985-03-02", now)).toEqual({ status: "old", years: 41 });
    expect(isOldBuilding("2015-01-01", now)).toEqual({ status: "not_old", years: 11 });
  });

  it("못 읽은 날짜·미래 날짜는 unknown (노후 판정을 지어내지 않음)", () => {
    expect(isOldBuilding("모름", now)).toEqual({ status: "unknown" });
    expect(isOldBuilding("2030-01-01", now)).toEqual({ status: "unknown" });
  });

  it("한국 시간 기준으로 날짜를 센다 (UTC 15시 = 한국 다음 날 0시)", () => {
    const late = new Date("2026-11-11T15:00:00Z"); // 한국 2026-11-12 00:00
    expect(isOldBuilding("1996-11-12", late)).toEqual({ status: "old", years: 30 });
  });
});
