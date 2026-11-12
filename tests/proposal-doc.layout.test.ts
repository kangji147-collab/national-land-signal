// 제안서 글 만들기 시험 — 배치도(직접 배치)가 문서 글에 들어가는지 (lib/proposal-doc.ts)
import { describe, expect, it } from "vitest";
import { buildProposalDoc } from "../lib/proposal-doc";
import type { ReviewedValues } from "../lib/review";

const LAND: ReviewedValues = {
  mode: "land", pnu: "0", address: "서울특별시 ○○구 ○○동 1", landCategory: "대", area: 500, officialPrice: 1_000_000, officialPriceYear: 2026,
  zone: "제2종일반주거지역", zones: [], referenceZones: [], building: null, edited: [],
};
const proposal = (layout?: unknown) =>
  ({
    theme: "공영주차장",
    income: { ok: true, min: 1, max: 2, formula: "배치한 주차면 8면 × 월정기 요금 × 12개월", used: [], baseYears: [2026], basedOnUserEdited: false, basedOnLayout: true },
    price: { ok: true, amount: 1, landAmount: 1, buildingAmount: null, buildingExcluded: false, formula: "x", basedOnUserEdited: false },
    effects: { sentences: ["가."], source: "table" },
    oldBuilding: null,
    layout,
  }) as never;

describe("buildProposalDoc — 배치도", () => {
  it("배치했으면 시설물 줄·면적 합·안내 문장이 들어가고, 이모지는 글에 쓰지 않는다", () => {
    const d = buildProposalDoc({
      reviewed: LAND,
      proposal: proposal({ lines: [{ name: "주차 1면", icon: "🚗", count: 8, area: 200 }, { name: "관리 부스", icon: "🏠", count: 1, area: 9 }], totalArea: 209 }),
      imageIncluded: true,
      layoutImageIncluded: true,
    });
    expect(d.layout?.heading).toContain("배치도");
    expect(d.layout?.imageIncluded).toBe(true);
    expect(d.layout?.lines).toEqual([
      "주차 1면 × 8 (200㎡)",
      "관리 부스 × 1 (9㎡)",
      "시설물 면적 합 209㎡ / 필지 면적 500㎡",
      "사진에는 축척이 없어 놓은 위치는 참고용 그림이며, 개수와 면적이 예상 수익 계산에 쓰였어요.",
    ]);
    expect(d.layout?.lines.join("")).not.toMatch(/🚗|🏠/);
  });
  it("배치하지 않았으면(없음·빈 목록) layout 은 null", () => {
    expect(buildProposalDoc({ reviewed: LAND, proposal: proposal(), imageIncluded: true }).layout).toBeNull();
    expect(buildProposalDoc({ reviewed: LAND, proposal: proposal(null), imageIncluded: true }).layout).toBeNull();
    expect(buildProposalDoc({ reviewed: LAND, proposal: proposal({ lines: [], totalArea: 0 }), imageIncluded: true }).layout).toBeNull();
  });
  it("그림을 못 넣어도 글은 들어간다", () => {
    const d = buildProposalDoc({ reviewed: LAND, proposal: proposal({ lines: [{ name: "나무", icon: "🌳", count: 2, area: 10 }], totalArea: 10 }), imageIncluded: false });
    expect(d.layout?.imageIncluded).toBe(false);
    expect(d.layout?.lines[0]).toBe("나무 × 2 (10㎡)");
  });
});
