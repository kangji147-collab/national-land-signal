// Design Ref: §6 — /api/judge 에 보내는 값의 모양과, 확인·수정을 마친 값에서 그것을 만드는 규칙. (브라우저·서버 공용, 순수 규칙)
// 판정은 서버가 규칙표로 하고, 브라우저는 "민원인이 확인·수정한 값 + 질문 답"만 보낸다. (PRD must 1 규칙 7)
import { questionsFor } from "./questions";
import type { ReviewedValues } from "./review";
import type { Answer, PropertyType, QuestionKey, Region } from "./types";

export interface JudgeRequest {
  type: PropertyType;
  /** 지목 */
  landCategory: string;
  /** 용도지역 */
  zone: string;
  /** 판정에 쓰는 다른 법령 지역·지구 ("포함"·"저촉"만. 참고용 "접함"은 보내지 않는다) */
  otherZones: string[];
  answers: Partial<Record<QuestionKey, Answer>>;
  /** 필지 면적(㎡) — 면적 규칙(처분기준 제5조)에 쓴다 */
  area?: number;
  /** 소재지 구분 (주소 글자는 서버로 보내지 않고 구분만 보낸다) */
  region?: Region;
}

const METRO = /^(서울|부산|대구|인천|광주|대전|울산)(특별시|광역시)?(\s|$)/;

/**
 * 소재지 구분: 특별시·광역시면 metro, 그 밖(시·군 지역, 세종특별자치시 포함)이면 other.
 * 주소를 알 수 없으면 기준이 더 엄격한 metro 로 본다. (확실하지 않으면 🟢로 판정하지 않는다)
 */
export function regionOf(address: string): Region {
  const a = address.trim();
  if (a === "") return "metro";
  return METRO.test(a) ? "metro" : "other";
}

/**
 * 확인·수정을 마친 값과 질문 답으로 판정 요청을 만든다.
 *  - 이 진단 종류에 해당하는 질문의 답만 담는다. (토지인데 건물 진단 때의 안전진단 답이 섞이지 않게)
 *  - 참고용 지역지구(referenceZones)는 판정에 쓰지 않으므로 담지 않는다.
 */
export function buildJudgeRequest(
  reviewed: Pick<ReviewedValues, "mode" | "landCategory" | "zone" | "zones" | "area" | "address">,
  answers: Partial<Record<QuestionKey, Answer | null | undefined>>,
): JudgeRequest {
  const picked: Partial<Record<QuestionKey, Answer>> = {};
  for (const q of questionsFor(reviewed.mode)) {
    const a = answers[q.key];
    if (a === "yes" || a === "no" || a === "unknown") picked[q.key] = a;
  }
  return {
    type: reviewed.mode,
    landCategory: reviewed.landCategory,
    zone: reviewed.zone,
    otherZones: [...reviewed.zones],
    answers: picked,
    area: reviewed.area,
    region: regionOf(reviewed.address),
  };
}
