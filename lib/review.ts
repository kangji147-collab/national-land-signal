// Design Ref: §3.3 — ② 가져온 내용 확인·수정 (순수 규칙: 화면 없이 시험할 수 있다)
// Plan SC: PRD must 1 규칙 7 — 판정 전에 가져온 내용을 보여주고, 민원인이 확인·수정한 값으로만 판정한다.
//          민원인이 고친 항목은 기록해 두고, 판정 결과와 제안서에 "민원인이 수정한 값"으로 표시한다.
import { type EditableField, parseApprovalDate } from "./calc";
import { normalizeZoneName } from "./normalize-zone";
import type { BuildingInfo, LandInfo } from "./public-api";
import type { PropertyType } from "./types";

/** 공공 API 로 가져온 원본 (확인·수정 화면의 출발점) */
export interface ReviewSource {
  mode: PropertyType;
  land: LandInfo;
  /** 건물 진단일 때 민원인이 고른 동 */
  building: BuildingInfo | null;
}

/** 입력 칸에 들어 있는 값 (숫자도 민원인이 쓰는 대로 글자로 둔다: "12,709.4") */
export interface ReviewForm {
  address: string;
  landCategory: string;
  area: string;
  officialPrice: string;
  zone: string;
  zones: string[];
  mainPurpose: string;
  totalFloorArea: string;
  floorsAbove: string;
  floorsBelow: string;
  structure: string;
  approvalDate: string;
}

/** 수정 기록에 쓰는 항목 이름 */
export type EditedKey =
  | "address"
  | "landCategory"
  | "area"
  | "officialPrice"
  | "zone"
  | "zones"
  | "mainPurpose"
  | "totalFloorArea"
  | "floors"
  | "structure"
  | "approvalDate";

export const EDITED_LABELS: Record<EditedKey, string> = {
  address: "소재지",
  landCategory: "지목",
  area: "면적",
  officialPrice: "개별공시지가",
  zone: "용도지역",
  zones: "다른 법령 지역·지구",
  mainPurpose: "주용도",
  totalFloorArea: "연면적",
  floors: "층수",
  structure: "구조",
  approvalDate: "사용승인일",
};

const LAND_KEYS: EditedKey[] = ["address", "landCategory", "area", "officialPrice", "zone", "zones"];
const BUILDING_KEYS: EditedKey[] = ["mainPurpose", "totalFloorArea", "floors", "structure", "approvalDate"];

export function initialForm(src: ReviewSource): ReviewForm {
  const { land, building: b } = src;
  const num = (n: number | null) => (n === null ? "" : String(n));
  return {
    address: land.address,
    landCategory: land.landCategory,
    area: String(land.area),
    officialPrice: num(land.officialPrice),
    zone: land.zone,
    zones: [...land.zones],
    mainPurpose: b?.mainPurpose ?? "",
    totalFloorArea: num(b?.totalFloorArea ?? null),
    floorsAbove: num(b?.floorsAbove ?? null),
    floorsBelow: num(b?.floorsBelow ?? null),
    structure: b?.structure ?? "",
    approvalDate: b?.approvalDate ?? "",
  };
}

/** 글자 → 숫자. 비었으면 null, 숫자가 아니면 NaN. 쉼표·공백은 무시한다. ("12,709.4" → 12709.4) */
export function parseNumber(text: string): number | null {
  const t = text.replace(/[,\s]/g, "");
  if (t === "") return null;
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(t) ? Number(t) : Number.NaN;
}

