// 제안서(PDF) 글 만들기 시험 (lib/proposal-doc.ts) — 4개 항목·PRD 안내 문구가 빠지지 않는지 확인한다.
import { describe, expect, it } from "vitest";
import { calcIncome, calcPurchasePrice } from "../lib/calc";
import { MESSAGES } from "../lib/messages";
import { buildProposalDoc, dateTextKST, pdfFileName } from "../lib/proposal-doc";
import type { ReviewedValues } from "../lib/review";
import { loadSeedPrices } from "./helpers/load-seed-prices";

const prices = loadSeedPrices();
const LAND: ReviewedValues = {
  mode: "land",
  pnu: "1",
  address: "서울특별시 중구 태평로1가 31",
  landCategory: "대",
  area: 500,
  officialPrice: 1_000_000,
  officialPriceYear: 2026,
  zone: "계획관리지역",
  zones: [],
  referenceZones: [],
  building: null,
  edited: ["area"],
};
const landInput = { type: "land" as const, theme: "공영주차장", landArea: 500, officialPrice: 1_000_000, edited: { landArea: true } };
const proposal = (over = {}) => ({
  theme: "공영주차장",
  income: calcIncome(landInput, prices),
  price: calcPurchasePrice(landInput),
  effects: { sentences: ["가 문장.", "나 문장.", "다 문장."], source: "table" as const },
  oldBuilding: null,
  ...over,
});
const NOW = new Date("2026-11-12T01:00:00Z"); // 한국 시간 10시

describe("buildProposalDoc", () => {
  it("4개 항목(이미지·수익·매수 가격·기대효과)과 PRD 안내 문구가 모두 들어간다", () => {
    const d = buildProposalDoc({ reviewed: LAND, proposal: proposal(), imageIncluded: true, now: NOW });
    expect(d.image.included).toBe(true);
    expect(d.income.headline).toMatch(/^연 .+ ~ .+/);
    expect(d.income.notice).toBe(MESSAGES.incomeNotice); // 참고용·공사비·운영비 미포함
    expect(d.price.headline).toMatch(/^약 /);
    expect(d.price.notice).toBe(MESSAGES.priceNotice);
    expect(d.effects).toHaveLength(3);
    expect(d.disclaimer).toBe(MESSAGES.disclaimer);
    expect(d.purchaseGuide.lines.join(" ")).toContain("매수 신청을 받지 않아요"); // 접수 기능 없음 + 온비드 안내
    expect(d.purchaseGuide.lines.join(" ")).toContain("온비드");
    expect(d.dateText).toBe("2026년 11월 12일");
  });

  it("수익에는 출처·기준 연도가 들어가고, 고친 값은 '민원인이 수정한 값 기준'으로 표시된다", () => {
    const d = buildProposalDoc({ reviewed: LAND, proposal: proposal(), imageIncluded: true, now: NOW });
    expect(d.income.lines.join("\n")).toMatch(/출처 .+ · 기준 연도 2026/);
    expect(d.income.mark).toBe(MESSAGES.userEditedBasis);
    expect(d.price.mark).toBe(MESSAGES.userEditedBasis);
    expect(d.edited).toEqual(["면적"]);
    expect(d.editedLabel).toBe(MESSAGES.userEdited);
  });

  it("이미지가 없으면 '이미지 생성 실패로 제외됨'으로 표시한다", () => {
    const d = buildProposalDoc({ reviewed: LAND, proposal: proposal(), imageIncluded: false, now: NOW });
    expect(d.image).toEqual({ included: false, text: MESSAGES.imageFailed });
  });

  it("건물: 건물분 미포함·노후 안내·건물 정보가 들어간다", () => {
    const building: ReviewedValues = {
      ...LAND,
      mode: "building",
      edited: [],
      building: { id: "1", label: "본관", mainPurpose: "업무시설", totalFloorArea: 1000, floorsAbove: 5, floorsBelow: 1, structure: "철근콘크리트", approvalDate: "1990-05-01" },
    };
    const input = { type: "building" as const, theme: "공유오피스", landArea: 500, officialPrice: 1_000_000, totalFloorArea: 1000 };
    const d = buildProposalDoc({
      reviewed: building,
      proposal: proposal({ theme: "공유오피스", income: calcIncome(input, prices), price: calcPurchasePrice(input), oldBuilding: { status: "old", years: 36 } }),
      imageIncluded: true,
      now: NOW,
    });
    expect(d.price.lines).toContain(MESSAGES.buildingExcluded);
    expect(d.oldBuildingNote).toContain(MESSAGES.oldBuilding);
    expect(d.site.map((r) => r.label)).toEqual(expect.arrayContaining(["주용도", "연면적", "사용승인일"]));
    expect(d.income.mark).toBeNull();
  });

  it("사용승인일을 모르면 '확인 필요' 안내", () => {
    const d = buildProposalDoc({ reviewed: LAND, proposal: proposal({ oldBuilding: { status: "unknown" } }), imageIncluded: true, now: NOW });
    expect(d.oldBuildingNote).toContain("사용승인일 확인 필요");
  });

  it("계산할 수 없는 항목은 이유를 보여주고 failed 로 표시한다 (숫자를 만들지 않음)", () => {
    const d = buildProposalDoc({
      reviewed: LAND,
      proposal: proposal({ price: { ok: false, code: "INVALID_INPUT", message: "개별공시지가를 알 수 없어요" } }),
      imageIncluded: true,
      now: NOW,
    });
    expect(d.price.failed).toBe(true);
    expect(d.price.headline).toContain("계산할 수 없어요");
  });

  it("소공원은 직접 수익 없음", () => {
    const input = { type: "land" as const, theme: "소공원", landArea: 500, officialPrice: 1_000_000 };
    const d = buildProposalDoc({ reviewed: LAND, proposal: proposal({ theme: "소공원", income: calcIncome(input, prices) }), imageIncluded: true, now: NOW });
    expect(d.income.headline).toBe("직접 수익 없음");
  });
});

describe("파일 이름·날짜", () => {
  it("한국 시간 기준 날짜로 만든다", () => {
    expect(pdfFileName(NOW)).toBe("국유지신호등_제안서_20261112.pdf");
    expect(dateTextKST(new Date("2026-12-31T16:00:00Z"))).toBe("2027년 1월 1일"); // UTC 16시 = 한국 다음 날 1시
  });
});
