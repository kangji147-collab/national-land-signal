// 확인·수정 규칙 시험 (lib/review.ts): 값 검사, 수정 기록, 확정된 값
import { describe, expect, it } from "vitest";
import type { BuildingInfo, LandInfo } from "../lib/public-api";
import {
  EDITED_LABELS,
  editedKeys,
  initialForm,
  normalizeApproval,
  parseNumber,
  toCalcEdited,
  toReviewed,
  validate,
  visibleKeys,
  warnings,
} from "../lib/review";
import type { ReviewForm, ReviewSource } from "../lib/review";

const LAND: LandInfo = {
  pnu: "1114010300100310000",
  address: "서울특별시 중구 태평로1가 31",
  landCategory: "대",
  area: 12709.4,
  zone: "일반상업지역",
  officialPrice: 65730000,
  officialPriceYear: 2026,
  zones: ["대공방어협조구역", "도로", "서울도심"],
  referenceZones: ["광장"],
  dataYear: 2026,
};
const BUILDING: BuildingInfo = {
  id: "10031100209993",
  label: "신관 · 서울특별시 청사",
  name: "서울특별시 청사",
  dong: "신관",
  isAnnex: false,
  mainPurpose: "업무시설",
  totalFloorArea: 83625.55,
  floorsAbove: 13,
  floorsBelow: 5,
  structure: "철골철근콘크리트구조",
  approvalDate: "2012-08-31",
};
const landSrc: ReviewSource = { mode: "land", land: LAND, building: null };
const bldgSrc: ReviewSource = { mode: "building", land: LAND, building: BUILDING };

const form = (src: ReviewSource, over: Partial<ReviewForm> = {}): ReviewForm => ({ ...initialForm(src), ...over });

describe("처음 입력 칸 값", () => {
  it("토지: 가져온 값 그대로, 값이 없는 칸(공시지가 null)은 빈 글자", () => {
    expect(initialForm(landSrc)).toEqual({
      address: "서울특별시 중구 태평로1가 31",
      landCategory: "대",
      area: "12709.4",
      officialPrice: "65730000",
      zone: "일반상업지역",
      zones: ["대공방어협조구역", "도로", "서울도심"],
      mainPurpose: "",
      totalFloorArea: "",
      floorsAbove: "",
      floorsBelow: "",
      structure: "",
      approvalDate: "",
    });
    expect(initialForm({ ...landSrc, land: { ...LAND, officialPrice: null } }).officialPrice).toBe("");
  });

  it("건물: 건축물대장 5항목이 채워진다 (지하 0층은 '0')", () => {
    const f = initialForm({ ...bldgSrc, building: { ...BUILDING, floorsBelow: 0 } });
    expect(f).toMatchObject({
      mainPurpose: "업무시설",
      totalFloorArea: "83625.55",
      floorsAbove: "13",
      floorsBelow: "0",
      structure: "철골철근콘크리트구조",
      approvalDate: "2012-08-31",
    });
  });

  it("처음 값 그대로면 수정한 항목이 없고, 검사도 통과한다", () => {
    expect(editedKeys(landSrc, initialForm(landSrc))).toEqual([]);
    expect(editedKeys(bldgSrc, initialForm(bldgSrc))).toEqual([]);
    expect(validate(initialForm(landSrc), "land")).toEqual({});
    expect(validate(initialForm(bldgSrc), "building")).toEqual({});
  });
});

