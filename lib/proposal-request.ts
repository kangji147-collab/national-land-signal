// Design Ref: §6 — /api/proposal 에 보내는 값의 모양과, 확인·수정을 마친 값에서 그것을 만드는 규칙. (브라우저·서버 공용, 순수 규칙)
// 서버는 이 값으로 🟢인지·허용 테마인지 다시 확인하고, 수익·매수 가격을 단가표로 계산한다.
import { type JudgeRequest, buildJudgeRequest } from "./judge-request";
import type { EditedKey, ReviewedValues } from "./review";
import type { PlacedCount } from "./layout";
import type { Answer, QuestionKey } from "./types";

export interface ProposalRequest extends JudgeRequest {
  theme: string;
  /** 토지 면적(㎡) */
  area: number;
  /** 개별공시지가(원/㎡) — 모르면 null (예상 매수 가격은 계산하지 않는다) */
  officialPrice: number | null;
  /** 건물 연면적(㎡) — 건물일 때 */
  totalFloorArea: number | null;
  /** 건물 시가표준액(원) — 민원인이 알 때만 */
  buildingStandardValue: number | null;
  /** 사용승인일 "YYYY-MM-DD" (노후 여부 확인용, 모르면 빈 글자) */
  approvalDate: string;
  /** 민원인이 고친 항목 */
  edited: EditedKey[];
  /** 배치 시뮬레이터에서 놓은 시설물 이름·개수 (안 썼으면 빈 목록) */
  layout: PlacedCount[];
}

export function buildProposalRequest(
  reviewed: ReviewedValues,
  answers: Partial<Record<QuestionKey, Answer | null | undefined>>,
  theme: string,
  buildingStandardValue: number | null,
  layout: PlacedCount[] = [],
): ProposalRequest {
  return {
    ...buildJudgeRequest(reviewed, answers),
    theme,
    area: reviewed.area,
    officialPrice: reviewed.officialPrice,
    totalFloorArea: reviewed.building?.totalFloorArea ?? null,
    buildingStandardValue: reviewed.mode === "building" ? buildingStandardValue : null,
    approvalDate: reviewed.building?.approvalDate ?? "",
    edited: [...reviewed.edited],
    layout: layout.map((l) => ({ name: l.name, count: l.count })),
  };
}

/**
 * 건물 시가표준액 입력 글자 → 값. (비우면 null = "건물분 미포함")
 * 0 이상의 정수(원 단위)만 받는다. 소수·음수·글자·너무 큰 수는 error.
 */
export function parseStandardValue(text: string): { value: number | null; error?: string } {
  const t = text.replace(/[,\s]/g, "");
  if (t === "") return { value: null };
  if (!/^\d+$/.test(t)) return { value: null, error: "0 이상의 숫자(원 단위)로 입력해 주세요" };
  const n = Number(t);
  if (!Number.isSafeInteger(n) || n > 1e15) return { value: null, error: "너무 큰 금액이에요. 다시 확인해 주세요" };
  return { value: n };
}
