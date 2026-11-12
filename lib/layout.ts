// Design Ref: §3.6-2 — 배치 시뮬레이터의 규칙: 놓은 시설물의 개수·면적·수익 단위를 모은다. (브라우저·서버 공용, 순수 규칙)
// 시설물의 이름·면적·수익 단위는 Supabase 시설물 표(layout_items)에서 온다. 코드에 값을 박아 두지 않는다.
//  - 사진에는 축척이 없어 "어디에 놓았는지"는 계산에 쓰지 않는다. 개수만 계산에 쓰고, 면적 합이 필지 면적을 넘는지 본다.
export interface LayoutItem {
  theme: string;
  name: string;
  icon: string;
  /** 아이콘 하나가 차지하는 면적(㎡) */
  areaM2: number;
  /** 아이콘 하나가 수익 계산에 더해 주는 단위 (0 = 수익 계산에 들어가지 않음). 주차면 수 / kW / 재배 면적(㎡) */
  units: number;
  unitLabel: string;
  sortOrder: number;
  /** 이미지를 만들 때 AI에게 알려 줄 영어 설명 (비어 있으면 한글 이름을 그대로 알려 준다) */
  descriptionEn?: string;
}

/** 화면에서 서버로 보내는 "어떤 시설물을 몇 개" (위치는 보내지 않는다) */
export interface PlacedCount {
  name: string;
  count: number;
}

export const MAX_PLACED_KINDS = 30;
export const MAX_PLACED_COUNT = 500;

export interface LayoutLine {
  name: string;
  icon: string;
  count: number;
  /** 이 시설물이 차지하는 면적 합(㎡) */
  area: number;
}

export type LayoutSummary =
  | {
      ok: true;
      lines: LayoutLine[];
      /** 시설물 면적 합(㎡) */
      totalArea: number;
      /** 수익 계산에 들어가는 단위 합 (주차면 수 / kW / ㎡). 0이면 수익 계산에 쓸 시설물이 없다 */
      units: number;
      unitLabel: string;
    }
  | { ok: false; message: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 놓은 개수를 시설물 표와 맞춰 보고 면적·수익 단위를 모은다. 모르는 이름·이상한 개수는 거절한다. */
export function summarizeLayout(items: readonly LayoutItem[], counts: readonly PlacedCount[]): LayoutSummary {
  if (counts.length > MAX_PLACED_KINDS) return { ok: false, message: "시설물 종류가 너무 많아요" };
  const byName = new Map(items.map((i) => [i.name, i]));
  const merged = new Map<string, number>();
  for (const c of counts) {
    if (!byName.has(c.name)) return { ok: false, message: "이 테마에서는 쓸 수 없는 시설물이 있어요" };
    if (!Number.isInteger(c.count) || c.count < 1 || c.count > MAX_PLACED_COUNT) {
      return { ok: false, message: `시설물 개수는 1~${MAX_PLACED_COUNT}개 사이여야 해요` };
    }
    merged.set(c.name, (merged.get(c.name) ?? 0) + c.count);
  }

  const lines: LayoutLine[] = [];
  let totalArea = 0;
  let units = 0;
  let unitLabel = "";
  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const count = merged.get(item.name);
    if (!count) continue;
    if (count > MAX_PLACED_COUNT) return { ok: false, message: `시설물 개수는 1~${MAX_PLACED_COUNT}개 사이여야 해요` };
    const area = round2(item.areaM2 * count);
    lines.push({ name: item.name, icon: item.icon, count, area });
    totalArea += area;
    if (item.units > 0) {
      units += item.units * count;
      unitLabel = item.unitLabel;
    }
  }
  return { ok: true, lines, totalArea: round2(totalArea), units: round2(units), unitLabel };
}

/** 시설물 면적 합이 필지 면적 안에 들어가는지 */
export function fitsParcel(totalArea: number, parcelArea: number): boolean {
  return Number.isFinite(parcelArea) && parcelArea > 0 && totalArea <= parcelArea;
}

/** 필지 면적 대비 사용률(%) — 100을 넘을 수 있다 */
export function usagePercent(totalArea: number, parcelArea: number): number {
  if (!(parcelArea > 0)) return 0;
  return Math.round((totalArea / parcelArea) * 1000) / 10;
}

/** 화면 속 위치(0~1 비율)를 사진 안쪽으로 맞춘다 */
export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}