describe("숫자·날짜 읽기", () => {
  it.each([
    ["12,709.4", 12709.4],
    [" 100 ", 100],
    ["1 000", 1000],
    [".5", 0.5],
    ["5.", 5],
    ["0", 0],
    ["-5", -5],
  ])("숫자 '%s' → %s", (text, n) => {
    expect(parseNumber(text)).toBe(n);
  });

  it("비었으면 null, 숫자가 아니면 NaN", () => {
    expect(parseNumber("")).toBeNull();
    expect(parseNumber("  ")).toBeNull();
    for (const bad of ["abc", "1.2.3", "1e3", "12㎡", "--5", "1,2,x"]) expect(parseNumber(bad), bad).toBeNaN();
  });

  it("사용승인일을 YYYY-MM-DD 로 정리한다", () => {
    expect(normalizeApproval("2012-08-31")).toBe("2012-08-31");
    expect(normalizeApproval("20120831")).toBe("2012-08-31");
    expect(normalizeApproval("2012.8.1")).toBe("2012-08-01");
    expect(normalizeApproval("2012년 8월 1일")).toBe("2012-08-01");
    expect(normalizeApproval("")).toBe("");
    expect(normalizeApproval("abc")).toBeNull();
    expect(normalizeApproval("2012-02-30")).toBeNull();
  });
});

describe("값 검사 (고쳐야만 다음으로 갈 수 있는 것)", () => {
  it("소재지가 비면 오류", () => {
    expect(validate(form(landSrc, { address: "  " }), "land").address).toBeDefined();
  });

  it.each(["", "  ", "0", "-1", "abc", "1.2.3"])("면적이 '%s' 이면 오류", (area) => {
    expect(validate(form(landSrc, { area }), "land").area).toContain("0보다 큰");
  });

  it("면적은 쉼표·소수점이 있어도 통과", () => {
    expect(validate(form(landSrc, { area: "12,709.4" }), "land")).toEqual({});
  });

  it("개별공시지가: 비워 두는 것은 괜찮고(경고만), 숫자가 아니거나 음수면 오류, 0원은 허용", () => {
    expect(validate(form(landSrc, { officialPrice: "" }), "land").officialPrice).toBeUndefined();
    expect(validate(form(landSrc, { officialPrice: "abc" }), "land").officialPrice).toBeDefined();
    expect(validate(form(landSrc, { officialPrice: "-1" }), "land").officialPrice).toBeDefined();
    expect(validate(form(landSrc, { officialPrice: "0" }), "land").officialPrice).toBeUndefined();
  });

  it("건물: 연면적 0·음수·글자는 오류, 층수는 0 이상의 정수, 사용승인일은 날짜여야 한다", () => {
    expect(validate(form(bldgSrc, { totalFloorArea: "0" }), "building").totalFloorArea).toBeDefined();
    expect(validate(form(bldgSrc, { totalFloorArea: "abc" }), "building").totalFloorArea).toBeDefined();
    expect(validate(form(bldgSrc, { floorsAbove: "1.5" }), "building").floorsAbove).toBeDefined();
    expect(validate(form(bldgSrc, { floorsBelow: "-1" }), "building").floorsBelow).toBeDefined();
    expect(validate(form(bldgSrc, { floorsBelow: "0" }), "building").floorsBelow).toBeUndefined();
    expect(validate(form(bldgSrc, { approvalDate: "어제" }), "building").approvalDate).toBeDefined();
    expect(validate(form(bldgSrc, { approvalDate: "" }), "building").approvalDate).toBeUndefined();
  });

  it("토지 진단에서는 건물 칸을 검사하지 않는다 (잘못된 값이 남아 있어도)", () => {
    expect(validate(form(landSrc, { totalFloorArea: "abc", approvalDate: "어제" }), "land")).toEqual({});
  });
});

describe("경고 (넘어갈 수는 있지만 알려 둘 점)", () => {
  it("지목·용도지역·공시지가를 비우면 어떻게 되는지 알려 준다", () => {
    const w = warnings(form(landSrc, { landCategory: "", zone: " ", officialPrice: "" }), "land");
    expect(w.landCategory).toContain("노란불");
    expect(w.zone).toContain("노란불");
    expect(w.officialPrice).toContain("예상 매수 가격");
  });

  it("값이 다 있으면 경고가 없다", () => {
    expect(warnings(initialForm(bldgSrc), "building")).toEqual({});
  });

  it("건물: 연면적·사용승인일을 비우면 알려 준다", () => {
    const w = warnings(form(bldgSrc, { totalFloorArea: "", approvalDate: "" }), "building");
    expect(w.totalFloorArea).toContain("예상 수익");
    expect(w.approvalDate).toContain("노후");
  });
});

