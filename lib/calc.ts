// Design Ref: §4.2 — 예상 수익·예상 매수 가격·노후 건물 계산 (순수 규칙: 화면·DB·AI 없이 값만 받아 값을 돌려준다)
// Plan SC: "예상 수익·예상 매수 가격은 AI가 지어내지 않고 단가표·공시지가로 계산한다" (PRD must2 규칙 4·5·7·10)
//
// - 단가표에 필요한 값이 없으면 숫자를 만들어 내지 않고 "계산할 수 없음"을 돌려준다.
// - 예상 수익은 최소~최대 범위: 수익이 커지는 값은 최소 ↔ 최소, 면적을 나누는 값은 최소 수익에서 최대값을 쓴다.
// - 금액은 모두 원 단위 정수(반올림)이다.
import { themeTarget } from "./themes";
import type { PropertyType } from "./types";

/** 단가표(Supabase `unit_prices`) 한 줄 */
export interface PriceRow {
  theme: string;
  item: string;
  min_value: number;
  max_value: number;
  unit: string;
  source: string;
  base_year: number;
}

/** 민원인이 읽은 값을 고친 항목 (결과에 "민원인이 수정한 값 기준" 표시용) */
export type EditableField = "landArea" | "officialPrice" | "totalFloorArea";

export interface CalcInput {
  type: PropertyType;
  theme: string;
  landArea: number; // 토지이용계획의 면적(㎡)
  officialPrice: number; // 개별공시지가(원/㎡)
  totalFloorArea?: number | null; // 건축물대장의 연면적(㎡) — 건물일 때
  buildingStandardValue?: number | null; // 건물 시가표준액(원) — 민원인이 알면 입력
  edited?: Partial<Record<EditableField, boolean>>;
  /** 배치 시뮬레이터로 놓은 시설물의 수익 단위 합 (토지·수익이 있는 테마). 있으면 면적 대신 이 값으로 계산한다 */
  layout?: { units: number } | null;
}

export type CalcFail = { ok: false; code: "INVALID_INPUT" | "THEME_MISMATCH" | "PRICE_MISSING"; message: string };

export interface UsedPrice {
  item: string;
  min: number;
  max: number;
  unit: string;
  source: string;
  baseYear: number;
}

export interface IncomeRange {
  ok: true;
  /** 연 예상 수익(원): 최소 ~ 최대 */
  min: number;
  max: number;
  /** 계산식 설명 (제안서에 그대로 보여줌) */
  formula: string;
  /** 계산에 쓴 단가표 줄 (출처·기준 연도 표시용) */
  used: UsedPrice[];
  baseYears: number[];
  /** 수정한 값으로 계산했으면 true → "민원인이 수정한 값 기준" */
  basedOnUserEdited: boolean;
  /** 배치 시뮬레이터로 놓은 시설물을 기준으로 계산했으면 true */
  basedOnLayout?: boolean;
}

export interface PurchasePrice {
  ok: true;
  /** 예상 매수 가격(원) */
  amount: number;
  /** 토지분 = 공시지가 × 면적 */
  landAmount: number;
  /** 건물분 = 시가표준액 (입력이 없으면 null) */
  buildingAmount: number | null;
  /** 건물인데 시가표준액이 없어 토지분만 보여주는 경우 true → "건물분 미포함" */
  buildingExcluded: boolean;
  formula: string;
  basedOnUserEdited: boolean;
}

export type OldBuilding =
  | { status: "old"; years: number }
  | { status: "not_old"; years: number }
  | { status: "unknown" }; // 날짜를 읽을 수 없음 → "사용승인일 확인 필요"

const fail = (code: CalcFail["code"], message: string): CalcFail => ({ ok: false, code, message });
const positive = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;

/** 단위에 "월"이 들어 있으면 월 단가 → 연 단가로 ×12, 그 밖에는 그대로 */
export function annualFactor(unit: string): number {
  return /월/.test(unit) ? 12 : 1;
}

function findPrice(prices: readonly PriceRow[], theme: string, item: string): PriceRow | undefined {
  return prices.find((p) => p.theme === theme && p.item === item);
}

const toUsed = (p: PriceRow): UsedPrice => ({
  item: p.item,
  min: p.min_value,
  max: p.max_value,
  unit: p.unit,
  source: p.source,
  baseYear: p.base_year,
});

