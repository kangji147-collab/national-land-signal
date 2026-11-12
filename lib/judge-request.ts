// Design Ref: §6 — /api/judge 에 보내는 값의 모양과, 확인·수정을 마친 값에서 그것을 만드는 규칙. (브라우저·서버 공용, 순수 규칙)
// 판정은 서버가 규칙표로 하고, 브라우저는 "민원인이 확인·수정한 값 + 질문 답"만 보낸다. (PRD must 1 규칙 7)
import { questionsFor } from "./questions";
import type { ReviewedValues } from "./review";
import type { Answer, PropertyType, QuestionKey } from "./types";

export interface JudgeRequest {
  type: PropertyType;
  /** 지목 */
  landCategory: string;
  /** 용도지역 */
  zone: string;
  /** 판정에 쓰는 다른 법령 지역·지구 ("포함"·"저촉"만. 참고용 "접함"은 보내지 않는다) */
  otherZones: string[];
  answers: Partial<Record<QuestionKey, Answer>>;
}

/**
 * 확인·수정을 마친 값과 질문 답으로 판정 요청을 만든다.
 *  - 이 진단 종류에 해당하는 질문의 답만 담는다. (토지인데 건물 진단 때의 안전진단 답이 섞이지 않게)
 *  - 참고용 지역지구(referenceZones)는 판정에 쓰지 않으므로 담지 않는다.
 */
export function buildJudgeRequest(
  reviewed: Pick<ReviewedValues, "mode" | "landCategory" | "zone" | "zones">,
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
  };
}