describe("수정 기록 (PRD: 민원인이 고친 항목은 기록)", () => {
  it.each([
    ["address", { address: "서울특별시 중구 다른동 1" }],
    ["landCategory", { landCategory: "잡종지" }],
    ["area", { area: "100" }],
    ["officialPrice", { officialPrice: "70000000" }],
    ["zone", { zone: "준주거지역" }],
  ] as const)("토지 %s 를 고치면 기록된다", (key, over) => {
    expect(editedKeys(landSrc, form(landSrc, over as Partial<ReviewForm>))).toEqual([key]);
  });

  it("모양만 바뀐 것(쉼표·소수점 끝 0·앞뒤 공백)은 고친 것이 아니다", () => {
    expect(editedKeys(landSrc, form(landSrc, { area: "12,709.4" }))).toEqual([]);
    expect(editedKeys(landSrc, form(landSrc, { area: "12709.40" }))).toEqual([]);
    expect(editedKeys(landSrc, form(landSrc, { address: "  서울특별시 중구 태평로1가 31  " }))).toEqual([]);
    expect(editedKeys(landSrc, form(landSrc, { officialPrice: "65,730,000" }))).toEqual([]);
  });

  it("공시지가가 원래 없었는데(null) 그대로 비워 두면 고친 게 아니고, 직접 넣으면 고친 것이다", () => {
    const src = { ...landSrc, land: { ...LAND, officialPrice: null } };
    expect(editedKeys(src, initialForm(src))).toEqual([]);
    expect(editedKeys(src, form(src, { officialPrice: "5000" }))).toEqual(["officialPrice"]);
  });

  it("숫자가 아닌 글자를 넣어도 '고쳤다'고 기록한다 (검사에서 따로 막힘)", () => {
    expect(editedKeys(landSrc, form(landSrc, { area: "abc" }))).toEqual(["area"]);
  });

  it("지역·지구: 추가·삭제는 고친 것, 순서만 바꾸거나 같은 이름을 괄호째 다시 적은 것은 아니다", () => {
    expect(editedKeys(landSrc, form(landSrc, { zones: [...LAND.zones, "새구역"] }))).toEqual(["zones"]);
    expect(editedKeys(landSrc, form(landSrc, { zones: ["도로", "서울도심"] }))).toEqual(["zones"]);
    expect(editedKeys(landSrc, form(landSrc, { zones: ["서울도심", "대공방어협조구역", "도로"] }))).toEqual([]);
    expect(editedKeys(landSrc, form(landSrc, { zones: ["도로(예시)<법>", "서울도심", "대공방어협조구역"] }))).toEqual([]);
  });

  it.each([
    ["mainPurpose", { mainPurpose: "근린생활시설" }],
    ["totalFloorArea", { totalFloorArea: "1000" }],
    ["floors", { floorsAbove: "14" }],
    ["floors", { floorsBelow: "6" }],
    ["structure", { structure: "철근콘크리트구조" }],
    ["approvalDate", { approvalDate: "2013-01-01" }],
  ] as const)("건물 %s 를 고치면 기록된다", (key, over) => {
    expect(editedKeys(bldgSrc, form(bldgSrc, over as Partial<ReviewForm>))).toEqual([key]);
  });

  it("사용승인일을 다른 모양으로 적어도(20120831) 같은 날짜면 고친 게 아니다", () => {
    expect(editedKeys(bldgSrc, form(bldgSrc, { approvalDate: "20120831" }))).toEqual([]);
    expect(editedKeys(bldgSrc, form(bldgSrc, { approvalDate: "2012.8.31" }))).toEqual([]);
  });

  it("여러 항목을 고치면 모두 기록하고, 토지 진단에서는 건물 칸을 바꿔도 기록하지 않는다", () => {
    expect(editedKeys(bldgSrc, form(bldgSrc, { area: "1", structure: "목구조" }))).toEqual(["area", "structure"]);
    expect(editedKeys(landSrc, form(landSrc, { mainPurpose: "다른 용도", totalFloorArea: "1" }))).toEqual([]);
  });

  it("모든 항목에 화면에 보일 이름이 있다", () => {
    for (const k of visibleKeys("building")) expect(EDITED_LABELS[k], k).toBeTruthy();
  });

  it("화면에 보이는 항목: 토지 6개, 건물이면 11개", () => {
    expect(visibleKeys("land")).toHaveLength(6);
    expect(visibleKeys("building")).toHaveLength(11);
  });
});

