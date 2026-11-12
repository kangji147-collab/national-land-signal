// Design Ref: §3.7 — 제안서(PDF)에 들어갈 글을 한곳에서 만든다. (순수 규칙: 값 → 글. PDF 그리기는 ProposalPdf.tsx)
// PRD must2 규칙 8: 이미지·예상 수익·예상 매수 가격·기대효과 4개 항목이 모두 들어가며, 이미지 생성이 실패하면 "이미지 생성 실패로 제외됨"을 표시한다.
// 안내 문구(참고용·공사비·운영비 미포함·노후 건물·수정한 값)는 lib/messages.ts 의 PRD 원문을 그대로 쓴다.
import type { IncomeRange, OldBuilding, PurchasePrice } from "./calc";
import { MESSAGES, SERVICE_NAME } from "./messages";
import { formatWon } from "./money";
import { EDITED_LABELS, type ReviewedValues } from "./review";

type Calc<T> = T | { ok: false; code: string; message: string };

/** /api/proposal 이 돌려준 값 (화면의 ProposalData 와 같은 모양) */
export interface ProposalDocInput {
  theme: string;
  income: Calc<IncomeRange>;
  price: Calc<PurchasePrice>;
  effects: { sentences: string[]; source: "ai" | "table" };
  oldBuilding: OldBuilding | null;
}

export interface DocBlock {
  /** 큰 글씨로 보여줄 결과 (예: "960만 원 ~ 2,880만 원") */
  headline: string;
  /** 보조 설명 줄들 (계산식·출처 등) */
  lines: string[];
  /** "민원인이 수정한 값 기준" 같은 표시 (없으면 null) */
  mark: string | null;
  /** 참고용 안내 문구 */
  notice: string;
  /** 계산할 수 없는 경우 true (headline 은 이유) */
  failed: boolean;
}

export interface ProposalDoc {
  title: string;
  serviceName: string;
  dateText: string;
  theme: string;
  /** 대상지 정보 (이름: 값) */
  site: { label: string; value: string }[];
  /** 민원인이 수정한 항목 이름들 (없으면 빈 목록) */
  edited: string[];
  editedLabel: string;
  /** 노후 건물 안내 (해당 없으면 null) */
  oldBuildingNote: string | null;
  /** ① 시뮬레이션 이미지: 넣었으면 included, 못 만들었으면 제외 문구 */
  image: { included: true; caption: string } | { included: false; text: string };
  income: DocBlock;
  price: DocBlock;
  effects: string[];
  purchaseGuide: { heading: string; lines: string[] };
  disclaimer: string;
}

const won = (n: number) => n.toLocaleString("ko-KR");

/** 한국 시간 기준 "2026년 11월 12일" */
export function dateTextKST(now: Date): string {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}년 ${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일`;
}

function incomeBlock(income: Calc<IncomeRange>): DocBlock {
  if (!income.ok) {
    return { headline: `예상 수익을 계산할 수 없어요. ${income.message}`, lines: [], mark: null, notice: MESSAGES.incomeNotice, failed: true };
  }
  const none = income.min === 0 && income.max === 0;
  const lines = [`계산식: ${income.formula}`];
  for (const u of income.used) {
    lines.push(`${u.item}: ${won(u.min)}~${won(u.max)} ${u.unit} · 출처 ${u.source} · 기준 연도 ${u.baseYear}`);
  }
  if (income.used.length === 0) lines.push("소공원은 직접 수익보다 기대효과가 중심이에요.");
  return {
    headline: none ? "직접 수익 없음" : `연 ${formatWon(income.min)} ~ ${formatWon(income.max)}`,
    lines,
    mark: income.basedOnUserEdited ? MESSAGES.userEditedBasis : null,
    notice: MESSAGES.incomeNotice,
    failed: false,
  };
}

function priceBlock(price: Calc<PurchasePrice>): DocBlock {
  if (!price.ok) {
    return { headline: `예상 매수 가격을 계산할 수 없어요. ${price.message}`, lines: [], mark: null, notice: MESSAGES.priceNotice, failed: true };
  }
  const lines = [
    `계산식: ${price.formula}`,
    `토지분 ${formatWon(price.landAmount)}${price.buildingAmount !== null ? ` + 건물분(시가표준액) ${formatWon(price.buildingAmount)}` : ""}`,
  ];
  if (price.buildingExcluded) lines.push(MESSAGES.buildingExcluded);
  return {
    headline: `약 ${formatWon(price.amount)}`,
    lines,
    mark: price.basedOnUserEdited ? MESSAGES.userEditedBasis : null,
    notice: MESSAGES.priceNotice,
    failed: false,
  };
}

function oldBuildingNote(old: OldBuilding | null): string | null {
  if (!old) return null;
  if (old.status === "old") return `${MESSAGES.oldBuilding} (사용승인 후 ${old.years}년)`;
  if (old.status === "unknown") return "사용승인일 확인 필요 — 30년 이상 된 건물이면 안전진단이 필요해요.";
  return null;
}

export function buildProposalDoc(opts: {
  reviewed: ReviewedValues;
  proposal: ProposalDocInput;
  /** 시뮬레이션 이미지를 PDF에 넣을 수 있는지 (실패·횟수 소진이면 false) */
  imageIncluded: boolean;
  now?: Date;
}): ProposalDoc {
  const { reviewed: r, proposal: p } = opts;
  const site: ProposalDoc["site"] = [
    { label: "소재지", value: r.address },
    { label: "지목", value: r.landCategory || "-" },
    { label: "용도지역", value: r.zone || "-" },
    { label: "면적", value: `${r.area.toLocaleString("ko-KR")}㎡` },
  ];
  if (r.building) {
    site.push({ label: "주용도", value: r.building.mainPurpose || "-" });
    site.push({ label: "연면적", value: r.building.totalFloorArea !== null ? `${r.building.totalFloorArea.toLocaleString("ko-KR")}㎡` : "-" });
    site.push({ label: "사용승인일", value: r.building.approvalDate || "확인 필요" });
  }
  return {
    title: "개발 제안서",
    serviceName: SERVICE_NAME,
    dateText: dateTextKST(opts.now ?? new Date()),
    theme: p.theme,
    site,
    edited: r.edited.map((k) => EDITED_LABELS[k]),
    editedLabel: MESSAGES.userEdited,
    oldBuildingNote: oldBuildingNote(p.oldBuilding),
    image: opts.imageIncluded
      ? { included: true, caption: "현재 사진과 개발 후 (AI가 만든 예시 이미지, 실제 개발 결과와 다를 수 있는 참고용)" }
      : { included: false, text: MESSAGES.imageFailed },
    income: incomeBlock(p.income),
    price: priceBlock(p.price),
    effects: p.effects.sentences,
    purchaseGuide: { heading: MESSAGES.purchaseGuideHeading, lines: [...MESSAGES.purchaseGuide] },
    disclaimer: MESSAGES.disclaimer,
  };
}

/** PDF 파일 이름. 예) 국유지신호등_제안서_20261112.pdf */
export function pdfFileName(now: Date = new Date()): string {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const ymd = `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}${String(k.getUTCDate()).padStart(2, "0")}`;
  return `국유지신호등_제안서_${ymd}.pdf`;
}