/** 예상 수익(연, 최소~최대) */
export function calcIncome(input: CalcInput, prices: readonly PriceRow[]): IncomeRange | CalcFail {
  const target = themeTarget(input.theme);
  if (!target) return fail("THEME_MISMATCH", `알 수 없는 테마예요: ${input.theme}`);
  if (target !== input.type) {
    return fail("THEME_MISMATCH", `${input.type === "land" ? "토지" : "건물"}에는 쓸 수 없는 테마예요: ${input.theme}`);
  }

  const need = (...items: string[]): PriceRow[] | CalcFail => {
    const rows: PriceRow[] = [];
    for (const item of items) {
      const row = findPrice(prices, input.theme, item);
      if (!row) return fail("PRICE_MISSING", `단가표에 '${input.theme} / ${item}' 값이 없어 계산할 수 없어요.`);
      rows.push(row);
    }
    return rows;
  };

  let min: number;
  let max: number;
  let formula: string;
  let used: PriceRow[] = [];
  let usedArea: EditableField;
  let basedOnLayout = false;

  if (input.type === "land") {
    const area = input.landArea;
    if (!positive(area)) return fail("INVALID_INPUT", "면적을 확인해 주세요.");
    usedArea = "landArea";
    // 놓은 시설물이 있으면(수익 단위 > 0) 면적 대신 그 값으로 계산한다
    const placed = input.layout && input.layout.units > 0 ? input.layout.units : null;

    switch (input.theme) {
      case "공영주차장": {
        const rows = need("1면당 필요 면적", "월정기 요금");
        if (!Array.isArray(rows)) return rows;
        const [per, fee] = rows;
        if (!positive(per.min_value)) return fail("INVALID_INPUT", "단가표의 1면당 필요 면적을 확인해 주세요.");
        const f = annualFactor(fee.unit);
        if (placed !== null) {
          // 배치한 주차면 수 × 월정기 요금 (면적으로 면 수를 따로 계산하지 않는다)
          min = placed * fee.min_value * f;
          max = placed * fee.max_value * f;
          formula = `배치한 주차면 ${placed.toLocaleString("ko-KR")}면 × 월정기 요금 × 12개월`;
          used = [fee];
          basedOnLayout = true;
          break;
        }
        // 면 수는 정수: 1면당 면적이 클수록 면 수가 줄어 최소 수익이 된다
        min = Math.floor(area / per.max_value) * fee.min_value * f;
        max = Math.floor(area / per.min_value) * fee.max_value * f;
        formula = "면적 ÷ 1면당 필요 면적(소수점 아래 버림) × 월정기 요금 × 12개월";
        used = rows;
        break;
      }
      case "태양광": {
        const rows = need("1kW당 필요 면적", "연 발전량", "전력 판매 단가");
        if (!Array.isArray(rows)) return rows;
        const [perKw, gen, price] = rows;
        if (!positive(perKw.min_value)) return fail("INVALID_INPUT", "단가표의 1kW당 필요 면적을 확인해 주세요.");
        const f = annualFactor(price.unit);
        if (placed !== null) {
          // 배치한 태양광 용량(kW) × 연 발전량 × 전력 판매 단가
          min = placed * gen.min_value * price.min_value * f;
          max = placed * gen.max_value * price.max_value * f;
          formula = `배치한 태양광 ${placed.toLocaleString("ko-KR")}kW × 연 발전량 × 전력 판매 단가`;
          used = [gen, price];
          basedOnLayout = true;
          break;
        }
        min = (area / perKw.max_value) * gen.min_value * price.min_value * f;
        max = (area / perKw.min_value) * gen.max_value * price.max_value * f;
        formula = "면적 ÷ 1kW당 필요 면적 × 연 발전량 × 전력 판매 단가";
        used = rows;
        break;
      }
      case "스마트팜": {
        const rows = need("㎡당 연 매출");
        if (!Array.isArray(rows)) return rows;
        const [rev] = rows;
        const f = annualFactor(rev.unit);
        const farmArea = placed ?? area; // 배치한 온실 재배 면적이 있으면 그 면적으로
        min = farmArea * rev.min_value * f;
        max = farmArea * rev.max_value * f;
        formula = placed !== null ? `배치한 온실 재배 면적 ${placed.toLocaleString("ko-KR")}㎡ × ㎡당 연 매출` : "면적 × ㎡당 연 매출";
        used = rows;
        basedOnLayout = placed !== null;
        break;
      }
      default: {
        // 소공원: 직접 수익 0원 (기대효과 중심)
        min = 0;
        max = 0;
        formula = "직접 수익 없음 (기대효과 중심)";
      }
    }
  } else {
    const area = input.totalFloorArea;
    if (!positive(area)) return fail("INVALID_INPUT", "연면적을 확인해 주세요.");
    usedArea = "totalFloorArea";
    const rows = need("임대료 단가");
    if (!Array.isArray(rows)) return rows;
    const [rent] = rows;
    const f = annualFactor(rent.unit);
    min = area * rent.min_value * f;
    max = area * rent.max_value * f;
    formula = "연면적 × 임대료 단가 × 12개월";
    used = rows;
  }

  const usedPrices = used.map(toUsed);
  return {
    ok: true,
    min: Math.round(min),
    max: Math.round(max),
    formula,
    used: usedPrices,
    baseYears: [...new Set(usedPrices.map((u) => u.baseYear))].sort((a, b) => a - b),
    // 놓은 시설물로 계산했으면 면적 수정은 이 숫자와 상관없다
    basedOnUserEdited: basedOnLayout ? false : !!input.edited?.[usedArea],
    ...(basedOnLayout ? { basedOnLayout: true } : {}),
  };
}