/** 사용승인일을 "YYYY-MM-DD" 로 정리한다. 비었으면 "", 읽을 수 없으면 null */
export function normalizeApproval(text: string): string | null {
  const t = text.trim();
  if (t === "") return "";
  const d = parseApprovalDate(t);
  if (!d) return null;
  return `${String(d.y).padStart(4, "0")}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
}

export type FieldName = "address" | "area" | "officialPrice" | "totalFloorArea" | "floorsAbove" | "floorsBelow" | "approvalDate";

/** 반드시 고쳐야 하는 오류 (이게 있으면 다음 단계로 갈 수 없다) */
export function validate(form: ReviewForm, mode: PropertyType): Partial<Record<FieldName, string>> {
  const errors: Partial<Record<FieldName, string>> = {};
  if (form.address.trim() === "") errors.address = "소재지를 입력해 주세요";

  const area = parseNumber(form.area);
  if (area === null || !Number.isFinite(area) || area <= 0) errors.area = "면적을 0보다 큰 숫자로 입력해 주세요";

  const price = parseNumber(form.officialPrice);
  if (price !== null && (!Number.isFinite(price) || price < 0)) errors.officialPrice = "숫자로 입력해 주세요";

  if (mode === "building") {
    const tot = parseNumber(form.totalFloorArea);
    if (tot !== null && (!Number.isFinite(tot) || tot <= 0)) errors.totalFloorArea = "0보다 큰 숫자로 입력해 주세요";
    for (const k of ["floorsAbove", "floorsBelow"] as const) {
      const n = parseNumber(form[k]);
      if (n !== null && (!Number.isInteger(n) || n < 0)) errors[k] = "0 이상의 정수로 입력해 주세요";
    }
    if (normalizeApproval(form.approvalDate) === null) errors.approvalDate = "날짜를 2012-08-31 모양으로 입력해 주세요";
  }
  return errors;
}

/** 넘어갈 수는 있지만 알려 둘 점 (비워 두면 어떻게 되는지) */
export function warnings(form: ReviewForm, mode: PropertyType): Partial<Record<FieldName | "landCategory" | "zone", string>> {
  const w: Partial<Record<FieldName | "landCategory" | "zone", string>> = {};
  if (form.landCategory.trim() === "") w.landCategory = "비워 두면 확인되지 않은 값으로 보고 노란불로 판정돼요";
  if (form.zone.trim() === "") w.zone = "비워 두면 확인되지 않은 값으로 보고 노란불로 판정돼요";
  if (parseNumber(form.officialPrice) === null) w.officialPrice = "비워 두면 예상 매수 가격을 계산할 수 없어요";
  if (mode === "building" && parseNumber(form.totalFloorArea) === null) w.totalFloorArea = "비워 두면 예상 수익을 계산할 수 없어요";
  if (mode === "building" && form.approvalDate.trim() === "") w.approvalDate = "비워 두면 노후 건물인지 알 수 없어요";
  return w;
}

const sameText = (a: string, b: string) => a.trim() === b.trim();
const sameNumber = (formText: string, original: number | null) => {
  const n = parseNumber(formText);
  return n === null ? original === null : n === original; // NaN 은 어떤 값과도 같지 않으므로 "수정함"
};
const sortedNames = (names: readonly string[]) => [...new Set(names.map(normalizeZoneName).filter(Boolean))].sort();

/** 민원인이 가져온 값과 다르게 고친 항목 (PRD 규칙 7: 결과·제안서에 "민원인이 수정한 값"으로 표시) */
export function editedKeys(src: ReviewSource, form: ReviewForm): EditedKey[] {
  const { land, building: b } = src;
  const edited: EditedKey[] = [];
  if (!sameText(form.address, land.address)) edited.push("address");
  if (!sameText(form.landCategory, land.landCategory)) edited.push("landCategory");
  if (!sameNumber(form.area, land.area)) edited.push("area");
  if (!sameNumber(form.officialPrice, land.officialPrice)) edited.push("officialPrice");
  if (!sameText(form.zone, land.zone)) edited.push("zone");
  if (sortedNames(form.zones).join("\n") !== sortedNames(land.zones).join("\n")) edited.push("zones");

  if (src.mode === "building" && b) {
    if (!sameText(form.mainPurpose, b.mainPurpose)) edited.push("mainPurpose");
    if (!sameNumber(form.totalFloorArea, b.totalFloorArea)) edited.push("totalFloorArea");
    if (!sameNumber(form.floorsAbove, b.floorsAbove) || !sameNumber(form.floorsBelow, b.floorsBelow)) edited.push("floors");
    if (!sameText(form.structure, b.structure)) edited.push("structure");
    const norm = normalizeApproval(form.approvalDate);
    if ((norm ?? form.approvalDate.trim()) !== b.approvalDate) edited.push("approvalDate");
  }
  return edited;
}

/** 민원인이 확인한 건물 정보 */
export interface ReviewedBuilding {
  id: string;
  label: string;
  mainPurpose: string;
  totalFloorArea: number | null;
  floorsAbove: number | null;
  floorsBelow: number | null;
  structure: string;
  /** "YYYY-MM-DD" (모르면 빈 글자) */
  approvalDate: string;
}

/** 확인·수정을 마친 값 — 이후 질문·판정·제안서 단계가 이 값만 쓴다 */
export interface ReviewedValues {
  mode: PropertyType;
  pnu: string;
  address: string;
  landCategory: string;
  area: number;
  officialPrice: number | null;
  officialPriceYear: number | null;
  zone: string;
  /** 판정에 쓰는 다른 법령 지역·지구 (이름 정리됨, 중복 없음) */
  zones: string[];
  /** 참고용 지역·지구 (판정에 쓰지 않음, 수정 불가) */
  referenceZones: string[];
  building: ReviewedBuilding | null;
  /** 민원인이 고친 항목 */
  edited: EditedKey[];
}

/** 입력 칸의 값을 확정된 값으로 바꾼다. 검사(validate)를 통과한 값만 넘겨야 한다. */
export function toReviewed(src: ReviewSource, form: ReviewForm): ReviewedValues {
  const { land, building: b, mode } = src;
  const num = (t: string) => {
    const n = parseNumber(t);
    return n === null || !Number.isFinite(n) ? null : n;
  };
  const area = num(form.area);
  if (area === null) throw new Error("면적이 올바르지 않아요");

  const building: ReviewedBuilding | null =
    mode === "building" && b
      ? {
          id: b.id,
          label: b.label,
          mainPurpose: form.mainPurpose.trim(),
          totalFloorArea: num(form.totalFloorArea),
          floorsAbove: num(form.floorsAbove),
          floorsBelow: num(form.floorsBelow),
          structure: form.structure.trim(),
          approvalDate: normalizeApproval(form.approvalDate) ?? "",
        }
      : null;

  return {
    mode,
    pnu: land.pnu,
    address: form.address.trim(),
    landCategory: form.landCategory.trim(),
    area,
    officialPrice: num(form.officialPrice),
    officialPriceYear: land.officialPriceYear,
    zone: form.zone.trim(),
    zones: sortedNamesKeepOrder(form.zones),
    referenceZones: [...land.referenceZones],
    building,
    edited: editedKeys(src, form),
  };
}

/** 이름을 정리하고 중복을 없애되, 화면에 보이던 순서는 유지한다 */
function sortedNamesKeepOrder(names: readonly string[]): string[] {
  const out: string[] = [];
  for (const n of names) {
    const clean = normalizeZoneName(n);
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

/** 계산(lib/calc.ts)에 넘길 "수정한 값" 표시: 계산에 실제로 쓰는 세 항목만 */
export function toCalcEdited(edited: readonly EditedKey[]): Partial<Record<EditableField, boolean>> {
  return {
    landArea: edited.includes("area"),
    officialPrice: edited.includes("officialPrice"),
    totalFloorArea: edited.includes("totalFloorArea"),
  };
}

/** 지금 입력된 모양에서 화면에 보여줄 항목(토지만/건물 포함)의 목록 */
export function visibleKeys(mode: PropertyType): EditedKey[] {
  return mode === "building" ? [...LAND_KEYS, ...BUILDING_KEYS] : [...LAND_KEYS];
}