describe("확정된 값 (이후 판정·제안서가 쓰는 값)", () => {
  it("토지: 글자를 숫자로, 값을 다듬고, 수정 기록과 참고 지역지구를 함께 담는다", () => {
    const r = toReviewed(landSrc, form(landSrc, { address: "  서울특별시 중구 태평로1가 31 ", area: "12,000.5", officialPrice: "" }));
    expect(r).toEqual({
      mode: "land",
      pnu: LAND.pnu,
      address: "서울특별시 중구 태평로1가 31",
      landCategory: "대",
      area: 12000.5,
      officialPrice: null,
      officialPriceYear: 2026,
      zone: "일반상업지역",
      zones: ["대공방어협조구역", "도로", "서울도심"],
      referenceZones: ["광장"],
      building: null,
      edited: ["area", "officialPrice"],
    });
  });

  it("건물: 사용승인일을 YYYY-MM-DD 로, 층수·연면적을 숫자로 담는다", () => {
    const r = toReviewed(bldgSrc, form(bldgSrc, { approvalDate: "20130102", totalFloorArea: "9,000", floorsBelow: "" }));
    expect(r.building).toEqual({
      id: "10031100209993",
      label: "신관 · 서울특별시 청사",
      mainPurpose: "업무시설",
      totalFloorArea: 9000,
      floorsAbove: 13,
      floorsBelow: null,
      structure: "철골철근콘크리트구조",
      approvalDate: "2013-01-02",
    });
    expect(r.edited).toEqual(["totalFloorArea", "floors", "approvalDate"]);
  });

  it("지역·지구는 이름을 정리하고 중복을 없애되 순서는 유지한다", () => {
    const r = toReviewed(landSrc, form(landSrc, { zones: ["서울도심", "도로(예시)<법>", "서울도심", "새 구역", ""] }));
    expect(r.zones).toEqual(["서울도심", "도로", "새구역"]);
  });

  it("토지 진단이면 건물은 null", () => {
    expect(toReviewed(landSrc, form(landSrc, { mainPurpose: "무시됨" })).building).toBeNull();
  });

  it("면적이 올바르지 않으면 확정하지 않고 오류를 던진다 (검사를 건너뛴 경우의 안전장치)", () => {
    expect(() => toReviewed(landSrc, form(landSrc, { area: "abc" }))).toThrow();
    expect(() => toReviewed(landSrc, form(landSrc, { area: "" }))).toThrow();
  });

  it("원본 값(land.zones 등)을 바꾸지 않는다", () => {
    const before = structuredClone(LAND);
    const f = form(landSrc);
    f.zones.push("추가");
    toReviewed(landSrc, f);
    expect(LAND).toEqual(before);
  });

  it("계산에 넘길 수정 표시: 면적·공시지가·연면적만", () => {
    expect(toCalcEdited(["area", "zone", "officialPrice"])).toEqual({ landArea: true, officialPrice: true, totalFloorArea: false });
    expect(toCalcEdited([])).toEqual({ landArea: false, officialPrice: false, totalFloorArea: false });
    expect(toCalcEdited(["totalFloorArea"])).toEqual({ landArea: false, officialPrice: false, totalFloorArea: true });
  });
});