/** 예상 매수 가격 (참고용 — 실제 매각 가격은 감정평가로 결정) */
export function calcPurchasePrice(input: CalcInput): PurchasePrice | CalcFail {
  if (!positive(input.landArea)) return fail("INVALID_INPUT", "면적을 확인해 주세요.");
  if (typeof input.officialPrice !== "number" || !Number.isFinite(input.officialPrice) || input.officialPrice < 0) {
    return fail("INVALID_INPUT", "개별공시지가를 확인해 주세요.");
  }
  const value = input.buildingStandardValue;
  if (value != null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    return fail("INVALID_INPUT", "건물 시가표준액을 확인해 주세요.");
  }

  const landAmount = Math.round(input.officialPrice * input.landArea);
  const edited = !!(input.edited?.landArea || input.edited?.officialPrice);

  if (input.type === "land") {
    return {
      ok: true,
      amount: landAmount,
      landAmount,
      buildingAmount: null,
      buildingExcluded: false,
      formula: "개별공시지가 × 면적",
      basedOnUserEdited: edited,
    };
  }

  // 건물: 토지 공시지가 × 면적 + 건물 시가표준액. 시가표준액이 없으면 토지분만(건물분 미포함).
  const hasBuilding = value != null && value > 0;
  const buildingAmount = hasBuilding ? Math.round(value) : null;
  return {
    ok: true,
    amount: landAmount + (buildingAmount ?? 0),
    landAmount,
    buildingAmount,
    buildingExcluded: !hasBuilding,
    formula: hasBuilding ? "개별공시지가 × 면적 + 건물 시가표준액" : "개별공시지가 × 면적 (건물분 미포함)",
    basedOnUserEdited: edited,
  };
}

/** 한국 시간 기준 오늘 날짜 */
function todayKST(now: Date): { y: number; m: number; d: number } {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return { y: k.getUTCFullYear(), m: k.getUTCMonth() + 1, d: k.getUTCDate() };
}

/** 사용승인일 글자를 날짜로 읽는다. YYYY-MM-DD · YYYY.MM.DD · YYYYMMDD · "2001년 3월 5일" 등. 못 읽으면 null */
export function parseApprovalDate(raw: string): { y: number; m: number; d: number } | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/) ?? s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  // 2월 30일 같은 없는 날짜는 거른다
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return { y, m: mo, d };
}

/** 사용승인일로부터 30년 이상이면 "노후 건물, 안전진단 필요" (PRD must2 규칙 7) */
export function isOldBuilding(approvalDate: string, now: Date = new Date()): OldBuilding {
  const a = parseApprovalDate(approvalDate);
  if (!a) return { status: "unknown" };
  const t = todayKST(now);
  const future = t.y < a.y || (t.y === a.y && (t.m < a.m || (t.m === a.m && t.d < a.d)));
  if (future) return { status: "unknown" }; // 미래 날짜는 잘못 읽은 값으로 본다
  // 만 나이 계산: 생일(기념일)이 지나야 한 해가 찬다
  const years = t.y - a.y - (t.m < a.m || (t.m === a.m && t.d < a.d) ? 1 : 0);
  return years >= 30 ? { status: "old", years } : { status: "not_old", years };
}
